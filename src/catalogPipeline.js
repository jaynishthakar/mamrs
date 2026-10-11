import { createHash } from 'node:crypto';
import { enqueueJob, claimJob, finishJob, acquireWorker, renewWorker, releaseWorker } from './pipelineQueue.js';
import { ingestTrack, sourceKey } from './ingestion.js';
import { cleanTrack, normalize } from './catalogQuality.js';
import { validMbid } from './musicbrainz.js';
import { enrichTrack, reviewDraft } from './trackEnrichment.js';
import { moods, activities } from './catalog.js';

const invalid = message => Object.assign(new Error(message), { status: 422 });
export async function seedArtistJobs(db, artists, { refresh = false, now = Date.now() } = {}) {
  if (!Array.isArray(artists)) throw invalid('Artist configuration must be an array.');
  for (const artist of artists) {
    if (!artist || !['musicbrainz', 'discogs'].includes(artist.provider) || !artist.artistId && !artist.name) throw invalid('Each artist needs a provider and artistId or name.');
    if (artist.artistId && !(artist.provider === 'musicbrainz' ? validMbid(artist.artistId) : /^\d+$/.test(artist.artistId))) throw invalid('Invalid provider artist ID.');
  }
  for (const artist of artists) {
    const identity = artist.artistId || `${normalize(artist.name)}:${artist.country || ''}`;
    await enqueueJob(db, `artist:${artist.provider}:${identity}`, 'artist', artist, { refresh, now });
  }
  return { queued: artists.length };
}

export async function stageRecording(db, raw, { shared = false } = {}) {
  try {
    if (!raw || !validMbid(raw.mbid) && !/^\d+:.+$/.test(raw.discogsId || '')) throw invalid('Imports require genuine recording or release-track IDs.');
    sourceKey(raw); cleanTrack(raw);
  }
  catch (error) {
    const serialized = JSON.stringify(raw) ?? 'null';
    const key = `rejected:${createHash('sha256').update(serialized).digest('hex')}`;
    await db.prepare('INSERT INTO catalog_imports(source_key,raw_metadata,status,issues) VALUES (?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET issues=excluded.issues,updated_at=CURRENT_TIMESTAMP').run(key, serialized, 'rejected', JSON.stringify([error.message]));
    return { rejected: true, error: error.message };
  }
  return { rejected: false, ...await ingestTrack(db, raw, { shared }) };
}

export async function bootstrapEnrichment(db, { limit = 1000, now = Date.now(), refresh = false } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100000) throw invalid('Limit must be 1–100000.');
  // Includes existing personal imports; publication still requires contextual labels.
  const rows = await db.prepare("SELECT source_key FROM catalog_imports WHERE source_key LIKE 'musicbrainz:%' AND status='pending' ORDER BY source_key LIMIT ?").all(limit);
  for (const row of rows) await enqueueJob(db, `enrich:${row.source_key}`, 'enrich', { sourceKey: row.source_key }, { now, refresh });
  return { queued: rows.length };
}

export async function runPipeline(db, { providers, maxJobs = 20, now = () => Date.now(), refresh = false } = {}) {
  if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > 1000) throw invalid('maxJobs must be 1–1000.');
  const token = await acquireWorker(db, { now: now() });
  const summary = { processed: 0, completed: 0, retried: 0, failed: 0, staged: 0, rejected: 0, published: 0, busy: !token };
  if (!token) return summary;
  try {
    for (let i = 0; i < maxJobs; i++) {
      if (!await renewWorker(db, token, { now: now() })) break;
      const job = await claimJob(db, { now: now() });
      if (!job) break;
      let details = {};
      try {
        const payload = job.payload;
        if (job.kind === 'artist') {
          const provider = providers[payload.provider];
          if (!provider) throw invalid(`Provider ${payload.provider} is not configured.`);
          let artistId = payload.artistId;
          if (!artistId) {
            const matches = (await provider.searchArtists(payload.name)).filter(a => normalize(a.name) === normalize(payload.name) && (!payload.country || a.country === payload.country));
            if (matches.length !== 1) throw invalid(`Artist ${payload.name} is ambiguous or missing. Pin its provider artistId.`);
            artistId = matches[0].id;
          }
          if (!(payload.provider === 'musicbrainz' ? validMbid(artistId) : /^\d+$/.test(artistId))) throw invalid('Provider returned an invalid artist ID.');
          const cursor = payload.provider === 'discogs' ? 1 : 0;
          await enqueueJob(db, `page:${payload.provider}:${artistId}:${cursor}`, 'page', { provider: payload.provider, artistId, cursor }, { now: now(), refresh });
          details = { artistId };
        } else if (job.kind === 'page') {
          const provider = providers[payload.provider];
          if (!provider) throw invalid(`Provider ${payload.provider} is not configured.`);
          const page = await provider.recordings(payload.artistId, payload.cursor);
          if (!Array.isArray(page.songs) || page.nextOffset !== null && (!Number.isInteger(page.nextOffset) || page.nextOffset <= payload.cursor)) throw invalid('Invalid provider pagination.');
          let staged = 0, rejected = 0;
          for (const raw of page.songs) {
            if (!await renewWorker(db, token, { now: now() })) throw new Error('Worker lease was lost.');
            const outcome = await stageRecording(db, raw, { shared: true });
            outcome.rejected ? rejected++ : staged++;
          }
          if (page.nextOffset !== null) await enqueueJob(db, `page:${payload.provider}:${payload.artistId}:${page.nextOffset}`, 'page', { ...payload, cursor: page.nextOffset }, { now: now(), refresh });
          summary.staged += staged; summary.rejected += rejected;
          details = { staged, rejected, nextCursor: page.nextOffset };
        } else if (job.kind === 'enrich') {
          const row = await db.prepare('SELECT song_id,raw_metadata FROM catalog_imports WHERE source_key=?').get(payload.sourceKey);
          if (!row?.song_id) throw invalid('Recording is not staged.');
          const raw = JSON.parse(row.raw_metadata);
          const provider = providers.musicbrainz;
          if (!raw.mbid || !provider?.track) throw invalid('Recording enrichment requires a MusicBrainz recording ID.');
          const fetched = await provider.track(raw.mbid);
          if (sourceKey(fetched) !== payload.sourceKey) throw invalid('Provider returned a different recording.');
          if (!await renewWorker(db, token, { now: now() })) throw new Error('Worker lease was lost.');
          const enriched = enrichTrack(fetched, { now: now() });
          const result = await ingestTrack(db, enriched, { shared: true });
          summary.published += Number(result.song.isCatalog);
          details = { songId: result.song.id, status: result.song.catalogStatus, labelEvidence: enriched.labelEvidence };
        } else throw invalid(`Unknown job kind: ${job.kind}`);
        await finishJob(db, job, details, { now: now() }); summary.completed++;
      } catch (error) {
        await finishJob(db, job, { message: error.message }, { now: now(), error });
        const status = (await db.prepare('SELECT status FROM ingestion_jobs WHERE job_key=?').get(job.job_key))?.status;
        status === 'retry' ? summary.retried++ : summary.failed++;
      }
      summary.processed++;
    }
    return summary;
  } finally { await releaseWorker(db, token); }
}

