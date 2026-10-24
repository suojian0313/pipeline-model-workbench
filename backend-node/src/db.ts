import pg, { type Pool, type QueryResultRow } from 'pg';
import { DATABASE_URL } from './config.js';
import type { ModelData } from './domain.js';
import { normalizeId } from './domain.js';

// PostgreSQL DATE 是日历日期，直接保留文本，防止转换 Date 后跨时区偏移一天。
pg.types.setTypeParser(1082, (value) => value);
export function createPool(): Pool { return new pg.Pool({ connectionString: DATABASE_URL }); }
export const WELD_FIELDS = 'line_no,weld_no,material_1,material_2,welded_on,updated_at,is_model';
export function serializeWeld(row: QueryResultRow): Record<string, unknown> {
  return { ...row, updated_at: new Date(row.updated_at).toISOString() };
}
export function modelScope(model: ModelData): [string[], string[]] {
  return [model.model_welds.map(w => normalizeId(w.line_no)), model.model_welds.map(w => normalizeId(w.weld_no))];
}
// 数组参数配对展开，确保同管线的别的焊点不会混入本模型进度。
export const MODEL_SCOPE_SQL = '(line_no,weld_no) IN (SELECT * FROM unnest($1::text[],$2::text[]))';
