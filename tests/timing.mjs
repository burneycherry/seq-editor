// タイマー（TON/TOF）とリレー動作遅延が実時間どおりか計測する
import { openApp } from './_browser.mjs';

const TOL = 0.1; // 許容誤差（秒）
const { browser, page, errors } = await openApp();

async function measure(kind, sec) {
  return page.evaluate(async ([kind, sec]) => {
    const d = mkDiag(); systems[curSys].diagram = d; d.cols = 2;
    for (let c = 0; c < 2; c++) for (let r = 0; r < (d.nrow || NROW_DEF); r++) d.vsegs[c + ',' + r] = mkE('WIRE', '', 5, '');
    const wait = async f => { const t0 = performance.now(); while (!f()) { await new Promise(r => setTimeout(r, 5)); if (performance.now() - t0 > 15000) return null; } };
    if (simOn) toggleSim();
    if (kind === 'DELAY') {
      d.vsegs['0,0'] = mkE('NO', 'X1', 5, ''); d.vsegs['0,1'] = mkE('RCOIL', 'R1', 5, '');
      relayDelayMs = sec * 1000; toggleSim();
      simSt['X1'] = true; runSim(); const t0 = performance.now();
      await wait(() => simRel['R1'] === true);
      const dt = performance.now() - t0; toggleSim(); relayDelayMs = 0; return dt / 1000;
    }
    d.vsegs['0,0'] = mkE('NO', 'X1', 5, ''); d.vsegs['0,1'] = mkE(kind, 'T1', sec, '');
    relayDelayMs = 0; toggleSim();
    simSt['X1'] = true; runSim(); let t0 = performance.now();
    if (kind === 'TOF') { await new Promise(r => setTimeout(r, 300)); simSt['X1'] = false; runSim(); t0 = performance.now(); }
    await wait(() => !!simRel['T1'] === (kind === 'TON'));
    const dt = performance.now() - t0; toggleSim(); return dt / 1000;
  }, [kind, sec]);
}

let ng = 0;
for (const [kind, sec] of [['TON', 3], ['TON', 1], ['TOF', 2], ['DELAY', 0.8]]) {
  const got = await measure(kind, sec);
  const ok = got !== null && Math.abs(got - sec) <= TOL;
  if (!ok) ng++;
  console.log(`${ok ? 'OK' : 'NG'} ${kind} 設定 ${sec}s → 実測 ${got === null ? 'タイムアウト' : got.toFixed(3) + 's'}`);
}
if (errors.length) { ng++; console.log('ページエラー:', errors); }
await browser.close();
process.exit(ng ? 1 : 0);
