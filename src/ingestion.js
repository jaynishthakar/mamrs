import { cleanTrack, recordingFingerprint, normalize, valuesFor } from './catalogQuality.js';
import { createHash } from 'node:crypto';
import { pipelineSchema, enqueueJob } from './pipelineQueue.js';

export const ingestionSchema = `
${pipelineSchema}
CREATE TABLE IF NOT EXISTS catalog_imports (source_key TEXT PRIMARY KEY, raw_metadata TEXT NOT NULL, status TEXT NOT NULL, issues TEXT NOT NULL, song_id INTEGER REFERENCES songs(id), updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS catalog_jobs (job_key TEXT PRIMARY KEY, provider TEXT NOT NULL, artist_id TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', error TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS track_identities (identity_key TEXT PRIMARY KEY, song_id INTEGER NOT NULL REFERENCES songs(id));
CREATE TABLE IF NOT EXISTS catalog_artists (artist_key TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS track_artists (song_id INTEGER NOT NULL REFERENCES songs(id), artist_key TEXT NOT NULL REFERENCES catalog_artists(artist_key), position INTEGER NOT NULL, PRIMARY KEY(song_id,artist_key));
CREATE TABLE IF NOT EXISTS track_labels (song_id INTEGER NOT NULL REFERENCES songs(id), kind TEXT NOT NULL, value TEXT NOT NULL, score REAL NOT NULL, source TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY(song_id,kind,value));
CREATE INDEX IF NOT EXISTS track_label_lookup ON track_labels(kind,value,song_id);
CREATE INDEX IF NOT EXISTS catalog_import_status ON catalog_imports(status);
`;

export function sourceKey(song) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(song.mbid || '') && !/^00000000-/.test(song.mbid)) return `musicbrainz:${song.mbid}`;
  if (/^\d+:.+$/.test(song.discogsId || '')) return `discogs:${song.discogsId}`;
  if ((song.source === 'Editorial starter' || song.isCatalog) && Number.isInteger(song.id)) return `editorial:${song.id}`;
  throw new Error('A genuine recording or release-track identifier is required.');
}