export async function pipelineStatus(db) {
  return { jobs: await db.prepare('SELECT status,count(*) AS count FROM ingestion_jobs GROUP BY status').all(),
    catalog: await db.prepare('SELECT status,count(*) AS count FROM catalog_imports GROUP BY status').all(),
    failures: await db.prepare("SELECT job_key,attempts,error,next_run FROM ingestion_jobs WHERE status IN ('retry','failed') ORDER BY updated_at DESC LIMIT 20").all() };
}

export async function exportReview(db, { limit = 1000 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100000) throw invalid('Review limit must be 1–100000.');
  const rows = await db.prepare("SELECT ci.source_key,s.metadata FROM catalog_imports ci JOIN songs s ON s.id=ci.song_id WHERE ci.status IN ('pending','needs_review') ORDER BY ci.source_key LIMIT ?").all(limit);
  return rows.map(row => reviewDraft(JSON.parse(row.metadata), row.source_key));
}

export async function applyReviewedLabels(db, labels) {
  if (!Array.isArray(labels) || !labels.length) throw invalid('Supply a nonempty array of reviewed labels.');
  const records = [];
  for (const label of labels) {
    if (!label || typeof label.sourceKey !== 'string' || typeof label.labelSource !== 'string' || !label.labelSource.trim() || label.labelsReviewed !== true) throw invalid('Each label needs sourceKey, labelSource and labelsReviewed: true.');
    for (const [field, allowed] of [['moodScores', moods], ['activityScores', activities]]) {
      const scores = label[field];
      if (!scores || typeof scores !== 'object' || Array.isArray(scores) || !Object.keys(scores).length || !Object.entries(scores).every(([key, value]) => allowed.includes(key) && Number.isFinite(value) && value > 0 && value <= 1)) throw invalid(`Invalid ${field} for ${label.sourceKey}.`);
    }
    if (label.language !== undefined && (typeof label.language !== 'string' || !label.language.trim() || label.language.length > 100)) throw invalid('Invalid language label.');
    if (label.labelVersion !== undefined && (!Number.isInteger(label.labelVersion) || label.labelVersion < 1)) throw invalid('Label version must be a positive integer.');
    const row = await db.prepare('SELECT raw_metadata FROM catalog_imports WHERE source_key=?').get(label.sourceKey);
    if (!row) throw invalid(`Unknown staged source: ${label.sourceKey}`);
    records.push({ raw: JSON.parse(row.raw_metadata), label });
  }
  let published = 0;
  for (const { raw, label } of records) {
    const result = await ingestTrack(db, { ...raw, moodScores: label.moodScores, activityScores: label.activityScores, language: label.language?.trim() || raw.language,
      labelSource: label.labelSource.trim(), labelsReviewed: true, labelVersion: label.labelVersion || 1,
      labelEvidence: [{ source: label.labelSource.trim(), reviewed: true, reviewedAt: new Date().toISOString() }] }, { shared: true });
    published += Number(result.song.isCatalog);
  }
  return { updated: records.length, published };
}
