import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPool } from '../src/db.js';
import { importWelds, seedDemo } from '../src/data.js';
import type { ModelData } from '../src/domain.js';

test('batch import normalizes keys, keeps stored dates, and rolls back invalid later rows', async () => {
  const pool = createPool();
  const temp = await mkdtemp(path.join(os.tmpdir(), 'shiti-node-'));
  const file = path.join(temp, 'welds.jsonl');
  const row = { line_no: '__node_import__', weld_no: 'W1', material_1: 'P1', material_2: '-', welded_on: null, is_model: true };
  try {
    await pool.query(await readFile(new URL('../../shared/schema.sql', import.meta.url), 'utf8'));
    await writeFile(file, JSON.stringify({ ...row, line_no: ' __node_ import__ ' }));
    await importWelds(pool, file, 1);
    const first = await pool.query('SELECT * FROM weld_records WHERE line_no=$1', [row.line_no]);
    assert.equal(first.rowCount, 1);
    await pool.query('UPDATE weld_records SET welded_on=$2 WHERE line_no=$1', [row.line_no, '2024-02-29']);
    await importWelds(pool, file, 1);
    assert.equal((await pool.query('SELECT welded_on FROM weld_records WHERE line_no=$1', [row.line_no])).rows[0].welded_on, '2024-02-29');
    await writeFile(file, [JSON.stringify({ ...row, weld_no: 'W2' }), JSON.stringify({ ...row, weld_no: 'W3', welded_on: '2026-02-30' })].join('\n'));
    await assert.rejects(importWelds(pool, file, 1));
    assert.equal((await pool.query('SELECT * FROM weld_records WHERE line_no=$1', [row.line_no])).rowCount, 1);
  } finally {
    await pool.query('DELETE FROM weld_records WHERE line_no=$1', [row.line_no]);
    await pool.end();
    await rm(temp, { recursive: true });
  }
});

test('demo seed fills only every third model weld and preserves dates on repeated execution', async () => {
  const pool = createPool();
  const line = '__node_seed__';
  const model = { model_welds: Array.from({ length: 7 }, (_, i) => ({ line_no: line, weld_no: String(i + 1) })) } as ModelData;
  try {
    await pool.query('INSERT INTO weld_records(line_no,weld_no,material_1,material_2,is_model,welded_on) SELECT $1,n::text,\'P\',\'-\',true,CASE WHEN n=2 THEN DATE \'2024-02-29\' ELSE null END FROM generate_series(1,7)n', [line]);
    await seedDemo(pool, model);
    const first = (await pool.query('SELECT weld_no,welded_on FROM weld_records WHERE line_no=$1 ORDER BY weld_no', [line])).rows;
    assert.equal(first.filter(row => row.welded_on !== null).length, 4);
    assert.equal(first[1].welded_on, '2024-02-29');
    assert.equal(first[0].welded_on, '2026-10-01');
    await seedDemo(pool, model);
    assert.deepEqual((await pool.query('SELECT weld_no,welded_on FROM weld_records WHERE line_no=$1 ORDER BY weld_no', [line])).rows, first);
  } finally {
    await pool.query('DELETE FROM weld_records WHERE line_no=$1', [line]);
    await pool.end();
  }
});
