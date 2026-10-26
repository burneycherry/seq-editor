// 印刷・PDF の確認：A4 横で電源ラインごとに 1 ページになるか、印刷後に画面へ戻るか
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
  await page.evaluate(m => { window.__printed = 0; exportPdf(m); }, mono);
  await page.click('#dlg-ok');
  await page.waitForTimeout(300);
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
  console.log(mono ? 'モノクロ' : 'カラー', JSON.stringify(st), 'PDF', n, 'ページ', box);
}

// シム中に印刷しても通電の色（緑 #34d399・赤 #dc2626）を付けず、シム・表示位置・テーマは元のまま。ファイル名の / は _ に
{
  const r = await page.evaluate(async () => {
    toggleSim(); await new Promise(res => setTimeout(res, 400));
    const cw = document.getElementById('cw'); cw.scrollLeft = 120; cw.scrollTop = 0;
    const before = { sl: cw.scrollLeft, C: C === C_DARK };
    window.__printed = 0; exportPdf(false);
    document.getElementById('dlg-input').value = 'a/b:c';
    document.getElementById('dlg-ok').click(); await new Promise(res => setTimeout(res, 100));
    let colored = 0;
    document.querySelectorAll('#pdfPrint canvas').forEach(c => { const p = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < p.length; i += 4) { if ((Math.abs(p[i] - 0x34) < 8 && Math.abs(p[i + 1] - 0xd3) < 8 && Math.abs(p[i + 2] - 0x99) < 8) || (Math.abs(p[i] - 0xdc) < 8 && Math.abs(p[i + 1] - 0x26) < 8 && Math.abs(p[i + 2] - 0x26) < 8)) colored++; } });
    const r = { printed: window.__printed, title: document.title, colored, simOn, pdfMode, sl: cw.scrollLeft, before, C: C === C_DARK, zoom };
    toggleSim(); return r;
  });
  if (r.printed !== 1 || r.title !== 'a_b_c') fail.push('シム中の印刷・ファイル名 ' + JSON.stringify(r));
  if (r.colored > 0) fail.push('シムの通電色が印刷に出ている: ' + r.colored + ' 画素');
  if (!r.simOn || r.pdfMode || r.sl !== r.before.sl || r.C !== r.before.C || r.zoom !== 1) fail.push('印刷後に状態が戻らない ' + JSON.stringify(r));
  console.log('シム中', JSON.stringify(r));
}
if (errors.length) fail.push(...errors);
console.log(fail.length ? 'NG\n' + fail.join('\n') : 'OK');
await browser.close();
process.exit(fail.length ? 1 : 0);
