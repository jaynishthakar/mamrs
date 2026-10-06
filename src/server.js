import http from 'node:http';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openDatabase } from './database.js';
import { recommend } from './recommendation.js';
import { createMusicBrainz, validMbid } from './musicbrainz.js';
import { createDiscogs } from './discogs.js';
import { extendedCatalog } from './extendedCatalog.js';

const derive = promisify(scrypt);
const hashToken = value => createHash('sha256').update(value).digest('hex');
const root = fileURLToPath(new URL('../', import.meta.url));
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const text = (value, name, max = 100) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(400, `Enter a valid ${name} (maximum ${max} characters).`);
  return value.trim();
};
async function readJson(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) fail(415, 'Send application/json.');
  let body = '';
  for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 16384) fail(413, 'Request too large.'); }
  try { const data = JSON.parse(body); if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error(); return data; }
  catch { fail(400, 'Invalid JSON object.'); }
}
const publicUser = row => ({ id: row.id, name: row.name, email: row.email, preferences: JSON.parse(row.preferences) });

export function createApp({ databasePath = process.env.DATABASE_URL || process.env.DATABASE_PATH || resolve(root, 'data/mamrs.sqlite'), musicBrainz = createMusicBrainz(), discogs = createDiscogs(), secureCookies = process.env.COOKIE_SECURE === 'true' } = {}) {
  const db = openDatabase(databasePath);
  const attempts = new Map();
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline' https://esm.sh; img-src 'self' data: https://*.discogs.com https://images.unsplash.com; media-src 'none'; connect-src 'self' https://esm.sh; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      if (!path.startsWith('/api/')) {
        if (req.method !== 'GET') fail(405, 'Method not allowed.');
        const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/PreferencesReact.js': ['PreferencesReact.js', 'text/javascript'] };
        const asset = assets[path]; if (!asset) fail(404, 'Page not found.');
        res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8` });
        return res.end(readFileSync(resolve(root, 'public', asset[0])));
      }
      if (req.method === 'GET' && path === '/api/health') return json(200, { ok: true });
      const mutation = ['POST', 'PUT', 'DELETE'].includes(req.method);
      if (mutation) {
        if (req.headers['x-mamrs-request'] !== '1') fail(403, 'Missing request protection header.');
        if (req.headers['sec-fetch-site'] === 'cross-site') fail(403, 'Cross-site request denied.');
        if (req.headers.origin) {
          let origin; try { origin = new URL(req.headers.origin); } catch { fail(403, 'Invalid origin.'); }
          if (origin.host !== req.headers.host) fail(403, 'Cross-site request denied.');
        }
      }
      if (req.method === 'POST' && ['/api/register', '/api/login'].includes(path)) {
        const now = Date.now();
        for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
        const key = req.socket.remoteAddress;
        const bucket = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
        attempts.set(key, bucket); if (++bucket.count > 30) fail(429, 'Too many sign-in attempts. Try again in 15 minutes.');
        const data = await readJson(req);
        const email = text(data.email, 'email', 254).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address.');
        if (typeof data.password !== 'string' || data.password.length < 8 || data.password.length > 128) fail(400, 'Password must contain 8–128 characters.');
        let user;
        if (path === '/api/register') {
          const name = text(data.name, 'name', 60), salt = randomBytes(16).toString('hex');
          const passwordHash = `${salt}:${(await derive(data.password, salt, 64)).toString('hex')}`;
          try {
            const result = await db.prepare('INSERT INTO users(name,email,password_hash) VALUES (?,?,?)').run(name, email, passwordHash);
            user = await db.prepare('SELECT * FROM users WHERE id=?').get(Number(result.lastInsertRowid));
          } catch (error) { if (error.message.includes('UNIQUE')) fail(409, 'This email is already registered. Sign in instead.'); throw error; }
        } else {
          user = await db.prepare('SELECT * FROM users WHERE email=?').get(email);
          const [salt, expected] = (user?.password_hash || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
          const actual = await derive(data.password, salt, 64);
          if (!timingSafeEqual(actual, Buffer.from(expected, 'hex')) || !user) fail(401, 'Email or password is incorrect.');
        }
        const token = randomBytes(32).toString('hex'), csrf = randomBytes(24).toString('hex');
        const previous = /(?:^|;\s*)mamrs_session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
        if (previous) await db.prepare('DELETE FROM sessions WHERE token=?').run(hashToken(previous));
        await db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
        await db.prepare('INSERT INTO sessions(token,user_id,csrf,expires) VALUES (?,?,?,?)').run(hashToken(token), user.id, csrf, Date.now() + 7 * 86400000);
        res.setHeader('Set-Cookie', `mamrs_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secureCookies ? '; Secure' : ''}`);
        return json(path === '/api/register' ? 201 : 200, { user: publicUser(user), csrf });
      }
      const token = /(?:^|;\s*)mamrs_session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
      const session = token ? await db.prepare('SELECT * FROM sessions WHERE token=? AND expires>?').get(hashToken(token), Date.now()) : null;
      if (!session) fail(401, 'Please sign in to continue.');
      const uid = session.user_id;
      if (mutation && req.headers['x-csrf-token'] !== session.csrf) fail(403, 'Session verification failed. Refresh and try again.');
      if (req.method === 'GET' && path === '/api/me') return json(200, { user: publicUser(await db.prepare('SELECT * FROM users WHERE id=?').get(uid)), csrf: session.csrf });
      if (req.method === 'POST' && path === '/api/logout') {
        await db.prepare('DELETE FROM sessions WHERE token=?').run(session.token);
        res.setHeader('Set-Cookie', `mamrs_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureCookies ? '; Secure' : ''}`);
        return json(200, { ok: true });
      }
      const allSongs = (await db.prepare('SELECT metadata FROM songs ORDER BY id').all()).map(s => JSON.parse(s.metadata));
      const owned = new Set((await db.prepare('SELECT song_id FROM user_songs WHERE user_id=?').all(uid)).map(r=>r.song_id));
      const annotations = new Map((await db.prepare('SELECT * FROM annotations WHERE user_id=?').all(uid)).map(r=>[r.song_id,r]));
      const songs = allSongs.filter(s => s.source === 'Editorial starter' || s.isCatalog || owned.has(s.id)).map(s => {
        const a = annotations.get(s.id);
        return a ? { ...s, moodScores: Object.fromEntries(JSON.parse(a.moods).map(v => [v, 1])), activityScores: Object.fromEntries(JSON.parse(a.activities).map(v => [v, 1])), tagSource: 'Your tags' } : s;
      });
      const options = {
        moods: (await db.prepare("SELECT name FROM taxonomy WHERE kind='mood'").all()).map(r => r.name),
        activities: (await db.prepare("SELECT name FROM taxonomy WHERE kind='activity'").all()).map(r => r.name),
        ...Object.fromEntries(['genre', 'artist', 'language'].map(k => [`${k}s`, [...new Set(songs.map(s => s[k]))]])),
      };
      if (req.method === 'GET' && path === '/api/options') return json(200, { ...options, catalogSize: songs.length });
      if (req.method === 'POST' && path === '/api/catalog/seed-dynamic') {
        await db.exec('BEGIN');
        let added = 0;
        try {
          const insertSong = db.prepare('INSERT OR REPLACE INTO songs(id, metadata) VALUES (?, ?)');
          const insertUser = db.prepare('INSERT OR IGNORE INTO user_songs(user_id, song_id) VALUES (?, ?)');
          for (const song of extendedCatalog) {
            await insertSong.run(song.id, JSON.stringify(song));
            added += (await insertUser.run(uid, song.id)).changes;
          }
          await db.exec('COMMIT');
        } catch (err) { await db.exec('ROLLBACK'); throw err; }
        return json(200, { ok: true, added, total: extendedCatalog.length });
      }
      if (req.method === 'GET' && path === '/api/artists') {
        const query = text(url.searchParams.get('q'), 'artist name', 100);
        if (query.length < 2) fail(400, 'Enter at least two characters.');
        const provider = url.searchParams.get('provider') || 'musicbrainz';
        if (provider === 'discogs') return json(200, { artists: await discogs.searchArtists(query), provider: 'discogs' });
        return json(200, { artists: await musicBrainz.searchArtists(query), provider: 'musicbrainz' });
      }
      if (req.method === 'POST' && path === '/api/catalog/import') {
        const data = await readJson(req), offset = data.offset ?? 0;
        const provider = data.provider || 'musicbrainz';
        if (provider === 'discogs') {
          if (!data.artistId || !String(data.artistId).trim()) fail(400, 'Invalid artist or page.');
          const page = await discogs.recordings(String(data.artistId), Number(offset) || 1);
          let added = 0;
          await db.exec('BEGIN');
          try {
            for (const song of page.songs) {
              let sid = (await db.prepare('SELECT song_id FROM discogs_songs WHERE discogs_id=?').get(song.discogsId))?.song_id;
              if (!sid) {
                sid = Number((await db.prepare('INSERT INTO songs(metadata) VALUES (?)').run('{}')).lastInsertRowid);
                await db.prepare('UPDATE songs SET metadata=? WHERE id=?').run(JSON.stringify({ ...song, id: sid }), sid);
                await db.prepare('INSERT INTO discogs_songs VALUES (?,?)').run(song.discogsId, sid);
              }
              added += (await db.prepare('INSERT OR IGNORE INTO user_songs VALUES (?,?)').run(uid, sid)).changes;
            }
            await db.exec('COMMIT');
          } catch (err) { await db.exec('ROLLBACK'); throw err; }
          return json(200, { added, total: page.total, nextOffset: page.nextOffset, provider: 'discogs' });
        }
        if (!validMbid(data.artistId) || !Number.isInteger(offset) || offset < 0 || offset > 100000) fail(400, 'Invalid artist or page.');
        const page = await musicBrainz.recordings(data.artistId, offset);
        let added = 0;
        await db.exec('BEGIN');
        try {
          for (const song of page.songs) {
            let sid = (await db.prepare('SELECT song_id FROM provider_songs WHERE mbid=?').get(song.mbid))?.song_id;
            if (!sid) {
              sid = Number((await db.prepare('INSERT INTO songs(metadata) VALUES (?)').run('{}')).lastInsertRowid);
              await db.prepare('UPDATE songs SET metadata=? WHERE id=?').run(JSON.stringify({ ...song, id:sid }),sid);
              await db.prepare('INSERT INTO provider_songs VALUES (?,?)').run(song.mbid,sid);
            }
            added += (await db.prepare('INSERT OR IGNORE INTO user_songs VALUES (?,?)').run(uid,sid)).changes;
          }
          await db.exec('COMMIT');
        } catch (err) { await db.exec('ROLLBACK'); throw err; }
        return json(200, { added, total:page.total, nextOffset:page.nextOffset, provider: 'musicbrainz' });
      }
      if (req.method === 'GET' && path === '/api/catalog') {
        const query = (url.searchParams.get('q') || '').toLowerCase().slice(0,100);
        const offset = Number(url.searchParams.get('offset') || 0);
        if (!Number.isInteger(offset) || offset < 0) fail(400, 'Invalid page.');
        const matches = songs.filter(s=>(s.title+' '+s.artist).toLowerCase().includes(query));
        return json(200, { songs:matches.slice(offset,offset+50), total:matches.length, nextOffset:offset+50 < matches.length ? offset+50 : null });
      }
      if (req.method === 'PUT' && path === '/api/annotations') {
        const data = await readJson(req);
        if (!songs.some(s=>s.id === data.songId)) fail(400, 'Song does not exist in your catalog.');
        for (const key of ['moods','activities']) {
          if (!Array.isArray(data[key]) || data[key].length > options[key].length || !data[key].every(v=>options[key].includes(v))) fail(400, `Invalid ${key}.`);
        }
        await db.prepare('INSERT INTO annotations VALUES (?,?,?,?) ON CONFLICT(user_id,song_id) DO UPDATE SET moods=excluded.moods,activities=excluded.activities').run(uid,data.songId,JSON.stringify([...new Set(data.moods)]),JSON.stringify([...new Set(data.activities)]));
        return json(200, { ok:true });
      }
      if (req.method === 'PUT' && path === '/api/preferences') {
        const data = await readJson(req), prefs = {};
        for (const k of ['genres', 'artists', 'languages']) {
          if (!Array.isArray(data[k]) || data[k].length > options[k].length || !data[k].every(v => options[k].includes(v))) fail(400, `Invalid ${k}.`);
          prefs[k] = [...new Set(data[k])];
        }
        await db.prepare('UPDATE users SET preferences=? WHERE id=?').run(JSON.stringify(prefs), uid);
        return json(200, { preferences: prefs });
      }
      if (req.method === 'POST' && path === '/api/recommendations') {
        const data = await readJson(req);
        const mood = data.mood ?? null, activity = data.activity ?? null;
        if ((mood !== null && !options.moods.includes(mood)) || (activity !== null && !options.activities.includes(activity))) fail(400, 'Choose a valid mood and activity.');
        const preferences = JSON.parse((await db.prepare('SELECT preferences FROM users WHERE id=?').get(uid)).preferences);
        const ratings = await db.prepare('SELECT * FROM ratings WHERE user_id=?').all(uid);
        const result = recommend({ songs, mood, activity, preferences, ratings });
        const rec = await db.prepare('INSERT INTO recommendations(user_id,mood,activity,result) VALUES (?,?,?,?)').run(uid, mood, activity, JSON.stringify(result));
        return json(200, { ...result, id: Number(rec.lastInsertRowid) });
      }
      if (req.method === 'GET' && path === '/api/history') {
        const rows = await db.prepare('SELECT id,mood,activity,created_at FROM recommendations WHERE user_id=? ORDER BY id DESC LIMIT 30').all(uid);
        return json(200, { history: rows });
      }
      if (req.method === 'GET' && path === '/api/ratings') {
        const rRows = await db.prepare('SELECT * FROM ratings WHERE user_id=? ORDER BY updated_at DESC').all(uid);
        return json(200, { ratings: rRows.map(r => ({ ...r, song: songs.find(s => s.id === r.song_id) || allSongs.find(s=>s.id===r.song_id) })) });
      }
      if (req.method === 'POST' && path === '/api/ratings') {
        const data = await readJson(req);
        if (!Number.isInteger(data.songId) || !songs.some(s => s.id === data.songId)) fail(400, 'Song does not exist.');
        if (!Number.isInteger(data.score) || data.score < 1 || data.score > 5) fail(400, 'Rating must be an integer from 1 to 5.');
        if (data.comment !== undefined && (typeof data.comment !== 'string' || data.comment.length > 1000)) fail(400, 'Feedback must be at most 1,000 characters.');
        if (data.helpful !== undefined && data.helpful !== null && ![0, 1].includes(data.helpful)) fail(400, 'Invalid helpful value.');
        
        // Check if user was recommended this song
        const userRecs = await db.prepare('SELECT result FROM recommendations WHERE user_id=? ORDER BY id DESC LIMIT 50').all(uid);
        const received = userRecs.some(r => {
          try { return JSON.parse(r.result).songs.some(s => s.id === data.songId); }
          catch { return false; }
        });
        if (!received) fail(403, 'Receive a recommendation for this song before rating it.');
        await db.prepare(`INSERT INTO ratings(user_id,song_id,score,comment,helpful) VALUES (?,?,?,?,?) ON CONFLICT(user_id,song_id) DO UPDATE SET score=excluded.score,comment=excluded.comment,helpful=excluded.helpful,updated_at=CURRENT_TIMESTAMP`).run(uid, data.songId, data.score, data.comment || '', data.helpful ?? null);
        await db.prepare("INSERT INTO actions(user_id,song_id,type) VALUES (?,?,'rate')").run(uid, data.songId);
        return json(200, { ok: true });
      }
      if (req.method === 'GET' && path === '/api/playlists') {
        const pRows = await db.prepare('SELECT * FROM playlists WHERE user_id=? ORDER BY id DESC').all(uid);
        const playlists = await Promise.all(pRows.map(async p => {
          const songRows = await db.prepare('SELECT song_id FROM playlist_songs WHERE playlist_id=? ORDER BY position').all(p.id);
          return {
            ...p,
            songs: songRows.map(r => songs.find(s => s.id === r.song_id) || allSongs.find(s => s.id === r.song_id)).filter(Boolean)
          };
        }));
        return json(200, { playlists });
      }
      if (req.method === 'POST' && path === '/api/playlists') {
        const data = await readJson(req), name = text(data.name, 'playlist name', 80);
        if (!Array.isArray(data.songIds) || !data.songIds.length || data.songIds.length > 100 || !data.songIds.every(id => Number.isInteger(id) && songs.some(s => s.id === id))) fail(400, 'Choose 1–100 valid songs.');
        await db.exec('BEGIN');
        try {
          const id = Number((await db.prepare('INSERT INTO playlists(user_id,name) VALUES (?,?)').run(uid, name)).lastInsertRowid);
          for (const [i, sid] of [...new Set(data.songIds)].entries()) {
            await db.prepare('INSERT INTO playlist_songs VALUES (?,?,?)').run(id, sid, i);
          }
          await db.exec('COMMIT');
          return json(201, { id, name });
        } catch (err) { await db.exec('ROLLBACK'); throw err; }
      }
      const playlistMatch = path.match(/^\/api\/playlists\/(\d+)$/);
      if (req.method === 'DELETE' && playlistMatch) {
        const result = await db.prepare('DELETE FROM playlists WHERE id=? AND user_id=?').run(Number(playlistMatch[1]), uid);
        if (!result.changes) fail(404, 'Playlist not found.');
        return json(200, { ok: true });
      }
      fail(404, 'Endpoint not found.');
    } catch (err) {
      if (!err.status) console.error(err);
      if (!res.headersSent) json(err.status || 500, { error: err.status ? err.message : 'Something went wrong. Please try again.' });
      else res.end();
    }
  });
  server.requestTimeout = 15000;
  return { server, db };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, db } = createApp();
  const port = Number(process.env.PORT || 3000), host = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
  server.listen(port, host, () => console.log(`MAMRS ready at http://${host}:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(async () => { await db.close(); process.exit(0); }));
}
