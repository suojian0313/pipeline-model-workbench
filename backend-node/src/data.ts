import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import type { Pool } from 'pg';
import { PROJECT_ROOT } from './config.js';
import { isValidDate, normalizeId, weldKey, type ModelData } from './domain.js';

interface WeldInput { line_no: string; weld_no: string; material_1: string; material_2: string; welded_on: string | null; is_model: boolean; }
function validateRow(value: unknown, number: number): WeldInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`JSONL 第 ${number} 行不是对象`);
  const row = value as Record<string, unknown>;
  for (const key of ['line_no', 'weld_no', 'material_1', 'material_2']) {
    if (typeof row[key] !== 'string') throw new Error(`JSONL 第 ${number} 行 ${key} 必须是字符串`);
  }
  const line = normalizeId(row.line_no as string);
  const weld = normalizeId(row.weld_no as string);
  if (!line || !weld || typeof row.is_model !== 'boolean'
    || (row.welded_on !== null && !isValidDate(row.welded_on))) throw new Error(`JSONL 第 ${number} 行标识、日期或 is_model 非法`);
  return { line_no: line, weld_no: weld, material_1: row.material_1 as string, material_2: row.material_2 as string,
    welded_on: row.welded_on as string | null, is_model: row.is_model };
}

export async function importWelds(pool: Pool, file: string, batchSize = 1000): Promise<number> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5000) throw new Error('batchSize 必须在 1..5000 之间');
  const client = await pool.connect();
  let stream: ReturnType<typeof createReadStream> | undefined;
  let lines: ReturnType<typeof createInterface> | undefined;
  let count = 0;
  let lineNumber = 0;
  let batch = new Map<string, WeldInput>();
  async function flush() {
    if (!batch.size) return;
    const values: unknown[] = [];
    const slots: string[] = [];
    for (const row of batch.values()) {
      const start = values.length;
      values.push(row.line_no, row.weld_no, row.material_1, row.material_2, row.welded_on, row.is_model);
      slots.push(`(${Array.from({ length: 6 }, (_, i) => `$${start + i + 1}`).join(',')})`);
    }
    // 冲突仅刷新来源属性，已录入的焊接日期和日期更新时间绝不被导入覆盖。
    await client.query(`INSERT INTO weld_records(line_no,weld_no,material_1,material_2,welded_on,is_model)
      VALUES ${slots.join(',')} ON CONFLICT(line_no,weld_no) DO UPDATE SET
      material_1=EXCLUDED.material_1,material_2=EXCLUDED.material_2,is_model=EXCLUDED.is_model`, values);
    batch = new Map();
  }
  try {
    await client.query('BEGIN');
    await client.query(await readFile(path.join(PROJECT_ROOT, 'shared/schema.sql'), 'utf8'));
    // readline 创建后立即消费，避免先 await 数据库时小文件已发完所有行。
    stream = createReadStream(file, { encoding: 'utf8' });
    lines = createInterface({ input: stream, crlfDelay: Infinity });
    for await (const text of lines) {
      lineNumber++;
      if (!text.trim()) continue;
      const row = validateRow(JSON.parse(text), lineNumber);
      batch.set(weldKey(row.line_no, row.weld_no), row);
      count++;
      if (batch.size >= batchSize) await flush();
    }
    await flush();
    await client.query('COMMIT');
    return count;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    lines?.close();
    stream?.destroy();
    client.release();
  }
}

export async function seedDemo(pool: Pool, model: ModelData): Promise<number> {
  const client = await pool.connect();
  let changed = 0;
  try {
    await client.query('BEGIN');
    for (const [index, weld] of model.model_welds.entries()) {
      if (index % 3 !== 0) continue;
      const date = `2026-10-${String(index % 28 + 1).padStart(2, '0')}`;
      const result = await client.query(`UPDATE weld_records SET welded_on=$3::date,updated_at=CURRENT_TIMESTAMP
        WHERE line_no=$1 AND weld_no=$2 AND welded_on IS NULL`, [normalizeId(weld.line_no), normalizeId(weld.weld_no), date]);
      changed += result.rowCount ?? 0;
    }
    await client.query('COMMIT');
    return changed;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
