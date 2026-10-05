import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommend, DEFAULT_WEIGHTS } from '../src/recommendation.js';
import { catalog } from '../src/catalog.js';
const sample = (id, overrides = {}) => ({ id, genre: 'Lo-fi', artist: 'A', language: 'Hindi', moodScores: { Happy: 1 }, activityScores: { Study: 1 }, ...overrides });

test('context changes results and selected context remains a strict constraint', () => {
  const study = recommend({ songs: catalog, mood: 'Relaxed', activity: 'Study' });
  const workout = recommend({ songs: catalog, mood: 'Energetic', activity: 'Workout' });
  assert.ok(study.songs.length > 0);
  assert.notDeepEqual(study.songs.map(s => s.id), workout.songs.map(s => s.id));
  assert.ok(study.songs.every(s => s.moodScores.Relaxed > 0 && s.activityScores.Study > 0));
  assert.ok(study.songs.every((s, i, a) => !i || a[i - 1].score >= s.score));
});
test('fallback removes language then artist then genre and stops when ten exist', () => {
  const songs = Array.from({ length: 12 }, (_, i) => sample(i, { language: 'English', artist: 'B' }));
  const out = recommend({ songs, preferences: { languages: ['Hindi'], artists: ['A'], genres: ['Lo-fi'] } });
  assert.deepEqual(out.relaxed, ['language', 'artist']);
  assert.equal(out.songs.length, 10);
  assert.match(out.notices.join(' '), /language, then artist/);
  const all = recommend({ songs, preferences: { languages: ['Hindi'], artists: ['A'], genres: ['Pop'] } });
  assert.deepEqual(all.relaxed, ['language', 'artist', 'genre']);
});
test('no match yields an empty result without relaxing mood or activity', () => {
  const out = recommend({ songs: catalog, mood: 'Unknown', activity: 'Study', preferences: { genres: ['Pop'] } });
  assert.equal(out.songs.length, 0); assert.match(out.notices.join(' '), /Only 0/);
});
test('neutral defaults are disclosed, empty catalog and ties are deterministic', () => {
  assert.equal(recommend({ songs: [] }).songs.length, 0);
  const result = recommend({ songs: [sample(2), sample(1)] });
  assert.deepEqual(result.songs.map(s => s.id), [1, 2]);
  assert.ok(result.notices.some(n => n.includes('neutral')));
  assert.ok(result.notices.some(n => n.includes('general-purpose')));
});
test('ratings and helpful feedback affect related songs, not unrelated songs', () => {
  const songs = [sample(1), sample(2), sample(3, { artist: 'B', genre: 'Pop' })];
  const before = recommend({ songs });
  const after = recommend({ songs, ratings: [{ song_id: 1, score: 5, helpful: 1 }] });
  assert.ok(after.songs.find(s => s.id === 2).score > before.songs.find(s => s.id === 2).score);
  assert.equal(after.songs.find(s => s.id === 3).score, before.songs.find(s => s.id === 3).score);
  const negative = recommend({ songs, ratings: [{ song_id: 1, score: 1, helpful: 0 }] });
  assert.ok(negative.songs.find(s => s.id === 2).score < before.songs.find(s => s.id === 2).score);
});
test('invalid scoring weights are rejected', () => {
  assert.throws(() => recommend({ songs: [], weights: { ...DEFAULT_WEIGHTS, mood: -1 } }));
  assert.throws(() => recommend({ songs: [], weights: { ...DEFAULT_WEIGHTS, mood: 2 } }));
});

test('artist diversity, direct feedback and unknown metadata do not create false similarity', () => {
  const songs = [...Array.from({length:10},(_,i)=>sample(i,{artist:'A'})),sample(10,{artist:'B'}),sample(11,{artist:'C'})];
  const out = recommend({songs,limit:4});
  assert.deepEqual(new Set(out.songs.map(s=>s.artist)),new Set(['A','B','C']));
  const unknown = [sample(1,{genre:'Unknown',artist:'A'}),sample(2,{genre:'Unknown',artist:'B'})];
  const ranked = recommend({songs:unknown,ratings:[{song_id:1,score:5,helpful:1}]});
  assert.equal(ranked.songs.find(s=>s.id===2).score,50);
  const direct = recommend({songs:[sample(1),sample(2)],ratings:[{song_id:1,score:1,helpful:0},{song_id:2,score:5,helpful:1}]});
  assert.ok(direct.songs.find(s=>s.id===2).score > direct.songs.find(s=>s.id===1).score);
});
test('unclassified imports are discoverable without context and excluded with context', () => {
  const songs=[sample(1,{moodScores:{},activityScores:{}})];
  assert.equal(recommend({songs}).songs.length,1);
  const out = recommend({songs,mood:'Happy'});
  assert.equal(out.songs.length,0); assert.match(out.notices.join(' '),/lack selected context labels/);
});
