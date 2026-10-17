// タッチ操作の判定テスト（Chromium のタッチ入力を CDP で再現）
// タップ＝配置、1 本指ドラッグ＝移動のみ、2 本指ピンチ＝拡大縮小のみ（どちらも配置しない）
import { openApp } from './_browser.mjs';

const { browser, page, errors } = await openApp({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: false });
const cdp = await page.context().newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
const steps = async (from, to, n = 8) => { for (let i = 1; i <= n; i++) await touch('touchMove', from.map(([x, y], k) => [x + (to[k][0] - x) * i / n, y + (to[k][1] - y) * i / n])); };

// 広い空の回路を用意して配置モードにする
const setup = () => page.evaluate(() => {
  const d = mkDiag(); d.cols = 14; d.nrow = 10; systems[curSys].diagram = d; zoom = 1; resize(); drawAll();
  setMode('place'); setTool('NO'); const w = document.getElementById('cw'); w.scrollLeft = 0; w.scrollTop = 0;
});
const state = () => page.evaluate(() => { const w = document.getElementById('cw'); return { n: Object.keys(D().vsegs).length, zoom: +zoom.toFixed(2), sx: w.scrollLeft, sy: w.scrollTop }; });
// 列 c・行 r のマスの画面座標
const slot = (c, r) => page.evaluate(([c, r]) => { const b = cv.getBoundingClientRect(); return [b.left + NX(c) * zoom, b.top + VS_Y(r) * zoom]; }, [c, r]);

const cases = [];
await setup();
{ const p = await slot(1, 1); await touch('touchStart', [p]); await touch('touchEnd', []); cases.push(['タップで配置される', (await state()).n === 1, await state()]); }

await setup();
{ const p = await slot(5, 4), q = await slot(2, 1); await touch('touchStart', [p]); await steps([p], [q]); await touch('touchEnd', []); // 指を離す位置もマスの上
  const s = await state(); cases.push(['1本指ドラッグは移動だけ（配置しない）', s.n === 0 && s.sx > 0 && s.sy > 0, s]); }

await setup();
{ const a = await slot(4, 3), b = await slot(6, 5); await touch('touchStart', [a]); await touch('touchStart', [a, b]);
  const a2 = await slot(2, 1), b2 = await slot(8, 7);
  await steps([a, b], [a2, b2]);
  await touch('touchEnd', [b2]); await touch('touchEnd', []); // 1 本ずつ離す（最後の指はマスの上）
  const s = await state(); cases.push(['2本指ピンチは拡大だけ（指を1本ずつ離しても配置しない）', s.n === 0 && s.zoom > 1.2, s]); }

await setup();
{ const p = await slot(2, 2); await touch('touchStart', [p]); await steps([p], [[p[0] + 4, p[1] + 3]], 3); await touch('touchEnd', []);
  cases.push(['わずかな指ブレ（10px以内）はタップとして配置', (await state()).n === 1, await state()]); }

{ // シム中の押しボタン: 押している間 ON、指が少し動いても ON のまま、離すと OFF
  await page.evaluate(() => { const d = mkDiag(); d.cols = 1; d.nrow = 2; d.vsegs['0,0'] = mkE('PB_NO', 'PB1', 5, ''); d.vsegs['0,1'] = mkE('RCOIL', 'Y1', 5, '');
    systems[curSys].diagram = d; zoom = 1; resize(); if (simOn) toggleSim(); toggleSim(); });
  const p = await slot(0, 0); await touch('touchStart', [p]);
  const held = await page.evaluate(() => !!simRel.Y1);
  await steps([p], [[p[0] + 25, p[1] + 20]], 4); const stillHeld = await page.evaluate(() => !!simRel.Y1);
  await touch('touchEnd', []); const released = await page.evaluate(() => !simRel.Y1);
  await page.evaluate(() => toggleSim());
  cases.push(['シム中の押しボタンは押している間だけ ON（指ブレで離れない）', held && stillHeld && released, { held, stillHeld, released }]);
}

let ng = 0;
for (const [name, ok, s] of cases) { if (!ok) ng++; console.log(`${ok ? 'OK' : 'NG'} ${name}: ${JSON.stringify(s)}`); }
if (errors.length) { ng++; console.log('ページエラー:', errors); }
await browser.close();
process.exit(ng ? 1 : 0);
