// Playwright と Chromium を探して起動する共通処理
import { execSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

async function loadPlaywright() {
  try { return await import('playwright'); } catch {}
  const g = execSync('npm root -g').toString().trim();
  return await import(pathToFileURL(path.join(g, 'playwright', 'index.mjs')).href);
}

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const APP_URL = pathToFileURL(path.join(ROOT, 'index.html')).href;

export async function openApp(opts = {}) {
  const { chromium } = await loadPlaywright();
  const exe = process.env.PW_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2, ...opts });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(APP_URL);
  await page.waitForTimeout(500);
  return { browser, page, errors };
}
