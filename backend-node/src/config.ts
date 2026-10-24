import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import type { ModelData } from './domain.js';

// src 与编译后的 dist 都在 backend-node 下；启动目录不会影响附件和数据路径。
export const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
dotenv.config({ path: path.join(PROJECT_ROOT, '.env'), quiet: true });
export const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://shiti:shiti_local@127.0.0.1:55439/shiti';
export async function loadModel(): Promise<ModelData> {
  try {
    return JSON.parse(await readFile(path.join(PROJECT_ROOT, 'data/model.json'), 'utf8'));
  } catch (cause) {
    throw new Error('无法读取 data/model.json；请先在项目根目录运行 python scripts/prepare_data.py。', { cause });
  }
}
