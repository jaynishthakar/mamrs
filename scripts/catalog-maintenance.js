import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDatabase } from '../src/database.js';
import { cleanTrack } from '../src/catalogQuality.js';
import { ingestTrack, sourceKey } from '../src/ingestion.js';
import { moods, activities } from '../src/catalog.js';

const db = openDatabase(process.env.DATABASE_URL || process.env.DATABASE_PATH || resolve('data/mamrs.sqlite'));
try {
  const [mode = 'audit', file] = process.argv.slice(2);
  if (mode === 'labels') {
    const labels = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(labels)) throw new Error('Expected an array of reviewed label records.');
    // Validate the complete label batch before making any writes.
    for (const label of labels) {
      if (!label.sourceKey || typeof label.labelSource !== 'string' || !label.labelSource.trim() || label.labelsReviewed !== true) throw new Error('Each label needs sourceKey, labelSource and labelsReviewed: true.');
      for (const [field, allowed] of [['moodScores', moods], ['activityScores', activities]]) {
        const scores = label[field];
        if (!scores || typeof scores !== 'object' || Array.isArray(scores) || !Object.keys(scores).length || !Object.entries(scores).every(([key, value]) => allowed.includes(key) && Number.isFinite(value) && value > 0 && value <= 1)) throw new Error(`Invalid ${field} for ${label.sourceKey}.`);
      }
      if (label.labelVersion !== undefined && (!Number.isInteger(label.labelVersion) || label.labelVersion < 1)) throw new Error('Label version must be a positive integer.');
      if (!(await db.prepare('SELECT source_key FROM catalog_imports WHERE source_key=?').get(label.sourceKey))) throw new Error(`Unknown staged source: ${label.sourceKey}`);
    }
    let updated = 0;
    for (const label of labels) {
      if (!label.sourceKey || !label.labelSource || label.labelsReviewed !== true) throw new Error('Each label needs sourceKey, labelSource and labelsReviewed: true.');
      const record = await db.prepare('SELECT raw_metadata FROM catalog_imports WHERE source_key=?').get(label.sourceKey);
      if (!record) throw new Error(`Unknown staged source: ${label.sourceKey}`);
      const raw = JSON.parse(record.raw_metadata);
      await ingestTrack(db, { ...raw, moodScores: label.moodScores, activityScores: label.activityScores, language: label.language || raw.language, labelSource: label.labelSource, labelsReviewed: true, labelVersion: label.labelVersion || 1 }, { shared: true });
      updated++;
    }
    console.log(JSON.stringify({ updated }));
  } else if (['audit', 'clean'].includes(mode)) {
    const rows = await db.prepare('SELECT id,metadata FROM songs ORDER BY id').all();
    const report = [];
    for (const row of rows) {
      let song;
      try {
        const raw = JSON.parse(row.metadata);
        song = cleanTrack(raw);
        if (raw.isCatalog && !raw.mbid && !raw.discogsId) Object.assign(song, { source: 'Editorial starter', tagSource: 'Editorial', labelSource: 'Editorial' });
      } catch (error) { report.push({ id: row.id, status: 'needs_review', issues: [error.message] }); continue; }
      report.push({ id: row.id, title: song.title, status: song.catalogStatus, issues: song.qualityIssues });
      if (mode === 'clean') {
        // Keep all IDs and references. Quarantine suspicious rows instead of deleting them.
        await db.prepare('UPDATE songs SET metadata=? WHERE id=?').run(JSON.stringify(song), row.id);
        let identified = true;
        try { sourceKey(song); } catch { identified = false; }
        if (identified) await ingestTrack(db, song);
      }
    }
    if (file) {
      writeFileSync(file, JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ tracks: report.length, statuses: Object.fromEntries(['ready', 'pending', 'needs_review'].map(status => [status, report.filter(r => r.status === status).length])), report: file }));
    } else console.log(JSON.stringify(report, null, 2));
  } else throw new Error('Use audit, clean, or labels <reviewed-labels.json>.');
} finally { await db.close(); }
