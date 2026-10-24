import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import type { Component, Page as ApiPage, Progress, WeldRecord } from '../src/types';

const line = 'WW-08001-80-QHA';
const weldPath = `/api/welds/${line}/1`;

function colorPixels(buffer: Buffer, color: 'selected' | 'completed'): number {
  const png = PNG.sync.read(buffer);
  let count = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const x = (i / 4) % png.width, y = Math.floor(i / 4 / png.width);
    if (x < 80 || x > png.width - 80 || y < 80 || y > png.height - 80) continue;
    const r = png.data[i]!, g = png.data[i + 1]!, b = png.data[i + 2]!;
    if (color === 'selected' ? r > 120 && g > 80 && r > g * 1.1 && b < g * .7
      : g > 70 && r < g * .6 && b < g * .95) count++;
  }
  return count;
}

async function loaded(page: Page) {
  await page.goto('/');
  await expect(page.locator('.model-viewport')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.model-viewport')).toHaveAttribute('data-initial-loaded-ms', /^[0-9.]+$/);
  await expect(page.getByTestId('completed-welds')).not.toContainText('—');
}

async function selectWeld(page: Page): Promise<Component> {
  const response = await page.request.get(`/node-api/api/components?line_no=${line}&limit=1000`);
  const data = await response.json() as ApiPage<Component>;
  const weld = data.items.find(item => item.kind === 'Weld' && item.weld_no === '1');
  if (!weld) throw new Error('Fixture weld missing');
  await page.getByTestId('tree-search').fill(weld.id);
  await page.locator(`[data-node-id="${weld.id}"] .tree-select`).click();
  await expect(page.getByTestId('weld-date')).toBeVisible();
  await expect.poll(async () => Number(await page.locator('.model-viewport').getAttribute('data-selected-feature-count'))).toBeGreaterThan(0);
  return weld;
}

test('cold model, offline assets, progress coloring and review controls', async ({ page }, testInfo) => {
  const errors: string[] = [];
  const external: string[] = [];
  const expectedHost = new URL(testInfo.project.use.baseURL ?? 'http://127.0.0.1:8088').hostname;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const host = new URL(route.request().url()).hostname;
    if (host === expectedHost) return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  await loaded(page);
  const first = Number(await page.locator('.model-viewport').getAttribute('data-first-visible-ms'));
  const initial = Number(await page.locator('.model-viewport').getAttribute('data-initial-loaded-ms'));
  expect(first).toBeGreaterThan(0);
  expect(first).toBeLessThan(15_000);
  expect(initial).toBeLessThan(15_000);
  expect(external).toEqual([]);
  await expect.poll(async () => Number(await page.locator('.model-viewport').getAttribute('data-progress-feature-count'))).toBeGreaterThan(0);
  const colored = await page.locator('.model-viewport canvas').screenshot();
  expect(colorPixels(colored, 'completed')).toBeGreaterThan(10);
  await page.getByTestId('progress-toggle').uncheck();
  await expect(page.locator('.model-viewport')).toHaveAttribute('data-progress-feature-count', '0');
  const plain = await page.locator('.model-viewport canvas').screenshot();
  expect(plain.equals(colored)).toBe(false);
  await page.getByTestId('progress-toggle').check();
  const before = await page.locator('.model-viewport canvas').screenshot();
  await page.getByTestId('zoom-in').click();
  await page.waitForTimeout(150);
  expect((await page.locator('.model-viewport canvas').screenshot()).equals(before)).toBe(false);
  await page.getByRole('button', { name: '向右平移', exact: true }).click();
  await page.getByRole('button', { name: '俯视', exact: true }).click();
  await page.getByTestId('home-view').click();
  await page.waitForTimeout(900);
  // 相机与 LOD 恢复后仍须在真实画布重放着色，不能靠历史缓存计数通过。
  const restoredColor = await page.locator('.model-viewport canvas').screenshot();
  expect(colorPixels(restoredColor, 'completed')).toBeGreaterThan(10);
  await page.getByTestId('progress-toggle').uncheck();
  await page.waitForTimeout(150);
  expect((await page.locator('.model-viewport canvas').screenshot()).equals(restoredColor)).toBe(false);
  await page.getByTestId('progress-toggle').check();
  await page.waitForTimeout(150);
  await page.screenshot({ path: testInfo.outputPath('overview.png'), fullPage: true });
  await testInfo.attach('cold-load', { body: JSON.stringify({ first_visible_ms: first, initial_loaded_ms: initial }), contentType: 'application/json' });
  expect(errors).toEqual([]);
});

test('tree selects complete business geometry and canvas reverses to tree and properties', async ({ page }, testInfo) => {
  await loaded(page);
  const weld = await selectWeld(page);
  await expect(page.getByTestId('property-panel')).toContainText(line);
  await expect(page.getByTestId('property-panel')).toContainText('EP3D_焊点编号');
  await page.waitForTimeout(900);
  expect(colorPixels(await page.locator('.model-viewport canvas').screenshot(), 'selected')).toBeGreaterThan(10);
  await page.screenshot({ path: testInfo.outputPath('selected-weld.png'), fullPage: true });
  const canvas = page.locator('.model-viewport canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('No model canvas');
  let picked = false;
  for (const [dx, dy] of [[0, 0], [20, 0], [-20, 0], [0, 20], [0, -20], [40, 20], [-40, -20], [70, 0], [-70, 0]]) {
    await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
    await page.waitForTimeout(100);
    if (await page.locator('.tree-row[aria-selected="true"]').count()) { picked = true; break; }
  }
  expect(picked).toBe(true);
  await expect(page.getByTestId('tree-search')).toHaveValue('');
  await expect(page.locator('.tree-row[aria-selected="true"]')).toBeVisible();
  await expect(page.getByTestId('property-panel')).toContainText('原始属性');
  expect(await page.locator('.tree-row[aria-selected="true"]').getAttribute('data-node-id')).toBeTruthy();
  // 搜索管线后选择父分组，应包含多个业务对象而非一个几何片段。
  await page.getByTestId('tree-search').fill(line);
  const group = page.locator('.tree-select').filter({ hasText: line }).first();
  await group.click();
  await expect(page.getByTestId('property-panel')).toContainText('已选择');
  await expect.poll(async () => Number(await page.locator('.model-viewport').getAttribute('data-selected-feature-count'))).toBeGreaterThan(weld.geometry_ids.length);
});

test('date save, clear, reload and Python switch use the same database', async ({ page }) => {
  await loaded(page);
  const originalResponse = await page.request.get('/node-api' + weldPath);
  const original = await originalResponse.json() as WeldRecord;
  try {
    await selectWeld(page);
    await page.getByTestId('weld-date').fill('2024-02-29');
    if (original.welded_on !== '2024-02-29') await page.getByTestId('save-date').click();
    await expect(page.getByTestId('property-panel')).toContainText('已完成');
    await page.getByTestId('backend-select').selectOption('/python-api');
    await expect(page.locator('.model-viewport')).toHaveAttribute('data-ready', 'true');
    await expect.poll(async () => {
      const r = await page.request.get('/python-api' + weldPath);
      return (await r.json() as WeldRecord).welded_on;
    }).toBe('2024-02-29');
    await selectWeld(page);
    await expect(page.getByTestId('weld-date')).toHaveValue('2024-02-29');
    await page.reload();
    await expect(page.locator('.model-viewport')).toHaveAttribute('data-ready', 'true');
    await selectWeld(page);
    await expect(page.getByTestId('weld-date')).toHaveValue('2024-02-29');
    await page.getByTestId('backend-select').selectOption('/python-api');
    await expect(page.locator('.model-viewport')).toHaveAttribute('data-ready', 'true');
    await selectWeld(page);
    await page.getByTestId('clear-date').click();
    await expect(page.getByTestId('weld-date')).toHaveValue('');
    const after = await (await page.request.get('/node-api/api/progress')).json() as Progress;
    const python = await (await page.request.get('/python-api/api/progress')).json() as Progress;
    expect(after).toEqual(python);
  } finally {
    await page.request.put('/node-api' + weldPath, { data: { welded_on: original.welded_on } });
  }
});

test('actual rendered frames during orbit, pan and zoom stay within interactive budget', async ({ page }, testInfo) => {
  await loaded(page);
  const canvas = page.locator('.model-viewport canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('No canvas');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const samples = [];
  for (const gesture of ['orbit', 'pan', 'zoom'] as const) {
    await page.mouse.move(x, y);
    if (gesture !== 'zoom') await page.mouse.down({ button: gesture === 'pan' ? 'right' : 'left' });
    // 连续输入在浏览器内部驱动，避免每次RPC/trace截图读回阻塞GPU并污染测量。
    await page.evaluate(async ({ x, y, gesture }) => {
      const canvas = document.querySelector('.model-viewport canvas');
      if (!canvas) throw new Error('No canvas');
      for (let i = 0; i < 90; i++) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        if (gesture === 'zoom') canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: Math.sin(i / 12) * 5, bubbles: true, cancelable: true }));
        else canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', buttons: gesture === 'pan' ? 2 : 1,
          clientX: x + Math.sin(i / 20) * (gesture === 'pan' ? 35 : 130), clientY: y + Math.sin(i / 25) * 30, bubbles: true }));
      }
    }, { x, y, gesture });
    if (gesture !== 'zoom') await page.mouse.up({ button: gesture === 'pan' ? 'right' : 'left' });
    await page.waitForTimeout(550);
    const fps = Number(await page.locator('.model-viewport').getAttribute('data-fps'));
    const p95 = Number(await page.locator('.model-viewport').getAttribute('data-frame-p95'));
    samples.push({ gesture, fps, frame_p95_ms: p95 });
    expect(fps, gesture).toBeGreaterThanOrEqual(20);
    expect(p95, gesture).toBeLessThanOrEqual(50);
  }
  const renderer = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.model-viewport canvas');
    const gl = canvas?.getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'WebGL2';
  });
  await testInfo.attach('interaction-performance', { body: JSON.stringify({ samples, renderer }), contentType: 'application/json' });
});

