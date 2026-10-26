// 印刷・PDF の確認：A4 横で電源ラインごとに 1 ページになるか、印刷後に画面へ戻るか
// 使い方: node tests/print.mjs [出力.pdf]
import { openApp } from './_browser.mjs';

const out = process.argv[2];
const { browser, page, errors } = await openApp();
const fail = [];
await page.evaluate(() => {
  // 印刷画面が開いたときと同じく beforeprint を出す（window.__noPrint のときは何もしない＝iOS の PWA）
  window.print = () => { window.__printed = (window.__printed || 0) + 1; if (!window.__noPrint) window.dispatchEvent(new Event('beforeprint')); };
  // 1 枚目は横に長い回路（30 列）、2 枚目は小さい回路
  const fill = (si, cols) => { const d = mkDiag(); systems[si].diagram = d; d.cols = cols; const N = d.nrow || NROW_DEF;
    for (let c = 0; c < cols; c++) { for (let r = 0; r < N; r++) d.vsegs[c + ',' + r] = mkE('WIRE', '', 5, ''); d.vsegs[c + ',0'] = mkE('NO', 'X' + c, 5, ''); d.vsegs[c + ',' + (N - 1)] = mkE('COIL', 'R' + c, 5, ''); } };
  fill(0, 30); fill(1, 3);
  resize(); drawAll();
});
for (const mono of [false, true]) {
  // クリック処理の中で（同期的に）window.print まで進むこと
  const ms = await page.evaluate(m => { window.__printed = 0; const t = performance.now(); exportPdf(m); if (window.__printed !== 1) return -1; return Math.round(performance.now() - t); }, mono);
  if (ms < 0) fail.push('exportPdf の中で同期的に window.print が呼ばれていない');
  const st = await page.evaluate(() => ({ printed: window.__printed, cls: document.documentElement.classList.contains('pdf-printing'), title: document.title, pages: document.querySelectorAll('#pdfPrint .pg').length }));
  if (st.printed !== 1) fail.push('window.print が呼ばれていない');
  if (!st.cls) fail.push('pdf-printing が付いていない');
  if (!/^シーケンス図_\d{4}-\d\d-\d\d$/.test(st.title)) fail.push('題名がファイル名になっていない: ' + st.title);
  if (st.pages !== 2) fail.push('ページ数 ' + st.pages);
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const n = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  const box = (pdf.toString('latin1').match(/\/MediaBox\s*\[([^\]]+)\]/) || [])[1];
  if (n !== 2) fail.push(`PDF のページ数 ${n}（2 のはず）`);
  if (!box || !/^0 0 84[12](\.\d+)? 59[45](\.\d+)?$/.test(box.trim())) fail.push('A4 横でない: ' + box);
  if (out && !mono) { (await import('node:fs')).writeFileSync(out, pdf); }
  await page.emulateMedia({ media: 'screen' });
  // 次に触ったら画面に戻る
  await page.waitForTimeout(600);
  await page.mouse.click(5, 500);
  await page.waitForTimeout(1200); // 印刷画面が開いたかの判定（1.5 秒）の後に印刷用の図を消す
  const after = await page.evaluate(() => ({ cls: document.documentElement.classList.contains('pdf-printing'), title: document.title, n: document.getElementById('pdfPrint').childElementCount }));
  if (after.cls || after.n || !/シーケンス回路エディタ/.test(after.title)) fail.push('印刷後に元へ戻らない ' + JSON.stringify(after));
  console.log(mono ? 'モノクロ' : 'カラー', ms + 'ms', JSON.stringify(st), 'PDF', n, 'ページ', box);
}

