import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.js';

async function start(path, musicBrainz) {
  const app = createApp({ databasePath: path, musicBrainz });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  return { ...app, url: `http://127.0.0.1:${app.server.address().port}` };
}
async function stop(app) { await new Promise(resolve => app.server.close(resolve)); app.db.close(); }
function client(app) {
  let cookie = '', csrf = '';
  return async (path, method = 'GET', body, extra = {}) => {
    const r = await fetch(app.url + '/api' + path, { method, headers: { 'Content-Type': 'application/json', 'X-MAMRS-Request': '1', 'X-CSRF-Token': csrf, Cookie: cookie, ...extra }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    const data = r.headers.get('content-type')?.includes('application/json') ? await r.json() : Buffer.from(await r.arrayBuffer());
    if (data.csrf) csrf = data.csrf;
    return { status: r.status, data, headers: r.headers };
  };
}

test('full API lifecycle, user isolation, validation, no playback and persistence', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mamrs-test-')); const path = join(dir, 'test.sqlite');
  let app = await start(path);
  try {
    let a = client(app), b = client(app);
    assert.equal((await a('/recommendations', 'POST', {})).status, 401);
    const registration = await a('/register', 'POST', { name: 'Alice', email: 'alice@example.com', password: 'TestPass123!' });
    assert.equal(registration.status, 201); assert.match(registration.headers.get('set-cookie'), /HttpOnly/);
    assert.equal(registration.data.user.password_hash, undefined);
    assert.equal((await a('/register', 'POST', { name: 'Alice', email: 'ALICE@example.com', password: 'TestPass123!' })).status, 409);
    assert.equal((await a('/preferences', 'PUT', { genres: ['bad'], artists: [], languages: [] })).status, 400);
    assert.equal((await a('/preferences', 'PUT', { genres: ['Pop'], artists: [], languages: ['Hindi'] })).status, 200);
    assert.equal((await a('/recommendations', 'POST', { mood: 'Invalid' })).status, 400);
    assert.equal((await a('/recommendations', 'POST', {}, { 'X-CSRF-Token': '' })).status, 403);
    assert.equal((await a('/recommendations', 'POST', {}, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await a('/ratings', 'POST', { songId: 1001, score: 4 })).status, 403);
    const rec = await a('/recommendations', 'POST', { mood: 'Energetic', activity: 'Workout' });
    assert.equal(rec.status, 200); assert.ok(rec.data.songs.length > 0); assert.deepEqual(rec.data.relaxed, ['language', 'genre']);
    const sid = rec.data.songs[0].id;
    assert.equal((await a('/ratings', 'POST', { songId: sid, score: 6 })).status, 400);
    assert.equal((await a('/ratings', 'POST', { songId: sid, score: 2.5 })).status, 400);
    assert.equal((await a('/ratings', 'POST', { songId: 99999, score: 5 })).status, 400);
    assert.equal((await a('/ratings', 'POST', { songId: sid, score: 5, comment: '<script>demo</script>', helpful: 1 })).status, 200);
    assert.equal((await a('/ratings', 'POST', { songId: sid, score: 4, comment: 'Updated', helpful: 0 })).status, 200);
    assert.equal((await a('/ratings')).data.ratings.length, 1);
    const saved = await a('/playlists', 'POST', { name: 'Study mix', songIds: rec.data.songs.map(s => s.id) });
    assert.equal(saved.status, 201);
    assert.equal((await a('/playlists')).data.playlists[0].songs.length, rec.data.songs.length);
    assert.equal((await a(`/previews/${sid}.wav`)).status, 404);
    assert.equal((await a('/actions', 'POST', { type: 'preview', songId: sid })).status, 404);
    const html = await (await fetch(app.url)).text();
    assert.doesNotMatch(html, /<audio|id="player"|synthesized/);
    assert.equal((await a('/history')).data.history.length, 1);
    assert.equal((await b('/register', 'POST', { name: 'Bob', email: 'bob@example.com', password: 'TestPass123!' })).status, 201);
    assert.equal((await b('/playlists')).data.playlists.length, 0);
    assert.equal((await b('/ratings')).data.ratings.length, 0);
    assert.equal((await b('/history')).data.history.length, 0);
    assert.equal((await b(`/playlists/${saved.data.id}`, 'DELETE')).status, 404);
    assert.equal((await b('/ratings', 'POST', { songId: sid, score: 5 })).status, 403);
    assert.equal((await a('/logout', 'POST', {})).status, 200);
    assert.equal((await a('/me')).status, 401);
    assert.equal((await a('/login', 'POST', { email: 'alice@example.com', password: 'WrongPass!' })).status, 401);
    await stop(app); app = await start(path); a = client(app);
    assert.equal((await a('/login', 'POST', { email: 'alice@example.com', password: 'TestPass123!' })).status, 200);
    assert.deepEqual((await a('/me')).data.user.preferences.genres, ['Pop']);
    assert.equal((await a('/playlists')).data.playlists[0].name, 'Study mix');
    assert.equal((await a('/ratings')).data.ratings[0].comment, 'Updated');
    assert.equal((await a(`/playlists/${saved.data.id}`, 'DELETE')).status, 200);
    assert.equal((await a('/playlists')).data.playlists.length, 0);
  } finally { await stop(app); rmSync(dir, { recursive: true, force: true }); }
});

test('MusicBrainz imports are paginated, deduplicated and private; annotations persist per user', async () => {
  const artistId='11111111-1111-1111-1111-111111111111', mbid='22222222-2222-2222-2222-222222222222';
  const calls=[];
  const musicBrainz = {
    async searchArtists(q) { return [{id:artistId,name:q}]; },
    async recordings(id,offset) { calls.push({id,offset}); return {songs:[{mbid,title:'Imported recording',artist:'Provider artist',genre:'Unknown',language:'Unknown',source:'MusicBrainz',tagSource:'Unclassified',moodScores:{},activityScores:{}}],total:51,nextOffset:offset ? null : 50}; },
  };
  const app=await start(':memory:',musicBrainz);
  try {
    const a=client(app),b=client(app);
    await a('/register','POST',{name:'A',email:'a@test.com',password:'Password123'});
    await b('/register','POST',{name:'B',email:'b@test.com',password:'Password123'});
    assert.equal((await a('/artists?q=A')).status,400);
    assert.equal((await a('/artists?q=Artist')).data.artists[0].id,artistId);
    assert.equal((await a('/catalog/import','POST',{artistId:'invalid'})).status,400);
    const result=await a('/catalog/import','POST',{artistId});
    assert.equal(result.data.added,1);assert.equal(result.data.nextOffset,50);
    assert.equal((await a('/catalog/import','POST',{artistId,offset:50})).data.added,0);
    assert.deepEqual(calls,[{id:artistId,offset:0},{id:artistId,offset:50}]);
    const song=(await a('/catalog?q=Imported')).data.songs[0];
    assert.equal((await b('/catalog?q=Imported')).data.total,0);
    assert.equal((await b('/annotations','PUT',{songId:song.id,moods:['Happy'],activities:['Study']})).status,400);
    assert.equal((await a('/annotations','PUT',{songId:song.id,moods:['Invalid'],activities:[]})).status,400);
    assert.equal((await a('/annotations','PUT',{songId:song.id,moods:['Happy'],activities:['Study']})).status,200);
    const rec=(await a('/recommendations','POST',{mood:'Happy',activity:'Study'})).data;
    assert.equal(rec.songs[0].id,song.id);assert.equal(rec.songs[0].tagSource,'Your tags');
    await b('/catalog/import','POST',{artistId});
    assert.equal((await b('/catalog?q=Imported')).data.songs[0].tagSource,'Unclassified');
    await a('/catalog/import','POST',{artistId});
    assert.equal((await a('/catalog?q=Imported')).data.songs[0].tagSource,'Your tags');
    musicBrainz.recordings=async()=>{throw Object.assign(new Error('Provider unavailable'),{status:503});};
    assert.equal((await a('/catalog/import','POST',{artistId})).status,503);
    assert.equal((await a('/catalog?q=Imported')).data.total,1);
    // Legacy song relationships survive; obsolete demos cannot enter new recommendations.
    app.db.prepare('INSERT INTO songs VALUES (?,?)').run(1,JSON.stringify({id:1,title:'Old demo',demo:true}));
    app.db.prepare('INSERT INTO playlists(id,user_id,name) VALUES (1,1,?)').run('Old mix');
    app.db.prepare('INSERT INTO playlist_songs VALUES (1,1,0)').run();
    assert.equal((await a('/playlists')).data.playlists[0].songs[0].title,'Old demo');
    assert.ok(!(await a('/recommendations','POST',{})).data.songs.some(s=>s.id===1));
  } finally { await stop(app); }
});