test('read outage and invalid date response recover without changing the saved record', async ({ page }) => {
  await page.route('**/node-api/api/progress', route => route.fulfill({ status: 503, json: { error: '验收模拟读取故障' } }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('验收模拟读取故障');
  await expect(page.locator('.model-viewport')).toHaveAttribute('data-ready', 'true');
  await page.unroute('**/node-api/api/progress');
  await page.getByRole('button', { name: '重新读取', exact: true }).click();
  await expect(page.getByTestId('completed-welds')).not.toContainText('—');
  await expect(page.getByRole('alert')).toHaveCount(0);
  const original = await (await page.request.get('/node-api' + weldPath)).json() as WeldRecord;
  try {
    await selectWeld(page);
    const validDate = original.welded_on === '2024-02-29' ? '2024-03-01' : '2024-02-29';
    await page.getByTestId('weld-date').fill(validDate);
    // 日期选择器阻止非法日期；这里故意篡改出站请求，验证真实后端拒绝及界面恢复。
    await page.route('**/node-api' + weldPath, route => route.request().method() === 'PUT'
      ? route.continue({ postData: JSON.stringify({ welded_on: '2026-02-30' }) }) : route.continue());
    const rejected = page.waitForResponse(response => response.url().endsWith(weldPath) && response.request().method() === 'PUT');
    await page.getByTestId('save-date').click();
    expect((await rejected).status()).toBe(422);
    await expect(page.getByTestId('property-panel')).toContainText('保存失败');
    expect((await (await page.request.get('/node-api' + weldPath)).json() as WeldRecord).welded_on).toBe(original.welded_on);
    await page.unroute('**/node-api' + weldPath);
    await page.getByTestId('save-date').click();
    await expect.poll(async () => (await (await page.request.get('/node-api' + weldPath)).json() as WeldRecord).welded_on).toBe(validDate);
    await expect(page.getByTestId('property-panel')).toContainText('日期已保存');
  } finally {
    await page.unroute('**/node-api' + weldPath);
    await page.request.put('/node-api' + weldPath, { data: { welded_on: original.welded_on } });
  }
});