/** Called with trusted provider metadata or an operator-reviewed file, never browser labels. */
export async function ingestTrack(db, raw, { userId = null, shared = false } = {}) {
  const key = sourceKey(raw), song = cleanTrack(raw);
  const fingerprint = recordingFingerprint(song);
  const identity = fingerprint ? `fingerprint:${createHash('sha256').update(fingerprint).digest('hex')}` : key;
  return db.withTransaction(async () => {
    // The identity insert arbitrates concurrent imports on PostgreSQL.
    await db.prepare('INSERT INTO catalog_imports(source_key,raw_metadata,status,issues) VALUES (?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET raw_metadata=excluded.raw_metadata,status=excluded.status,issues=excluded.issues,updated_at=CURRENT_TIMESTAMP')
      .run(key, JSON.stringify(raw), song.catalogStatus, JSON.stringify(song.qualityIssues));
    const staged = await db.prepare('SELECT song_id FROM catalog_imports WHERE source_key=?').get(key);
    let sid = staged?.song_id || (await db.prepare('SELECT song_id FROM track_identities WHERE identity_key=?').get(identity))?.song_id;
    if (!sid && key.startsWith('editorial:')) sid = (await db.prepare('SELECT id FROM songs WHERE id=?').get(raw.id))?.id;
    if (!sid && raw.mbid) sid = (await db.prepare('SELECT song_id FROM provider_songs WHERE mbid=?').get(raw.mbid))?.song_id;
    if (!sid && raw.discogsId) sid = (await db.prepare('SELECT song_id FROM discogs_songs WHERE discogs_id=?').get(raw.discogsId))?.song_id;
    if (!sid) {
      sid = key.startsWith('editorial:') ? raw.id : Number((await db.prepare('INSERT INTO songs(metadata) VALUES (?)').run('{}')).lastInsertRowid);
      if (key.startsWith('editorial:')) await db.prepare('INSERT INTO songs(id,metadata) VALUES (?,?)').run(sid, '{}');
      await db.prepare('INSERT INTO track_identities(identity_key,song_id) VALUES (?,?) ON CONFLICT(identity_key) DO NOTHING').run(identity, sid);
      const winner = await db.prepare('SELECT song_id FROM track_identities WHERE identity_key=?').get(identity);
      if (winner.song_id !== sid) { await db.prepare('DELETE FROM songs WHERE id=?').run(sid); sid = winner.song_id; }
    }
    const previous = JSON.parse((await db.prepare('SELECT metadata FROM songs WHERE id=?').get(sid)).metadata);
    // Refresh provider data without erasing operator labels or publishing private tracks.
    const metadata = { ...previous, ...song, id: sid, isCatalog: previous.isCatalog || (shared && song.catalogStatus === 'ready') || false };
    if (previous.labelsReviewed && !raw.labelsReviewed) {
      for (const field of ['moodScores', 'activityScores', 'language', 'labelVersion', 'labelSource', 'labelsReviewed', 'labelEvidence']) if (previous[field] !== undefined) metadata[field] = previous[field];
      Object.assign(metadata, cleanTrack(metadata));
    }
    // Publication is evaluated after preserving reviewed labels during refresh.
    metadata.isCatalog = metadata.catalogStatus === 'ready' && (previous.isCatalog || shared);
    await db.prepare('UPDATE songs SET metadata=? WHERE id=?').run(JSON.stringify(metadata), sid);
    await db.prepare('DELETE FROM track_artists WHERE song_id=?').run(sid);
    for (const [position, artist] of metadata.artists.entries()) {
      const name = typeof artist === 'string' ? artist : artist.name;
      const artistKey = artist.id || `name:${createHash('sha256').update(normalize(name)).digest('hex')}`;
      await db.prepare('INSERT INTO catalog_artists(artist_key,name) VALUES (?,?) ON CONFLICT(artist_key) DO UPDATE SET name=excluded.name').run(artistKey, name);
      await db.prepare('INSERT OR IGNORE INTO track_artists(song_id,artist_key,position) VALUES (?,?,?)').run(sid, artistKey, position);
    }
    await db.prepare('DELETE FROM track_labels WHERE song_id=?').run(sid);
    const labels = [
      ...Object.entries(metadata.moodScores).map(([value, score]) => ['mood', value, score]),
      ...Object.entries(metadata.activityScores).map(([value, score]) => ['activity', value, score]),
      ...valuesFor(metadata, 'genre').filter(v => normalize(v) !== 'unknown').map(v => ['genre', v, 1]),
      ...valuesFor(metadata, 'language').filter(v => normalize(v) !== 'unknown').map(v => ['language', v, 1]),
    ];
    for (const [kind, value, score] of labels) await db.prepare('INSERT OR IGNORE INTO track_labels(song_id,kind,value,score,source,version) VALUES (?,?,?,?,?,?)').run(sid, kind, value, score, metadata.labelSource || metadata.tagSource, metadata.labelVersion);
    await db.prepare('UPDATE catalog_imports SET song_id=?,status=?,issues=? WHERE source_key=?').run(sid, metadata.catalogStatus, JSON.stringify(metadata.qualityIssues), key);
    await db.prepare('UPDATE catalog_imports SET status=?,issues=? WHERE song_id=?').run(metadata.catalogStatus, JSON.stringify(metadata.qualityIssues), sid);
    // Compatibility mappings only; catalog_imports supports multiple source records per track.
    if (raw.mbid) await db.prepare('INSERT OR IGNORE INTO provider_songs(mbid,song_id) VALUES (?,?)').run(raw.mbid, sid);
    if (raw.discogsId) await db.prepare('INSERT OR IGNORE INTO discogs_songs(discogs_id,song_id) VALUES (?,?)').run(raw.discogsId, sid);
    const added = userId === null ? 0 : (await db.prepare('INSERT OR IGNORE INTO user_songs VALUES (?,?)').run(userId, sid)).changes;
    if (raw.mbid && !raw.labelsReviewed && !raw.enrichedAt) await enqueueJob(db, `enrich:${key}`, 'enrich', { sourceKey: key });
    return { song: metadata, added };
  });
}
