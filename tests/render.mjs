// 全図記号を並べた回路を描いてスクリーンショットを保存する
// 使い方: node tests/render.mjs out.png
import { openApp } from './_browser.mjs';

const out = process.argv[2] || 'render.png';
const { browser, page, errors } = await openApp();
await page.evaluate(() => {
  const CT = ['NO', 'NC', 'PB_NO', 'PB_NC', 'CSS', 'CSNC', 'COS', 'COSL', 'RNO', 'RNC', 'TNO', 'TNC'];
  const OUT = ['COIL', 'RCOIL', 'SET', 'RST', 'TON', 'TOF', 'GL', 'RL', 'OL', 'WL', 'COIL', 'COIL'];
  const d = mkDiag(); systems[curSys].diagram = d; d.cols = CT.length; const N = d.nrow || NROW_DEF;
  for (let c = 0; c < CT.length; c++) for (let r = 0; r < N; r++) d.vsegs[c + ',' + r] = mkE('WIRE', '', 5, '');
  CT.forEach((t, c) => { d.vsegs[c + ',0'] = mkE(t, t.startsWith('CS') ? 'CS1' : t.startsWith('PB') ? 'PB1' : t.startsWith('CO') ? 'COS1' : t, 5, ''); });
  OUT.forEach((t, c) => { d.vsegs[c + ',' + (N - 1)] = mkE(t, t + c, 10, ''); });
  d.hsegs['0,2'] = 'br'; d.hsegs['1,2'] = 'bl';
  resize(); drawAll();
});
await page.waitForTimeout(300);
await page.locator('#cv').screenshot({ path: out });
console.log(`保存: ${out}`, errors.length ? errors : '');
await browser.close();
process.exit(errors.length ? 1 : 0);
