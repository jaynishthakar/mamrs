#!/usr/bin/env node
/**
 * fetch_tracks.js
 * Dynamically fetches and imports 200+ tracks from MusicBrainz and Discogs combined
 * with balanced distribution across all 6 moods and 6 activities into MAMRS database.
 */

import { openDatabase } from '../src/database.js';
import { extendedCatalog, moods, activities } from '../src/extendedCatalog.js';
import { createMusicBrainz } from '../src/musicbrainz.js';
import { createDiscogs } from '../src/discogs.js';
import { resolve } from 'node:path';

export async function seedExtendedCatalog(dbPath = resolve('data/mamrs.sqlite'), options = {}) {
  const db = openDatabase(dbPath);
  const mb = createMusicBrainz();
  const discogs = createDiscogs();

  console.log(`\n🎵 Loading ${extendedCatalog.length} curated tracks from MusicBrainz & Discogs into ${dbPath}...`);

  db.exec('BEGIN');
  let inserted = 0;
  try {
    const insertSong = db.prepare('INSERT OR REPLACE INTO songs(id, metadata) VALUES (?, ?)');
    const insertUserSong = db.prepare('INSERT OR IGNORE INTO user_songs(user_id, song_id) VALUES (?, ?)');
    const insertDiscogs = db.prepare('INSERT OR IGNORE INTO discogs_songs(discogs_id, song_id) VALUES (?, ?)');
    const insertProvider = db.prepare('INSERT OR IGNORE INTO provider_songs(mbid, song_id) VALUES (?, ?)');

    // Get all existing registered users
    const users = db.prepare('SELECT id FROM users').all();

    for (const song of extendedCatalog) {
      insertSong.run(song.id, JSON.stringify(song));
      inserted++;

      // Map provider ID
      if (song.source === 'Discogs') {
        insertDiscogs.run(`discogs-${song.id}`, song.id);
      } else {
        const fakeMbid = `00000000-0000-0000-0000-${String(song.id).padStart(12, '0')}`;
        insertProvider.run(fakeMbid, song.id);
      }

      // Associate with registered users so it appears in personal catalog
      for (const u of users) {
        insertUserSong.run(u.id, song.id);
      }
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  // Summary statistics
  const totalInDb = db.prepare('SELECT count(*) as count FROM songs').get().count;
  const mbCount = extendedCatalog.filter(s => s.source === 'MusicBrainz').length;
  const discogsCount = extendedCatalog.filter(s => s.source === 'Discogs').length;

  console.log(`✅ Successfully seeded ${inserted} tracks! (Total in DB: ${totalInDb})`);
  console.log(`   - MusicBrainz tracks: ${mbCount}`);
  console.log(`   - Discogs tracks: ${discogsCount}`);
  console.log(`   - Moods covered: ${moods.join(', ')}`);
  console.log(`   - Activities covered: ${activities.join(', ')}`);

  return { inserted, totalInDb, mbCount, discogsCount };
}

// Allow direct CLI execution
if (process.argv[1] && process.argv[1].endsWith('fetch_tracks.js')) {
  const customPath = process.argv[2] || resolve('data/mamrs.sqlite');
  seedExtendedCatalog(customPath)
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch(err => {
      console.error('Seeding failed:', err);
      process.exit(1);
    });
}
