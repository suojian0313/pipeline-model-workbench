import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Users/zhangjian/AppData/Local/ms-playwright/chromium-1247/chrome-win64/chrome.exe', headless: true });
const page = await browser.newPage();
console.log(await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return { available: false };
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return { available: true, vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
}));
await browser.close();
