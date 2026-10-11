import { randomUUID } from 'node:crypto';

export const pipelineSchema = `
CREATE TABLE IF NOT EXISTS ingestion_jobs (
  job_key TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
  next_run TEXT NOT NULL, lease_token TEXT, lease_until TEXT, error TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ingestion_job_schedule ON ingestion_jobs(status,next_run);
CREATE TABLE IF NOT EXISTS ingestion_locks (lock_key TEXT PRIMARY KEY, lease_token TEXT NOT NULL, lease_until TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ingestion_events (event_key TEXT PRIMARY KEY, job_key TEXT NOT NULL, outcome TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL);
`;

export async function enqueueJob(db, jobKey, kind, payload, { now = Date.now(), refresh = false } = {}) {
  const time = new Date(now).toISOString();
  await db.prepare('INSERT OR IGNORE INTO ingestion_jobs(job_key,kind,payload,next_run,updated_at) VALUES (?,?,?,?,?)').run(jobKey, kind, JSON.stringify(payload), time, time);
  if (refresh) await db.prepare("UPDATE ingestion_jobs SET status='pending',attempts=0,error=NULL,payload=?,next_run=?,updated_at=? WHERE job_key=? AND status IN ('complete','failed')").run(JSON.stringify(payload), time, time, jobKey);
}

export async function claimJob(db, { now = Date.now(), leaseMs = 300000 } = {}) {
  const time = new Date(now).toISOString(), until = new Date(now + leaseMs).toISOString(), token = randomUUID();
  return db.withTransaction(async () => {
    // Expired claims can be reclaimed; an old worker cannot finalize the new claim.
    await db.prepare("UPDATE ingestion_jobs SET status='retry',lease_token=NULL,lease_until=NULL WHERE status='processing' AND lease_until<=?").run(time);
    const row = await db.prepare("SELECT job_key FROM ingestion_jobs WHERE status IN ('pending','retry') AND next_run<=? ORDER BY next_run,job_key LIMIT 1").get(time);
    if (!row) return null;
    const job = await db.prepare("UPDATE ingestion_jobs SET status='processing',attempts=attempts+1,lease_token=?,lease_until=?,updated_at=? WHERE job_key=? AND status IN ('pending','retry') RETURNING *").get(token, until, time, row.job_key);
    return job ? { ...job, payload: JSON.parse(job.payload) } : null;
  });
}

export async function finishJob(db, job, details, { now = Date.now(), error = null, maxAttempts = 5 } = {}) {
  const time = new Date(now).toISOString();
  const retryable = error && ![400, 401, 403, 404, 422].includes(error.status) && job.attempts < maxAttempts;
  const delay = Math.max(Number(error?.retryAfterMs) || 0, Math.min(3600000, 30000 * 2 ** (job.attempts - 1)));
  const status = error ? retryable ? 'retry' : 'failed' : 'complete';
  return db.withTransaction(async () => {
    const result = await db.prepare('UPDATE ingestion_jobs SET status=?,error=?,next_run=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE job_key=? AND lease_token=? AND status=\'processing\'').run(status, error?.message || null, new Date(now + (retryable ? delay : 0)).toISOString(), time, job.job_key, job.lease_token);
    if (result.changes) await db.prepare('INSERT INTO ingestion_events(event_key,job_key,outcome,details,created_at) VALUES (?,?,?,?,?)').run(randomUUID(), job.job_key, status, JSON.stringify(details || {}), time);
    return result.changes;
  });
}

export async function acquireWorker(db, { now = Date.now(), leaseMs = 300000 } = {}) {
  const token = randomUUID(), time = new Date(now).toISOString(), until = new Date(now + leaseMs).toISOString();
  const row = await db.prepare('INSERT INTO ingestion_locks(lock_key,lease_token,lease_until) VALUES (?,?,?) ON CONFLICT(lock_key) DO UPDATE SET lease_token=excluded.lease_token,lease_until=excluded.lease_until WHERE ingestion_locks.lease_until<=? RETURNING lease_token').get('catalog-worker', token, until, time);
  return row?.lease_token === token ? token : null;
}

export async function renewWorker(db, token, { now = Date.now(), leaseMs = 300000 } = {}) {
  return (await db.prepare('UPDATE ingestion_locks SET lease_until=? WHERE lock_key=? AND lease_token=?').run(new Date(now + leaseMs).toISOString(), 'catalog-worker', token)).changes > 0;
}
export async function releaseWorker(db, token) {
  await db.prepare('DELETE FROM ingestion_locks WHERE lock_key=? AND lease_token=?').run('catalog-worker', token);
}
