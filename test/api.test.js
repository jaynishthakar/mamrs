import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.js';

async function start(path) {
  const app = createApp({ databasePath: path });
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

test('full API lifecycle, user isolation, validation, audio and persistence', async () => {
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
    assert.equal((await a('/preferences', 'PUT', { genres: ['Lo-fi'], artists: [], languages: ['Hindi'] })).status, 200);
    assert.equal((await a('/recommendations', 'POST', { mood: 'Invalid' })).status, 400);
    assert.equal((await a('/recommendations', 'POST', {}, { 'X-CSRF-Token': '' })).status, 403);
    assert.equal((await a('/recommendations', 'POST', {}, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await a('/ratings', 'POST', { songId: 1, score: 4 })).status, 403);
    const rec = await a('/recommendations', 'POST', { mood: 'Happy', activity: 'Study' });
    assert.equal(rec.status, 200); assert.equal(rec.data.songs.length, 10); assert.deepEqual(rec.data.relaxed, ['language']);
    const sid = rec.data.songs[0].id;
    assert.equal((await a('/ratings', 'POST', { songId: sid, score: 6 })).status, 400);
    assert.equal((await a('/ratings', 'POST', { songId: sid, score: 2.5 })).status, 400);
    assert.equal((await a('/ratings', 'POST', { songId: 99999, score: 5 })).status, 400);
    assert.equal((await a('/ratings', 'POST', { songId: sid, score: 5, comment: '<script>demo</script>', helpful: 1 })).status, 200);
    assert.equal((await a('/ratings', 'POST', { songId: sid, score: 4, comment: 'Updated', helpful: 0 })).status, 200);
    assert.equal((await a('/ratings')).data.ratings.length, 1);
    const saved = await a('/playlists', 'POST', { name: 'Study mix', songIds: rec.data.songs.map(s => s.id) });
    assert.equal(saved.status, 201);
    assert.equal((await a('/playlists')).data.playlists[0].songs.length, 10);
    const preview = await a(`/previews/${sid}.wav`); assert.equal(preview.status, 200); assert.equal(preview.data.subarray(0, 4).toString(), 'RIFF');
    assert.equal(preview.data.length, 256044);
    assert.equal((await a('/actions', 'POST', { type: 'preview', songId: sid })).status, 201);
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
    assert.deepEqual((await a('/me')).data.user.preferences.genres, ['Lo-fi']);
    assert.equal((await a('/playlists')).data.playlists[0].name, 'Study mix');
    assert.equal((await a('/ratings')).data.ratings[0].comment, 'Updated');
    assert.equal((await a(`/playlists/${saved.data.id}`, 'DELETE')).status, 200);
    assert.equal((await a('/playlists')).data.playlists.length, 0);
  } finally { await stop(app); rmSync(dir, { recursive: true, force: true }); }
});