// シム中に印刷しても通電の色（緑 #34d399・赤 #dc2626）を付けず、シム・表示位置・テーマは元のまま
{
  const r = await page.evaluate(async () => {
    toggleSim(); await new Promise(res => setTimeout(res, 400));
    const cw = document.getElementById('cw'); cw.scrollLeft = 120; cw.scrollTop = 0;
    const before = { sl: cw.scrollLeft, C: C === C_DARK };
    window.__printed = 0; exportPdf(false);
    let colored = 0;
    document.querySelectorAll('#pdfPrint canvas').forEach(c => { const p = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < p.length; i += 4) { if ((Math.abs(p[i] - 0x34) < 8 && Math.abs(p[i + 1] - 0xd3) < 8 && Math.abs(p[i + 2] - 0x99) < 8) || (Math.abs(p[i] - 0xdc) < 8 && Math.abs(p[i + 1] - 0x26) < 8 && Math.abs(p[i + 2] - 0x26) < 8)) colored++; } });
    const r = { printed: window.__printed, title: document.title, colored, simOn, pdfMode, sl: cw.scrollLeft, before, C: C === C_DARK, zoom };
    toggleSim(); return r;
  });
  if (r.printed !== 1) fail.push('シム中の印刷 ' + JSON.stringify(r));
  if (r.colored > 0) fail.push('シムの通電色が印刷に出ている: ' + r.colored + ' 画素');
  if (!r.simOn || r.pdfMode || r.sl !== r.before.sl || r.C !== r.before.C || r.zoom !== 1) fail.push('印刷後に状態が戻らない ' + JSON.stringify(r));
  console.log('シム中', JSON.stringify(r));
}
// 印刷画面が開かない（beforeprint が来ない）ときは 1.5 秒後に PDF ファイルを作り、「PDF を開く」で保存できる
{
  await page.evaluate(() => { Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }); window.__noPrint = true; window.__printed = 0; exportPdf(false); });
  await page.waitForTimeout(400);
  const early = await page.evaluate(() => document.getElementById('dlg-overlay').classList.contains('show'));
  if (early) fail.push('1.5 秒より前に PDF のダイアログが出た');
  await page.waitForTimeout(1600);
  const ok = await page.evaluate(() => ({ show: document.getElementById('dlg-overlay').classList.contains('show'), txt: document.getElementById('dlg-ok').textContent }));
  if (!ok.show || ok.txt !== 'PDF を開く') fail.push('PDF のダイアログが出ない ' + JSON.stringify(ok));
  // file:// では Chromium がダウンロード名を無視するので、リンクの download 属性で確かめる
  await page.evaluate(() => { const o = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { window.__dlName = this.download; return o.call(this); }; });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dlg-ok')]);
  const dlName = await page.evaluate(() => window.__dlName);
  const fs = await import('node:fs');
  const p = await dl.path(); const buf = fs.readFileSync(p); const t = buf.toString('latin1');
  const n = (t.match(/\/Type \/Page /g) || []).length;
  if (!t.startsWith('%PDF-1.4') || n !== 2 || !/\/MediaBox \[0 0 841\.89 595\.28\]/.test(t)) fail.push(`PDF の中身が違う ページ ${n}`);
  if (!/^シーケンス図_\d{4}-\d\d-\d\d\.pdf$/.test(dlName)) fail.push('PDF のファイル名 ' + dlName);
  if (out) fs.writeFileSync(out.replace(/\.pdf$/, '') + '-file.pdf', buf);
  await page.mouse.click(5, 500);
  const after = await page.evaluate(() => ({ ok: document.getElementById('dlg-ok').textContent, cls: document.documentElement.classList.contains('pdf-printing'), n: document.getElementById('pdfPrint').childElementCount }));
  if (after.ok !== 'OK' || after.cls || after.n) fail.push('PDF の後に元へ戻らない ' + JSON.stringify(after));
  console.log('PDF ファイル', dlName, buf.length + 'B', n + 'ページ');
  // 印刷画面が開いたとき（beforeprint あり）はダイアログを出さない
  await page.evaluate(() => { window.__noPrint = false; exportPdf(false); });
  await page.waitForTimeout(1800);
  if (await page.evaluate(() => document.getElementById('dlg-overlay').classList.contains('show'))) fail.push('印刷画面が開いたのに PDF のダイアログが出た');
}
if (errors.length) fail.push(...errors);
console.log(fail.length ? 'NG\n' + fail.join('\n') : 'OK');
await browser.close();
process.exit(fail.length ? 1 : 0);
