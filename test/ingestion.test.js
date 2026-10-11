import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database.js';
import { ingestTrack } from '../src/ingestion.js';
import { cleanTrack } from '../src/catalogQuality.js';
import { runCatalogJobs } from '../scripts/catalog-worker.js';
const artistId = '11111111-1111-1111-1111-111111111111';
const track = { mbid: '22222222-2222-2222-2222-222222222222', title: 'Test recording', artist: 'Test artist', duration: 200, genre: 'Hip-Hop', source: 'MusicBrainz', moodScores: {}, activityScores: {} };

test('staging is idempotent, cross-source duplicates converge, reviewed labels survive refresh', async () => {
  const db = openDatabase(':memory:');
  try {
    const a = await ingestTrack(db, track, { shared: true });
    assert.equal(a.song.catalogStatus, 'pending');
    assert.equal(a.song.isCatalog, false);
    const b = await ingestTrack(db, track);
    assert.equal(a.song.id, b.song.id);
    const discogs = { ...track, mbid: undefined, discogsId: '99:A1', source: 'Discogs' };
    const c = await ingestTrack(db, discogs);
    assert.equal(c.song.id, a.song.id);
    const labeled = await ingestTrack(db, { ...track, moodScores: { Happy: .8 }, activityScores: { Study: .7 }, labelsReviewed: true, language: 'Hindi', labelSource: 'Reviewed' }, { shared: true });
    assert.equal(labeled.song.catalogStatus, 'ready');
    assert.equal(labeled.song.isCatalog, true);
    const refreshed = await ingestTrack(db, track);
    assert.equal(refreshed.song.catalogStatus, 'ready');
    assert.equal(refreshed.song.language, 'Hindi');
    assert.deepEqual(refreshed.song.moodScores, { Happy: .8 });
    const remix = await ingestTrack(db, { ...track, mbid: '33333333-3333-3333-3333-333333333333', title: 'Test recording (Live)' });
    assert.notEqual(remix.song.id, a.song.id);
    assert.equal(cleanTrack({ ...track, source: 'Discogs', discogsId: '99' }).catalogStatus, 'needs_review');
  } finally { db.close(); }
});

test('worker resumes pagination and retries failed pages without duplicating tracks', async () => {
  const db = openDatabase(':memory:');
  let failure = true;
  const calls = [];
  const providers = { musicbrainz: { async recordings(id, offset) {
    calls.push(offset);
    if (offset === 50 && failure) { failure = false; throw new Error('Rate limited'); }
    return { songs: [track], nextOffset: offset === 0 ? 50 : null };
  } } };
  try {
    const artists = [{ provider: 'musicbrainz', artistId }];
    await runCatalogJobs(db, artists, { providers });
    assert.equal((await runCatalogJobs(db, artists, { providers })).failed, 1);
    await runCatalogJobs(db, artists, { providers });
    assert.deepEqual(calls, [0, 50, 50]);
    assert.equal(db.prepare('SELECT status FROM catalog_jobs').get().status, 'complete');
    assert.equal(db.prepare('SELECT count(*) AS count FROM catalog_imports').get().count, 1);
  } finally { db.close(); }
});

test('failed transactions roll back every catalog write', async () => {
  const db = openDatabase(':memory:');
  try {
    await assert.rejects(ingestTrack(db, track, { userId: 999 }), /FOREIGN KEY/);
    assert.equal(db.prepare('SELECT count(*) AS count FROM catalog_imports').get().count, 0);
  } finally { db.close(); }
});

test('artist-name discovery requires a unique identity and never guesses between namesakes', async () => {
  const db = openDatabase(':memory:');
  const providers = { musicbrainz: {
    async searchArtists() { return [{ id: artistId, name: 'Test Artist', country: 'IN' }, { id: '44444444-4444-4444-4444-444444444444', name: 'Test Artist', country: 'GB' }]; },
    async recordings() { return { songs: [track], nextOffset: null }; }
  } };
  try {
    await assert.rejects(runCatalogJobs(db, [{ provider: 'musicbrainz', name: 'Test Artist' }], { providers }), /ambiguous/);
    const out = await runCatalogJobs(db, [{ provider: 'musicbrainz', name: 'Test Artist', country: 'IN' }], { providers });
    assert.equal(out.tracks, 1);
  } finally { db.close(); }
});
