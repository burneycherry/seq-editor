// 印刷・PDF の確認：A4 横で電源ラインごとに 1 ページになるか、印刷後に画面へ戻るか、iOS の PWA では PDF を作って共有シートに渡すか
// 使い方: node tests/print.mjs [出力.pdf]
import { openApp } from './_browser.mjs';

const out = process.argv[2];
const { browser, page, errors } = await openApp();
const fail = [];
await page.evaluate(() => {
  window.print = () => { window.__printed = (window.__printed || 0) + 1; };
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
// iOS の PWA：window.print() を呼ばず、アプリの中で A4 横の PDF を作ってすぐ共有シートに渡す（選定アプリと同じ）
{
  const fs = await import('node:fs');
  await page.waitForTimeout(600); await page.mouse.click(5, 500); // 前のテストの印刷の表示を外す
  const r = await page.evaluate(async () => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    const got = [];
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: d => { got.push(d); return Promise.resolve(); }, configurable: true });
    window.__printed = 0; const t = performance.now(); exportPdf(false); const ms = Math.round(performance.now() - t);
    await new Promise(res => setTimeout(res, 50));
    const d = got[0] || {}; const f = (d.files || [])[0];
    const buf = f ? new Uint8Array(await f.arrayBuffer()) : null;
    let bin = ''; if (buf) for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const sh = document.getElementById('pdfSheet');
    return { ms, printed: window.__printed, shares: got.length, keys: Object.keys(d), name: f && f.name, type: f && f.type, pdf: bin ? btoa(bin) : '', sheet: sh ? !sh.hidden : false, cls: document.documentElement.classList.contains('pdf-printing'), boxN: document.getElementById('pdfPrint').childElementCount, title: document.title };
  });
  const t = Buffer.from(r.pdf, 'base64').toString('latin1');
  const n = (t.match(/\/Type \/Page /g) || []).length;
  if (r.printed) fail.push('PWA で window.print が呼ばれた');
  if (r.shares !== 1) fail.push('PWA で共有シートが 1 回呼ばれていない: ' + r.shares);
  if (r.keys.join() !== 'files') fail.push('共有シートに files 以外を渡している: ' + r.keys.join());
  if (!/^シーケンス図_\d{4}-\d\d-\d\d\.pdf$/.test(r.name || '') || r.type !== 'application/pdf') fail.push('PDF のファイル名・種類 ' + r.name + ' ' + r.type);
  if (!t.startsWith('%PDF-1.4') || n !== 2 || !/\/MediaBox \[0 0 841\.89 595\.28\]/.test(t) || !/\/Info 3 0 R/.test(t)) fail.push(`PDF の中身が違う ページ ${n}`);
  if (r.sheet || r.cls || r.boxN || /シーケンス図_/.test(r.title)) fail.push('PWA の後に画面が元のままでない ' + JSON.stringify({ sheet: r.sheet, cls: r.cls, boxN: r.boxN, title: r.title }));
  if (out) fs.writeFileSync(out.replace(/\.pdf$/, '') + '-file.pdf', Buffer.from(r.pdf, 'base64'));
  console.log('PWA', r.ms + 'ms', r.name, t.length + 'B', n + 'ページ', '共有の引数', r.keys.join());
  // iOS が共有を断ったとき（時間切れなど）は画面下の「保存・共有」で出し直す
  const r2 = await page.evaluate(async () => {
    let calls = 0;
    Object.defineProperty(navigator, 'share', { value: () => { calls++; return calls === 1 ? Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })) : Promise.resolve(); }, configurable: true });
    exportPdf(true); await new Promise(res => setTimeout(res, 50));
    const sh = document.getElementById('pdfSheet'); const a = { shown: !sh.hidden, go: !sh.querySelector('.pdf-go').hidden, msg: sh.querySelector('.pdf-msg').textContent };
    sh.querySelector('.pdf-go').click(); await new Promise(res => setTimeout(res, 50));
    return { ...a, calls, hidden: sh.hidden };
  });
  if (!r2.shown || !r2.go || r2.calls !== 2 || !r2.hidden) fail.push('共有を断られたときの出し直し ' + JSON.stringify(r2));
  console.log('PWA 出し直し', JSON.stringify(r2));
  // 共有シートが無い端末はダウンロード
  await page.evaluate(() => { Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }); const o = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { window.__dlName = this.download; return o.call(this); }; });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => exportPdf(false))]);
  const dlName = await page.evaluate(() => window.__dlName);
  const head = fs.readFileSync(await dl.path()).toString('latin1', 0, 8);
  if (!/^シーケンス図_\d{4}-\d\d-\d\d\.pdf$/.test(dlName) || head !== '%PDF-1.4') fail.push('ダウンロードの PDF ' + dlName + ' ' + head);
  console.log('PWA ダウンロード', dlName);
}
if (errors.length) fail.push(...errors);
console.log(fail.length ? 'NG\n' + fail.join('\n') : 'OK');
await browser.close();
process.exit(fail.length ? 1 : 0);
