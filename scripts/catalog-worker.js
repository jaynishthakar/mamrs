import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../src/database.js';
import { createMusicBrainz, validMbid } from '../src/musicbrainz.js';
import { createDiscogs } from '../src/discogs.js';
import { ingestTrack } from '../src/ingestion.js';
import { normalize } from '../src/catalogQuality.js';

export async function runCatalogJobs(db, artists, { maxPages = 1, providers = { musicbrainz: createMusicBrainz(), discogs: createDiscogs() } } = {}) {
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new Error('maxPages must be 1–100.');
  for (const rawEntry of artists) {
    let entry = rawEntry;
    if (!entry.artistId && entry.name && providers[entry.provider]) {
      const matches = (await providers[entry.provider].searchArtists(entry.name)).filter(a => normalize(a.name) === normalize(entry.name) && (!entry.country || a.country === entry.country));
      if (matches.length !== 1) throw new Error(`Resolve ambiguous artist ${entry.name} to a provider artistId in the configuration.`);
      entry = { ...entry, artistId: matches[0].id };
    }
    if (!['musicbrainz', 'discogs'].includes(entry.provider) || !(entry.provider === 'musicbrainz' ? validMbid(entry.artistId) : /^\d+$/.test(entry.artistId))) throw new Error('Configure real provider artist identifiers.');
    await db.prepare('INSERT OR IGNORE INTO catalog_jobs(job_key,provider,artist_id,cursor) VALUES (?,?,?,?)').run(`${entry.provider}:${entry.artistId}`, entry.provider, entry.artistId, entry.provider === 'discogs' ? 1 : 0);
  }
  const summary = { pages: 0, tracks: 0, failed: 0 };
  // A bounded page takes less than the lease window; recover interrupted processes.
  await db.prepare("UPDATE catalog_jobs SET status='error',error='Interrupted worker; retrying' WHERE status='processing' AND updated_at < ?").run(new Date(Date.now() - 15 * 60000).toISOString());
  const jobs = await db.prepare("SELECT * FROM catalog_jobs WHERE status IN ('pending','error') ORDER BY updated_at,job_key").all();
  for (const job of jobs) {
    if (summary.pages >= maxPages) break;
    const claimed = await db.prepare("UPDATE catalog_jobs SET status='processing',updated_at=? WHERE job_key=? AND status IN ('pending','error') RETURNING job_key").get(new Date().toISOString(), job.job_key);
    if (!claimed) continue;
    try {
      const page = await providers[job.provider].recordings(job.artist_id, job.cursor);
      for (const raw of page.songs) { await ingestTrack(db, raw, { shared: true }); summary.tracks++; }
      await db.prepare('UPDATE catalog_jobs SET cursor=?,status=?,error=NULL,updated_at=? WHERE job_key=?').run(page.nextOffset ?? job.cursor, page.nextOffset === null ? 'complete' : 'pending', new Date().toISOString(), job.job_key);
    } catch (error) {
      summary.failed++;
      await db.prepare("UPDATE catalog_jobs SET status='error',error=?,updated_at=? WHERE job_key=?").run(error.message, new Date().toISOString(), job.job_key);
    }
    summary.pages++;
  }
  return summary;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = openDatabase(process.env.DATABASE_URL || process.env.DATABASE_PATH || resolve('data/mamrs.sqlite'));
  try {
    const artists = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    if (process.env.CATALOG_REFRESH === 'true') await db.prepare("UPDATE catalog_jobs SET cursor=CASE WHEN provider='discogs' THEN 1 ELSE 0 END,status='pending' WHERE status='complete'").run();
    const result = await runCatalogJobs(db, artists, { maxPages: Number(process.argv[3] || 1) });
    console.log(JSON.stringify(result));
    if (result.failed) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { await db.close(); }
}
