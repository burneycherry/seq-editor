// シミュレーションの通電判定ロジックの回帰テスト
// 使い方: node tests/logic.mjs
import { openApp } from './_browser.mjs';

const { browser, page, errors } = await openApp({ viewport: { width: 1000, height: 800 } });

// ブラウザ内の共通ヘルパー（回路を組む・シムを開始する）
await page.evaluate(() => {
  window.__build = (spec, nrow = 4) => {
    const d = mkDiag(); d.cols = spec.cols; d.nrow = nrow;
    for (let c = 0; c < d.cols; c++) for (let r = 0; r < nrow; r++) d.vsegs[c + ',' + r] = mkE('WIRE', '', 5, '');
    for (const [k, t, l, p, cm] of spec.els) { if (t === null) delete d.vsegs[k]; else d.vsegs[k] = mkE(t, l, p || 5, cm || ''); }
    for (const [k, v] of spec.h || []) d.hsegs[k] = v;
    return d;
  };
  window.__start = (diagrams, delay = 0) => {
    if (simOn) toggleSim();
    systems = diagrams.map((d, i) => ({ id: i, name: 'S' + i, color: '#888', diagram: d }));
    curSys = 0; relayDelayMs = delay; resize(); toggleSim();
  };
  window.__wait = async (f, ms = 15000) => { const t0 = performance.now(); while (!f()) { await new Promise(r => setTimeout(r, 5)); if (performance.now() - t0 > ms) return null; } return (performance.now() - t0) / 1000; };
});

