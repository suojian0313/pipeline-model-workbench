import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'public/cesium');
await mkdir(output, { recursive: true });
for (const dir of ['Workers', 'Assets', 'Widgets', 'ThirdParty']) {
  await cp(path.join(root, 'node_modules/cesium/Build/Cesium', dir), path.join(output, dir), { recursive: true });
}
console.log('Cesium workers, assets and decoders copied locally.');
