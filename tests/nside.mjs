// コイルの下（N 側）に接点がある回路で、通電判定と色付けが正しいか確認する
// 使い方: node tests/nside.mjs [スクリーンショット出力.png]
import { openApp } from './_browser.mjs';

const shot = process.argv[2];
const { browser, page, errors } = await openApp({ viewport: { width: 1000, height: 800 } });
const res = await page.evaluate(() => {
  const d = mkDiag(); systems[curSys].diagram = d; d.cols = 3; d.nrow = 3;
  d.vsegs['0,0'] = mkE('NO', 'A', 5, ''); d.vsegs['0,1'] = mkE('COIL', 'Y1', 5, ''); d.vsegs['0,2'] = mkE('NO', 'C', 5, '');
  d.vsegs['1,0'] = mkE('NO', 'B', 5, ''); d.vsegs['1,1'] = mkE('COIL', 'Y2', 5, '');
  d.vsegs['2,1'] = mkE('COIL', 'Y3', 5, ''); d.vsegs['2,2'] = mkE('WIRE', '', 5, '');
  d.hsegs['1,1'] = true; d.hsegs['0,2'] = true;
  resize(); if (simOn) toggleSim(); toggleSim();
  const st = () => ({ Y1: !!simRel.Y1, Y2: !!simRel.Y2, Y3: !!simRel.Y3, cTop: simEn.has('0,2'), cBottom: simEn.has('0,3'), hseg: simEn.has('0,2') && simEn.has('1,2') });
  simSt.A = simSt.B = simSt.C = true; runSim(); const allOn = st();
  simSt.C = false; runSim(); const cOff = st();
  simSt.C = true; runSim(); drawAll();
  return { allOn, cOff };
});
let ng = 0;
const expect = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) ng++; console.log(`${ok ? 'OK' : 'NG'} ${name}: ${JSON.stringify(got)}`); };
expect('A,B,C 全ON', res.allOn, { Y1: true, Y2: true, Y3: true, cTop: true, cBottom: true, hseg: true });
expect('C だけOFF', res.cOff, { Y1: false, Y2: false, Y3: true, cTop: false, cBottom: false, hseg: false });
if (shot) await page.locator('#cv').screenshot({ path: shot });
if (errors.length) { ng++; console.log('ページエラー:', errors); }
await browser.close();
process.exit(ng ? 1 : 0);