const cases = [
  ['b接点の連鎖で後段リレーが OFF になる（遅延なし）', async () => {
    // X1 → R1、R1 のb接点 → R2。X1 を入れたら R2 は切れるべき
    __start([__build({ cols: 2, els: [['0,0', 'NO', 'X1'], ['0,3', 'RCOIL', 'R1'], ['1,0', 'RNC', 'R1'], ['1,3', 'RCOIL', 'R2']] })]);
    const before = !!simRel.R2;
    simSt.X1 = true; runSim();
    return { R2_before: before, R1: !!simRel.R1, R2: !!simRel.R2 };
  }, { R2_before: true, R1: true, R2: false }],

  ['リレー経由のタイマーが設定どおりの時間で動く', async () => {
    // X1 → R1、R1 のa接点 → TON T1(2秒)
    __start([__build({ cols: 2, els: [['0,0', 'NO', 'X1'], ['0,3', 'RCOIL', 'R1'], ['1,0', 'RNO', 'R1'], ['1,3', 'TON', 'T1', 2]] })]);
    simSt.X1 = true; runSim();
    const t = await __wait(() => simRel.T1 === true);
    return { within_0_1s: t !== null && Math.abs(t - 2) <= 0.1, sec: t === null ? null : +t.toFixed(2) };
  }, { within_0_1s: true }],

  ['表示中でないタブ（行数が違う）の回路も正しく動く', async () => {
    // タブ0: 8行、タブ1: 3行。タブ0を表示したまま、タブ1の X2 → Y2（最下行）
    const d0 = __build({ cols: 1, els: [['0,0', 'NO', 'X1'], ['0,7', 'RCOIL', 'Y1']] }, 8);
    const d1 = __build({ cols: 1, els: [['0,0', 'NO', 'X2'], ['0,2', 'RCOIL', 'Y2']] }, 3);
    __start([d0, d1]);
    simSt.X2 = true; runSim();
    return { Y2: !!simRel.Y2 };
  }, { Y2: true }],

  ['COS を切り替えても無関係な自己保持リレーは切れない', async () => {
    // PB1 → R1（R1 a接点で自己保持）、COS1 は別回路で Y9
    const d = __build({ cols: 3, els: [['0,0', 'PB_NO', 'PB1'], ['0,3', 'RCOIL', 'R1'], ['1,0', 'RNO', 'R1'], ['2,0', 'COS', 'COS1', 5, '自動'], ['2,3', 'RCOIL', 'Y9']], h: [['0,1', true]] });
    __start([d]);
    simSt.PB1 = true; runSim(); simSt.PB1 = false; runSim();
    const held = !!simRel.R1;
    // COS をクリックしたときと同じ処理を呼ぶ
    const el = d.vsegs['2,0']; const r = cv.getBoundingClientRect();
    await onClk({ clientX: r.left + NX(2) * zoom, clientY: r.top + VS_Y(0) * zoom });
    return { held_before: held, COS: !!simSt['COS1:自動'], R1_after: !!simRel.R1 };
  }, { held_before: true, COS: true, R1_after: true }],

  ['本当に発振する回路は発振として扱う（自分のb接点で切れるリレー）', async () => {
    __start([__build({ cols: 1, els: [['0,0', 'RNC', 'R1'], ['0,3', 'RCOIL', 'R1']] })]);
    runSim();
    return { R1: !!simRel.R1 };
  }, { R1: true }],

  ['SET と RST が同時に入ったらリセット優先', async () => {
    __start([__build({ cols: 2, els: [['0,0', 'NO', 'X1'], ['0,3', 'SET', 'M1'], ['1,0', 'NO', 'X1'], ['1,3', 'RST', 'M1']] })]);
    simSt.X1 = true; runSim();
    const both = !!simRel.M1;
    return { M1: both };
  }, { M1: false }],

  ['コイル下の接点（N側）が開いたらコイルは OFF', async () => {
    __start([__build({ cols: 1, els: [['0,0', 'NO', 'A'], ['0,2', 'RCOIL', 'Y1'], ['0,3', 'NO', 'C']] })]);
    simSt.A = true; simSt.C = true; runSim(); const on = !!simRel.Y1;
    simSt.C = false; runSim(); const off = !!simRel.Y1;
    return { on, off };
  }, { on: true, off: false }],

  ['通電していない枝（N側の行き止まり）は色を付けない', async () => {
    // Y1 は通電、Y2 は B が開いて非通電。Y1・Y2 の下は横配線でつながり C 経由で N へ
    __start([__build({ cols: 2, nrow: 3, els: [['0,0', 'NO', 'A'], ['0,1', 'RCOIL', 'Y1'], ['0,2', 'NO', 'C'], ['1,0', 'NO', 'B'], ['1,1', 'RCOIL', 'Y2'], ['1,2', null]], h: [['0,2', true]] }, 3)]);
    simSt.A = true; simSt.C = true; runSim();
    return { Y1: !!simRel.Y1, Y2: !!simRel.Y2, pathBelowY1: simEn.has('0,2') && simEn.has('0,3'), deadBranchUnderY2: simEn.has('1,2') };
  }, { Y1: true, Y2: false, pathBelowY1: true, deadBranchUnderY2: false }],
  ['自己保持回路（起動 PB1・停止 PB2）', async () => {
    // P─PB2(b)─┬─PB1(a)─┬─MC   MC a接点を PB1 に並列
    const d = __build({ cols: 2, els: [['0,0', 'PB_NC', 'PB2'], ['0,1', 'PB_NO', 'PB1'], ['0,3', 'RCOIL', 'MC'], ['1,0', null], ['1,1', 'RNO', 'MC'], ['1,2', null], ['1,3', null]], h: [['0,1', true], ['0,2', true]] });
    __start([d]);
    simSt.PB1 = true; runSim(); simSt.PB1 = false; runSim(); const held = !!simRel.MC;
    simSt.PB2 = true; runSim(); simSt.PB2 = false; runSim(); const stopped = !!simRel.MC;
    return { held, stopped };
  }, { held: true, stopped: false }],

  ['正逆インターロック（相手のb接点）', async () => {
    // X1─R2(b)─F、X2─F(b)─R2
    __start([__build({ cols: 2, els: [['0,0', 'NO', 'X1'], ['0,1', 'RNC', 'R2'], ['0,3', 'RCOIL', 'F'], ['1,0', 'NO', 'X2'], ['1,1', 'RNC', 'F'], ['1,3', 'RCOIL', 'R2']] })]);
    simSt.X1 = true; runSim(); simSt.X2 = true; runSim();
    return { F: !!simRel.F, R2: !!simRel.R2 };
  }, { F: true, R2: false }],

  ['動作遅延ありの b接点連鎖（800ms×2段）', async () => {
    __start([__build({ cols: 2, els: [['0,0', 'NO', 'X1'], ['0,3', 'RCOIL', 'R1'], ['1,0', 'RNC', 'R1'], ['1,3', 'RCOIL', 'R2']] })], 800);
    await __wait(() => simRel.R2 === true);
    simSt.X1 = true; runSim(); const t0 = performance.now();
    await __wait(() => simRel.R1 === true); const r1 = (performance.now() - t0) / 1000;
    await __wait(() => simRel.R2 === false); const r2 = (performance.now() - t0) / 1000;
    relayDelayMs = 0;
    return { r1_ok: Math.abs(r1 - 0.8) <= 0.1, r2_ok: Math.abs(r2 - 1.6) <= 0.15, r1: +r1.toFixed(2), r2: +r2.toFixed(2) };
  }, { r1_ok: true, r2_ok: true }],

  ['リレー経由の TOF も設定どおり', async () => {
    // X1 → R1、R1 a接点 → TOF T2(1秒)。X1 を切ってから 1 秒で切れる
    __start([__build({ cols: 2, els: [['0,0', 'NO', 'X1'], ['0,3', 'RCOIL', 'R1'], ['1,0', 'RNO', 'R1'], ['1,3', 'TOF', 'T2', 1]] })]);
    simSt.X1 = true; runSim(); const on = !!simRel.T2;
    simSt.X1 = false; runSim();
    const t = await __wait(() => simRel.T2 === false);
    return { on, within_0_1s: t !== null && Math.abs(t - 1) <= 0.1, sec: t === null ? null : +t.toFixed(2) };
  }, { on: true, within_0_1s: true }],
];

let ng = 0;
for (const [name, fn, want] of cases) {
  const got = await page.evaluate(`(${fn.toString()})()`);
  const ok = Object.entries(want).every(([k, v]) => JSON.stringify(got[k]) === JSON.stringify(v));
  if (!ok) ng++;
  console.log(`${ok ? 'OK' : 'NG'} ${name}: ${JSON.stringify(got)}`);
}
if (errors.length) { ng++; console.log('ページエラー:', errors); }
await browser.close();
process.exit(ng ? 1 : 0);
