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
if (errors.length) fail.push(...errors);
console.log(fail.length ? 'NG\n' + fail.join('\n') : 'OK');
await browser.close();
process.exit(fail.length ? 1 : 0);
