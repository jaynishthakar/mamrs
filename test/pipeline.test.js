import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database.js';
import { seedArtistJobs, runPipeline, stageRecording, bootstrapEnrichment, exportReview, applyReviewedLabels } from '../src/catalogPipeline.js';
import { enqueueJob, claimJob, finishJob, acquireWorker, releaseWorker } from '../src/pipelineQueue.js';
import { enrichTrack } from '../src/trackEnrichment.js';
import { ingestTrack } from '../src/ingestion.js';
const artistId = '11111111-1111-1111-1111-111111111111';
const mbid = '22222222-2222-2222-2222-222222222222';
const raw = { mbid, source: 'MusicBrainz', title: 'A real recording', artist: 'Kishore Kumar', artists: [{ id: `musicbrainz:${artistId}`, name: 'Kishore Kumar' }], duration: 200, language: 'Unknown', moodScores: {}, activityScores: {} };

test('pipeline discovers, quarantines invalid rows, enriches evidence and publishes ready songs', async () => {
  const db = openDatabase(':memory:');
  const base = Date.now() + 10000;
  const providers = { musicbrainz: {
    async searchArtists(name) { return name === 'Ambiguous' ? [{ name, id: artistId }, { name, id: mbid }] : [{ name, id: artistId, country: 'IN' }]; },
    async recordings() { return { songs: [raw, { title: 'Bogus' }], nextOffset: null }; },
    async track() { return { ...raw, workLanguages: ['hin'], workIds: [mbid], providerTags: [{ name: 'romantic', count: 5 }, { name: 'driving', count: 4 }] }; }
  } };
  try {
    await seedArtistJobs(db, [{ provider: 'musicbrainz', name: 'Kishore Kumar', country: 'IN' }, { provider: 'musicbrainz', name: 'Ambiguous' }], { now: base });
    const summary = await runPipeline(db, { providers, now: () => base, maxJobs: 10 });
    assert.equal(summary.failed, 1); assert.equal(summary.rejected, 1); assert.equal(summary.published, 1);
    const staged = db.prepare('SELECT song_id,status FROM catalog_imports WHERE source_key=?').get(`musicbrainz:${mbid}`);
    assert.equal(staged.status, 'ready');
    const song = JSON.parse(db.prepare('SELECT metadata FROM songs WHERE id=?').get(staged.song_id).metadata);
    assert.equal(song.language, 'Hindi'); assert.equal(song.isCatalog, true);
    assert.ok(song.moodScores.Romantic > 0); assert.ok(song.activityScores.Driving > 0);
    assert.equal(song.labelEvidence.length, 3);
    const again = await runPipeline(db, { providers, now: () => base, maxJobs: 10 });
    assert.equal(again.processed, 0);
  } finally { db.close(); }
});

test('provider failures back off, respect retry-after and resume the same recording', async () => {
  const db = openDatabase(':memory:');
  let time = Date.now() + 10000, calls = 0;
  const providers = { musicbrainz: { async track() {
    calls++;
    if (calls === 1) throw Object.assign(new Error('Rate limited'), { status: 503, retryAfterMs: 120000 });
    return raw;
  } } };
  try {
    await ingestTrack(db, raw);
    const first = await runPipeline(db, { providers, now: () => time });
    assert.equal(first.retried, 1);
    assert.equal((await runPipeline(db, { providers, now: () => time })).processed, 0);
    time += 120001;
    assert.equal((await runPipeline(db, { providers, now: () => time })).completed, 1);
    assert.equal(calls, 2);
    assert.equal((await exportReview(db))[0].labelsReviewed, false);
    assert.equal((await exportReview(db))[0].sourceKey, `musicbrainz:${mbid}`);
  } finally { db.close(); }
});

test('expired job claims recover and stale workers cannot finalize a newer claim', async () => {
  const db = openDatabase(':memory:');
  try {
    await enqueueJob(db, 'test', 'enrich', {}, { now: 1000 });
    const first = await claimJob(db, { now: 1000, leaseMs: 100 });
    const second = await claimJob(db, { now: 1200, leaseMs: 100 });
    assert.notEqual(first.lease_token, second.lease_token);
    assert.equal(await finishJob(db, first, {}, { now: 1200 }), 0);
    assert.equal(await finishJob(db, second, {}, { now: 1200 }), 1);
    const token = await acquireWorker(db, { now: 1000 });
    assert.equal(await acquireWorker(db, { now: 1001 }), null);
    await releaseWorker(db, token);
    assert.ok(await acquireWorker(db, { now: 1001 }));
  } finally { db.close(); }
});

test('metadata enrichment does not infer moods from genres or language from release text', () => {
  const song = enrichTrack({ ...raw, genre: 'Rock', releaseLanguage: 'hin', workLanguages: ['hin', 'ben'], providerTags: [{ name: 'Romantic', count: 1 }, { name: 'workout', count: 2 }] });
  assert.equal(song.language, 'Unknown'); assert.deepEqual(song.moodScores, {}); assert.deepEqual(song.activityScores, {});
  assert.equal(enrichTrack({ ...raw, workLanguages: ['tam'] }).language, 'Tamil');
});

test('existing personal imports can be queued and reviewed labels survive automatic enrichment', async () => {
  const db = openDatabase(':memory:');
  try {
    await stageRecording(db, raw);
    assert.equal((await bootstrapEnrichment(db)).queued, 1);
    await ingestTrack(db, { ...raw, moodScores: { Sad: .9 }, activityScores: { Driving: .8 }, language: 'Bengali', labelsReviewed: true, labelSource: 'Human review' });
    const result = await runPipeline(db, { providers: { musicbrainz: { async track() { return { ...raw, workLanguages: ['hin'], providerTags: [{ name: 'Happy', count: 9 }, { name: 'Workout', count: 9 }] }; } } } });
    assert.equal(result.published, 1);
    const staged = db.prepare('SELECT song_id FROM catalog_imports WHERE source_key=?').get(`musicbrainz:${mbid}`);
    const song = JSON.parse(db.prepare('SELECT metadata FROM songs WHERE id=?').get(staged.song_id).metadata);
    assert.deepEqual(song.moodScores, { Sad: .9 }); assert.equal(song.language, 'Bengali');
  } finally { db.close(); }
});

test('review publication validates all labels before writing and makes the existing song available', async () => {
  const db = openDatabase(':memory:');
  try {
    const staged = await stageRecording(db, raw);
    const draft = (await exportReview(db))[0];
    const valid = { ...draft, moodScores: { Romantic: .8 }, activityScores: { Driving: .7 }, language: 'Hindi', labelSource: 'Operator review', labelsReviewed: true };
    await assert.rejects(applyReviewedLabels(db, [valid, { ...valid, moodScores: { Wrong: 1 } }]), /Invalid moodScores/);
    assert.equal(JSON.parse(db.prepare('SELECT metadata FROM songs WHERE id=?').get(staged.song.id).metadata).isCatalog, false);
    assert.deepEqual(await applyReviewedLabels(db, [valid]), { updated: 1, published: 1 });
    const published = JSON.parse(db.prepare('SELECT metadata FROM songs WHERE id=?').get(staged.song.id).metadata);
    assert.equal(published.isCatalog, true); assert.equal(published.labelsReviewed, true);
    assert.equal((await exportReview(db)).length, 0);
  } finally { db.close(); }
});
