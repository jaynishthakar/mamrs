import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPgDatabase } from '../src/pgDatabase.js';

test('PostgreSQL transactions use one client and isolate simultaneous transactions', async () => {
  const calls = [], released = [];
  let next = 0;
  const pool = {
    async connect() {
      const id = ++next;
      return { async query(sql) { calls.push({ id, sql }); return { rows: sql.includes('count(*)') ? [{ count: 1 }] : [{ id: 88 }], rowCount: 1 }; }, release() { released.push(id); } };
    },
    async query(sql) { calls.push({ id: 'pool', sql }); return { rows: [], rowCount: 0 }; },
    async end() {},
  };
  const db = createPgDatabase('postgresql://localhost/test', { pool });
  await db.ready();
  calls.length = 0;
  await Promise.all([
    db.withTransaction(async () => { await db.prepare('INSERT INTO songs(metadata) VALUES (?)').run('{}'); await db.prepare('SELECT * FROM songs').all(); }),
    db.withTransaction(async () => { await db.prepare('UPDATE songs SET metadata=? WHERE id=?').run('{}', 88); }),
  ]);
  assert.equal(calls.some(c => c.id === 'pool'), false);
  for (const id of [2, 3]) {
    const statements = calls.filter(c => c.id === id).map(c => c.sql);
    assert.equal(statements[0], 'BEGIN'); assert.equal(statements.at(-1), 'COMMIT');
  }
  await assert.rejects(db.withTransaction(async () => { await db.exec('SELECT 1'); throw new Error('Failure'); }), /Failure/);
  assert.equal(calls.at(-1).sql, 'ROLLBACK');
  assert.deepEqual(released.sort(), [1, 2, 3, 4]);
});
