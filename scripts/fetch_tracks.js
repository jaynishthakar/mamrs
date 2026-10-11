import { openDatabase } from '../src/database.js';
import { extendedCatalog } from '../src/extendedCatalog.js';
import { ingestTrack } from '../src/ingestion.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Editorial bootstrap only. Live discovery is handled by catalog-worker.js.
export async function seedExtendedCatalog(path = process.env.DATABASE_URL || resolve('data/mamrs.sqlite')) {
  const db = openDatabase(path);
  try {
    for (const raw of extendedCatalog) await ingestTrack(db, { ...raw, source: 'Editorial starter', tagSource: 'Editorial', labelSource: 'Editorial', labelsReviewed: true }, { shared: true });
    return { seeded: extendedCatalog.length };
  } finally { await db.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seedExtendedCatalog(process.argv[2] || process.env.DATABASE_URL || resolve('data/mamrs.sqlite')).then(console.log).catch(error => { console.error(error.message); process.exitCode = 1; });
}
