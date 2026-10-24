import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { buildApp } from '../src/app.js';
import { normalizeId, isValidDate } from '../src/domain.js';

const line = '__node_contract__';
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgresql://shiti:shiti_local@127.0.0.1:55439/shiti' });
const model = {
  source: { asset_dir: 'backend-node/test/assets' }, summary: { test: true }, tree: [{ id: 'root' }],
  components: [
    { id: 'weld-business', name: '焊点', line_no: line, kind: 'weld', properties: {}, geometry_ids: ['g-weld'], bounds: null },
    { id: 'pipe-business', name: '管件', line_no: line, kind: 'pipe', properties: {}, geometry_ids: ['g-pipe'], bounds: null }
  ],
  geometry_to_component: { 'g-weld': 'weld-business', 'g-pipe': 'pipe-business' },
  node_to_component: { 'leaf-pipe': 'pipe-business' },
  model_welds: [{ line_no: line, weld_no: 'W1', component_id: 'weld-business', side_1_ids: ['pipe-business'], side_2_ids: [], missing_sides: [2] }]
};
let app: Awaited<ReturnType<typeof buildApp>>;
before(async () => {
  await pool.query(await readFile(new URL('../../shared/schema.sql', import.meta.url), 'utf8'));
  await pool.query('INSERT INTO weld_records (line_no,weld_no,material_1,material_2,is_model,welded_on) VALUES ($1,$2,$3,$4,true,null) ON CONFLICT (line_no,weld_no) DO UPDATE SET welded_on=null', [line, 'W1', 'P1', '-']);
  app = await buildApp({ model, pool, logger: false });
});
after(async () => {
  if (app) await app.close();
  await pool.query('DELETE FROM weld_records WHERE line_no=$1', [line]);
  await pool.end();
});

test('normalization removes internal business-ID whitespace', () => {
  assert.equal(normalizeId(' A\u00a0 B\t\nC '), 'ABC');
  assert.equal(normalizeId(' - '), '');
});
test('date validator rejects impossible dates and accepts leap day', () => {
  assert.equal(isValidDate('2026-02-29'), false);
  assert.equal(isValidDate('2026-04-31'), false);
  assert.equal(isValidDate('2024-02-29'), true);
  assert.equal(isValidDate('2026-1-01'), false);
});
test('health, model and all component lookup IDs follow the contract', async () => {
  assert.deepEqual((await app.inject('/api/health')).json(), { status: 'ok', backend: 'nodejs', database: 'ok' });
  assert.deepEqual((await app.inject('/api/model/summary')).json(), model.summary);
  assert.deepEqual((await app.inject('/api/model/tree')).json(), { roots: model.tree });
  for (const id of ['pipe-business', 'g-pipe', 'leaf-pipe']) {
    assert.equal((await app.inject(`/api/components/${id}`)).json().id, 'pipe-business');
  }
  assert.equal((await app.inject('/api/components/missing')).statusCode, 404);
  assert.equal((await app.inject('/api/components?search=管件&limit=1')).json().total, 1);
});
test('pagination rejects fractions, exponential notation, negatives, and oversized limits', async () => {
  for (const route of ['components', 'welds']) {
    for (const query of ['limit=1.5', 'limit=1e2', 'limit=0', 'limit=1001', 'offset=-1', 'offset=1e2', 'offset=', 'limit=2&limit=3']) {
      assert.equal((await app.inject(`/api/${route}?${query}`)).statusCode, 422, `${route} ${query}`);
    }
  }
});
test('reserved search query rejects duplicate values on every list endpoint', async () => {
  for (const route of ['components', 'welds']) {
    assert.equal((await app.inject(`/api/${route}?search=a&search=b`)).statusCode, 422, route);
  }
});
test('PUT accepts only one real ISO calendar date field, and propagates completion', async () => {
  const url = `/api/welds/${line}/W1`;
  for (const payload of [{}, { welded_on: '2026-02-29' }, { welded_on: 20261001 }, { welded_on: '' }, { welded_on: '2026-10-01', extra: true }, { welded_on: '2026-04-31' }, { welded_on: [] }]) {
    assert.equal((await app.inject({ method: 'PUT', url, payload })).statusCode, 422, JSON.stringify(payload));
  }
  const updated = await app.inject({ method: 'PUT', url, payload: { welded_on: '2026-10-22' } });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().welded_on, '2026-10-22');
  assert.match(updated.json().updated_at, /Z$/);
  const read = await app.inject(url);
  assert.equal(read.json().welded_on, '2026-10-22');
  assert.match(read.headers['cache-control'] as string, /no-store/);
  const progress = await app.inject('/api/progress');
  assert.deepEqual(progress.json(), {
    total_welds: 1, completed_welds: 1, percentage: 100,
    completed_component_ids: ['pipe-business', 'weld-business'],
    completed_geometry_ids: ['g-pipe', 'g-weld'],
    missing_links: [{ line_no: line, weld_no: 'W1', side: 2 }]
  });
  assert.match(progress.headers['cache-control'] as string, /no-store/);
  const page = (await app.inject('/api/welds')).json();
  assert.equal(page.total, 1);
  assert.equal(page.items[0].welded_on, '2026-10-22');
  assert.equal((await app.inject(`/api/welds/${line}/missing`)).statusCode, 404);
  assert.equal((await app.inject({ method: 'PUT', url, payload: { welded_on: null } })).json().welded_on, null);
  assert.equal((await app.inject('/api/progress')).json().completed_welds, 0);
});
