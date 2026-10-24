import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Users/zhangjian/AppData/Local/ms-playwright/chromium-1247/chrome-win64/chrome.exe',
  headless: true,
  args: process.env.SOFTWARE_GL === '1' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [],
});
const page = await browser.newPage({ viewport: { width: 1540, height: 960 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', entry => { if (entry.type() === 'error') errors.push(entry.text()); });
const base = process.env.BASE_URL || 'http://127.0.0.1:8088';
await page.goto(base, { waitUntil: 'domcontentloaded' });
try { await page.locator('.model-viewport[data-ready="true"]').waitFor({ timeout: 25000 }); }
catch (error) { errors.push(error.message); }
await page.waitForTimeout(2000);
await mkdir('test-results', { recursive: true });
await page.screenshot({ path: 'test-results/overview.png', fullPage: true });
const stats = await page.locator('.model-viewport').evaluate(el => ({ ...el.dataset }));
const alerts = await page.locator('[role="alert"]').allTextContents();
const result = { base, stats, alerts, errors, title: await page.title() };
await writeFile(path.join('test-results', 'inspection.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
