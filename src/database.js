import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { catalog, moods, activities } from './catalog.js';

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, preferences TEXT NOT NULL DEFAULT '{}', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS songs (id INTEGER PRIMARY KEY, metadata TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS taxonomy (kind TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY(kind,name));
    CREATE TABLE IF NOT EXISTS recommendations (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), mood TEXT, activity TEXT, result TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS ratings (user_id INTEGER NOT NULL REFERENCES users(id), song_id INTEGER NOT NULL REFERENCES songs(id), score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5), comment TEXT NOT NULL DEFAULT '', helpful INTEGER CHECK(helpful IN (0,1)), updated_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,song_id));
    CREATE TABLE IF NOT EXISTS actions (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), song_id INTEGER REFERENCES songs(id), type TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS playlists (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), name TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS playlist_songs (playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE, song_id INTEGER NOT NULL REFERENCES songs(id), position INTEGER NOT NULL, PRIMARY KEY(playlist_id,song_id));
    CREATE TABLE IF NOT EXISTS provider_songs (mbid TEXT PRIMARY KEY, song_id INTEGER NOT NULL UNIQUE REFERENCES songs(id));
    CREATE TABLE IF NOT EXISTS discogs_songs (discogs_id TEXT PRIMARY KEY, song_id INTEGER NOT NULL UNIQUE REFERENCES songs(id));
    CREATE TABLE IF NOT EXISTS user_songs (user_id INTEGER NOT NULL REFERENCES users(id), song_id INTEGER NOT NULL REFERENCES songs(id), PRIMARY KEY(user_id,song_id));
    CREATE TABLE IF NOT EXISTS annotations (user_id INTEGER NOT NULL REFERENCES users(id), song_id INTEGER NOT NULL REFERENCES songs(id), moods TEXT NOT NULL, activities TEXT NOT NULL, PRIMARY KEY(user_id,song_id));
    CREATE INDEX IF NOT EXISTS rec_user ON recommendations(user_id,id);
    CREATE INDEX IF NOT EXISTS playlist_user ON playlists(user_id);`);
  const seed = db.prepare('INSERT OR IGNORE INTO songs(id, metadata) VALUES (?,?)');
  for (const song of catalog) seed.run(song.id, JSON.stringify(song));
  const tax = db.prepare('INSERT OR IGNORE INTO taxonomy(kind,name) VALUES (?,?)');
  for (const name of moods) tax.run('mood', name);
  for (const name of activities) tax.run('activity', name);
  return db;
}
