import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { openDatabase } from '../src/database.js';
import { createMusicBrainz } from '../src/musicbrainz.js';
import { createDiscogs } from '../src/discogs.js';
import { seedArtistJobs, runPipeline, bootstrapEnrichment, pipelineStatus, exportReview, stageRecording, applyReviewedLabels } from '../src/catalogPipeline.js';

const db = openDatabase(process.env.DATABASE_URL || process.env.DATABASE_PATH || resolve('data/mamrs.sqlite'));
try {
  const [command = 'status', argument, count] = process.argv.slice(2);
  const refresh = process.env.CATALOG_REFRESH === 'true';
  let result;
  if (command === 'seed') result = await seedArtistJobs(db, JSON.parse(readFileSync(argument || 'config/catalog-artists.india.json', 'utf8')), { refresh });
  else if (command === 'run') result = await runPipeline(db, { maxJobs: Number(argument || 20), refresh, providers: { musicbrainz: createMusicBrainz(), discogs: createDiscogs() } });
  else if (command === 'watch') {
    const maxJobs = Number(argument || 20), intervalSeconds = Number(count || 60);
    if (!Number.isInteger(intervalSeconds) || intervalSeconds < 5 || intervalSeconds > 3600) throw new Error('Watch interval must be 5–3600 seconds.');
    const shutdown = new AbortController();
    const stop = () => shutdown.abort();
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    const providers = { musicbrainz: createMusicBrainz(), discogs: createDiscogs() };
    try {
      while (!shutdown.signal.aborted) {
        const batch = await runPipeline(db, { maxJobs, providers, refresh });
        if (batch.processed) console.log(JSON.stringify(batch));
        try { await delay(intervalSeconds * 1000, undefined, { signal: shutdown.signal }); }
        catch (error) { if (error.name !== 'AbortError') throw error; }
      }
    } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
    result = { stopped: true };
  }
  else if (command === 'enrich') result = await bootstrapEnrichment(db, { limit: Number(argument || 1000), refresh });
  else if (command === 'status') result = await pipelineStatus(db);
  else if (command === 'publish') {
    const drafts = JSON.parse(readFileSync(argument, 'utf8'));
    if (!Array.isArray(drafts)) throw new Error('Review file must contain an array.');
    result = await applyReviewedLabels(db, drafts.filter(draft => draft?.labelsReviewed === true));
  }
  else if (command === 'review') {
    if (!argument) throw new Error('Specify an output JSON file.');
    const drafts = await exportReview(db, { limit: Number(count || 1000) });
    writeFileSync(argument, JSON.stringify(drafts, null, 2)); result = { exported: drafts.length, file: argument };
  } else if (command === 'import') {
    const raw = readFileSync(argument, 'utf8');
    if (Buffer.byteLength(raw) > 10 * 1024 * 1024) throw new Error('Split import files into batches smaller than 10 MB.');
    const tracks = argument.endsWith('.jsonl') ? raw.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line)) : JSON.parse(raw);
    if (!Array.isArray(tracks)) throw new Error('Import a JSON array or JSONL recordings.');
    result = { imported: 0, rejected: 0 };
    for (const track of tracks) (await stageRecording(db, track)).rejected ? result.rejected++ : result.imported++;
  } else throw new Error('Use seed, run, watch, enrich, status, review, publish, or import.');
  console.log(JSON.stringify(result, null, 2));
  if (result.failed || result.retried || result.rejected) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await db.close(); }
