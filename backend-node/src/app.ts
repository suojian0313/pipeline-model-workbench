import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import path from 'node:path';
import type { Pool } from 'pg';
import { loadModel, PROJECT_ROOT } from './config.js';
import { createPool, MODEL_SCOPE_SQL, modelScope, serializeWeld, WELD_FIELDS } from './db.js';
import { isValidDate, normalizeId, weldKey, type ModelData } from './domain.js';

export interface AppOptions { model?: ModelData; pool?: Pool; logger?: boolean; assetDir?: string; }
class InputError extends Error { statusCode = 422; }
function pagination(query: Record<string, unknown>, defaultLimit: number) {
  // 保留字段即使未参与当前路由过滤，也统一拒绝重复参数产生的数组。
  optionalString(query, 'search');
  function integer(name: string, fallback: number, min: number, max: number): number {
    const value = query[name];
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new InputError(`${name} 必须是整数`);
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < min || number > max) throw new InputError(`${name} 超出允许范围`);
    return number;
  }
  return { offset: integer('offset', 0, 0, Number.MAX_SAFE_INTEGER), limit: integer('limit', defaultLimit, 1, 1000) };
}
function optionalString(query: Record<string, unknown>, name: string): string {
  const value = query[name];
  if (value === undefined) return '';
  if (typeof value !== 'string') throw new InputError(`${name} 必须是一个字符串`);
  return normalizeId(value);
}
export async function buildApp(options: AppOptions = {}) {
  const model = options.model ?? await loadModel();
  const pool = options.pool ?? createPool();
  const app = Fastify({ logger: options.logger ?? true });
  if (!options.pool) app.addHook('onClose', async () => { await pool.end(); });
  const components = new Map(model.components.map(component => [normalizeId(component.id), component]));
  const lookups = new Map<string, string>();
  for (const [id, business] of Object.entries({ ...model.geometry_to_component, ...model.node_to_component })) {
    lookups.set(normalizeId(id), normalizeId(business));
  }
  const scope = modelScope(model);
  await app.register(cors, { origin: true });
  await app.register(staticFiles, {
    root: options.assetDir ?? path.resolve(PROJECT_ROOT, model.source.asset_dir), prefix: '/models/',
    index: false, dotfiles: 'deny'
  });
  app.setErrorHandler((error, request, reply) => {
    const cause = error instanceof Error ? error : null;
    const status = cause && 'statusCode' in cause && typeof cause.statusCode === 'number' ? cause.statusCode : 500;
    if (status >= 500) request.log.error(error);
    reply.code(status).send({ error: status >= 500 ? '服务器内部错误' : cause?.message ?? '请求失败' });
  });
  app.addHook('onSend', async (request, reply, payload) => {
    if (request.method === 'GET' && /^\/api\/(welds|progress)(\/|\?|$)/.test(request.url)) {
      reply.header('Cache-Control', 'no-store, max-age=0');
    }
    return payload;
  });
  app.get('/api/health', async () => {
    await pool.query('SELECT 1');
    return { status: 'ok', backend: 'nodejs', database: 'ok' };
  });
  app.get('/api/model/summary', async () => model.summary);
  app.get('/api/model/tree', async () => ({ roots: model.tree }));
  app.get<{ Querystring: Record<string, unknown> }>('/api/components', async request => {
    const { offset, limit } = pagination(request.query, 100);
    const line = optionalString(request.query, 'line_no');
    const search = optionalString(request.query, 'search').toLowerCase();
    const filtered = model.components.filter(component => (!line || normalizeId(component.line_no) === line)
      && (!search || normalizeId(JSON.stringify(component)).toLowerCase().includes(search)));
    return { items: filtered.slice(offset, offset + limit), total: filtered.length, offset, limit };
  });
  app.get<{ Params: { id: string } }>('/api/components/:id', async (request, reply) => {
    const id = normalizeId(request.params.id);
    const component = components.get(id) ?? components.get(lookups.get(id) ?? '');
    return component ?? reply.code(404).send({ error: '构件不存在' });
  });
  app.get<{ Querystring: Record<string, unknown> }>('/api/welds', async request => {
    const { offset, limit } = pagination(request.query, 1000);
    const line = optionalString(request.query, 'line_no');
    const where = `${MODEL_SCOPE_SQL} AND ($3::text='' OR line_no=$3)`;
    // 同一次 SQL 读取总数和分页数据，避免并发导入时两次查询看到不同快照。
    const result = await pool.query(`WITH selected AS (SELECT ${WELD_FIELDS} FROM weld_records WHERE ${where}),
      page AS (SELECT * FROM selected ORDER BY line_no,weld_no OFFSET $4 LIMIT $5)
      SELECT (SELECT count(*)::int FROM selected) AS total,
      COALESCE((SELECT json_agg(page ORDER BY line_no,weld_no) FROM page),'[]'::json) AS items`, [...scope, line, offset, limit]);
    return { items: result.rows[0].items.map(serializeWeld), total: result.rows[0].total, offset, limit };
  });
  app.get<{ Params: { line_no: string; weld_no: string } }>('/api/welds/:line_no/:weld_no', async (request, reply) => {
    const values = [normalizeId(request.params.line_no), normalizeId(request.params.weld_no)];
    const result = await pool.query(`SELECT ${WELD_FIELDS} FROM weld_records WHERE line_no=$1 AND weld_no=$2`, values);
    return result.rows[0] ? serializeWeld(result.rows[0]) : reply.code(404).send({ error: '焊点不存在' });
  });
  app.put<{ Params: { line_no: string; weld_no: string }; Body: unknown }>('/api/welds/:line_no/:weld_no', async (request, reply) => {
    const body = request.body;
    if (typeof body !== 'object' || body === null || Array.isArray(body)
      || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'welded_on')) {
      throw new InputError('请求必须且只能包含 welded_on 字段');
    }
    const date = (body as { welded_on: unknown }).welded_on;
    if (date !== null && !isValidDate(date)) throw new InputError('welded_on 必须是有效的 YYYY-MM-DD 日期或 null');
    const result = await pool.query(`UPDATE weld_records SET welded_on=$3::date,updated_at=CURRENT_TIMESTAMP
      WHERE line_no=$1 AND weld_no=$2 RETURNING ${WELD_FIELDS}`,
    [normalizeId(request.params.line_no), normalizeId(request.params.weld_no), date]);
    return result.rows[0] ? serializeWeld(result.rows[0]) : reply.code(404).send({ error: '焊点不存在' });
  });
  app.get('/api/progress', async () => {
    const result = await pool.query(`SELECT line_no,weld_no FROM weld_records WHERE ${MODEL_SCOPE_SQL} AND welded_on IS NOT NULL`, scope);
    const complete = new Set(result.rows.map(row => weldKey(row.line_no, row.weld_no)));
    const componentIds = new Set<string>();
    const missing = new Map<string, { line_no: string; weld_no: string; side: number }>();
    for (const weld of model.model_welds) {
      if (!complete.has(weldKey(weld.line_no, weld.weld_no))) continue;
      for (const id of [weld.component_id, ...weld.side_1_ids, ...weld.side_2_ids]) {
        if (id) componentIds.add(normalizeId(id));
      }
      for (const side of weld.missing_sides) {
        const item = { line_no: normalizeId(weld.line_no), weld_no: normalizeId(weld.weld_no), side };
        missing.set(JSON.stringify(item), item);
      }
    }
    const geometryIds = new Set<string>();
    for (const id of componentIds) for (const geometry of components.get(id)?.geometry_ids ?? []) geometryIds.add(geometry);
    const missingLinks = [...missing.values()].sort((a, b) => a.line_no < b.line_no ? -1 : a.line_no > b.line_no ? 1 : a.weld_no < b.weld_no ? -1 : a.weld_no > b.weld_no ? 1 : a.side - b.side);
    const total = model.model_welds.length;
    return { total_welds: total, completed_welds: complete.size, percentage: total ? Math.round(complete.size / total * 10000) / 100 : 0,
      completed_component_ids: [...componentIds].sort(), completed_geometry_ids: [...geometryIds].sort(), missing_links: missingLinks };
  });
  return app;
}
