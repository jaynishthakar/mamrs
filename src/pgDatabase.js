import pg from 'pg';
import { extendedCatalog, moods, activities } from './extendedCatalog.js';

export function createPgDatabase(connectionString = process.env.DATABASE_URL) {
  const pool = new pg.Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  function normalizeSql(sql) {
    let s = sql.trim();
    // Handle INSERT OR IGNORE
    if (/insert\s+or\s+ignore\s+into/i.test(s)) {
      s = s.replace(/insert\s+or\s+ignore\s+into/i, 'INSERT INTO ');
      if (!/on\s+conflict/i.test(s)) s += ' ON CONFLICT DO NOTHING';
    }
    // Handle INSERT OR REPLACE
    if (/insert\s+or\s+replace\s+into\s+songs/i.test(s)) {
      s = s.replace(/insert\s+or\s+replace\s+into\s+songs/i, 'INSERT INTO songs');
      if (!/on\s+conflict/i.test(s)) s += ' ON CONFLICT (id) DO UPDATE SET metadata = EXCLUDED.metadata';
    }
    // Handle RETURNING id only for tables that have an id column
    let needsReturning = false;
    const matchTable = s.match(/^\s*insert\s+into\s+([a-zA-Z0-9_]+)/i);
    const tablesWithId = ['users', 'songs', 'recommendations', 'playlists', 'actions'];
    if (matchTable && tablesWithId.includes(matchTable[1].toLowerCase()) && !/returning/i.test(s)) {
      needsReturning = true;
      s += ' RETURNING id';
    }
    // Replace ? with $1, $2, ...
    let idx = 1;
    s = s.replace(/\?/g, () => `$${idx++}`);
    return { text: s, needsReturning };
  }

  const initPromise = (async () => {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, preferences TEXT NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires BIGINT NOT NULL);
        CREATE TABLE IF NOT EXISTS songs (id INTEGER PRIMARY KEY, metadata TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS taxonomy (kind TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY(kind,name));
        CREATE TABLE IF NOT EXISTS recommendations (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), mood TEXT, activity TEXT, result TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS ratings (user_id INTEGER NOT NULL REFERENCES users(id), song_id INTEGER NOT NULL REFERENCES songs(id), score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5), comment TEXT NOT NULL DEFAULT '', helpful INTEGER CHECK(helpful IN (0,1)), updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,song_id));
        CREATE TABLE IF NOT EXISTS actions (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), song_id INTEGER REFERENCES songs(id), type TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS playlists (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), name TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS playlist_songs (playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE, song_id INTEGER NOT NULL REFERENCES songs(id), position INTEGER NOT NULL, PRIMARY KEY(playlist_id,song_id));
        CREATE TABLE IF NOT EXISTS provider_songs (mbid TEXT PRIMARY KEY, song_id INTEGER NOT NULL UNIQUE REFERENCES songs(id));
        CREATE TABLE IF NOT EXISTS discogs_songs (discogs_id TEXT PRIMARY KEY, song_id INTEGER NOT NULL UNIQUE REFERENCES songs(id));
        CREATE TABLE IF NOT EXISTS user_songs (user_id INTEGER NOT NULL REFERENCES users(id), song_id INTEGER NOT NULL REFERENCES songs(id), PRIMARY KEY(user_id,song_id));
        CREATE TABLE IF NOT EXISTS annotations (user_id INTEGER NOT NULL REFERENCES users(id), song_id INTEGER NOT NULL REFERENCES songs(id), moods TEXT NOT NULL, activities TEXT NOT NULL, PRIMARY KEY(user_id,song_id));
        CREATE INDEX IF NOT EXISTS rec_user ON recommendations(user_id,id);
        CREATE INDEX IF NOT EXISTS playlist_user ON playlists(user_id);
        CREATE SEQUENCE IF NOT EXISTS songs_id_seq;
        SELECT setval('songs_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM songs), 0), 1000));
        ALTER TABLE songs ALTER COLUMN id SET DEFAULT nextval('songs_id_seq');
      `);

      const countRes = await client.query('SELECT count(*) as count FROM songs');
      if (parseInt(countRes.rows[0].count, 10) === 0) {
        for (const song of extendedCatalog) {
          await client.query('INSERT INTO songs(id, metadata) VALUES ($1, $2) ON CONFLICT DO NOTHING', [song.id, JSON.stringify(song)]);
        }
      }

      for (const name of moods) {
        await client.query('INSERT INTO taxonomy(kind, name) VALUES ($1, $2) ON CONFLICT DO NOTHING', ['mood', name]);
      }
      for (const name of activities) {
        await client.query('INSERT INTO taxonomy(kind, name) VALUES ($1, $2) ON CONFLICT DO NOTHING', ['activity', name]);
      }
    } finally {
      client.release();
    }
  })();

  return {
    isPostgres: true,
    async ready() {
      await initPromise;
    },
    async exec(sql) {
      await initPromise;
      return pool.query(sql);
    },
    async close() {
      return pool.end();
    },
    prepare(sql) {
      const { text } = normalizeSql(sql);
      return {
        async run(...params) {
          await initPromise;
          try {
            const res = await pool.query(text, params);
            const lastInsertRowid = res.rows && res.rows[0]?.id ? res.rows[0].id : null;
            return { changes: res.rowCount, lastInsertRowid };
          } catch (err) {
            if (err.code === '23505') {
              const e = new Error('UNIQUE constraint failed: ' + (err.detail || err.message));
              e.code = err.code;
              throw e;
            }
            throw err;
          }
        },
        async get(...params) {
          await initPromise;
          const res = await pool.query(text, params);
          return res.rows[0] || null;
        },
        async all(...params) {
          await initPromise;
          const res = await pool.query(text, params);
          return res.rows;
        }
      };
    }
  };
}
