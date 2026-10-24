import path from 'node:path';
import { createPool } from './db.js';
import { loadModel, PROJECT_ROOT } from './config.js';
import { importWelds, seedDemo } from './data.js';

const command = process.argv[2];
if (command !== 'import' && command !== 'seed-demo') {
  console.error('用法: npm run import 或 npm run seed-demo');
  process.exitCode = 1;
} else {
  const pool = createPool();
  try {
    if (command === 'import') {
      const count = await importWelds(pool, path.join(PROJECT_ROOT, 'data/welds.jsonl'));
      console.log(JSON.stringify({ command, processed_rows: count, existing_dates_preserved: true }));
    } else {
      const count = await seedDemo(pool, await loadModel());
      console.log(JSON.stringify({ command, updated_rows: count, existing_dates_preserved: true }));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally { await pool.end(); }
}
