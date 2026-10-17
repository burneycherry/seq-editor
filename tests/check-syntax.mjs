// index.html の <script> を取り出して構文チェックする（ブラウザ不要）
import fs from 'node:fs';
import vm from 'node:vm';
import { ROOT } from './_browser.mjs';
import path from 'node:path';

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let ng = 0;
scripts.forEach((src, i) => {
  try { new vm.Script(src, { filename: `index.html#script${i}` }); }
  catch (e) { ng++; console.error(`script${i}: ${e.message}`); }
});
console.log(ng ? `NG: ${ng} 件の構文エラー` : `OK: ${scripts.length} 個の script に構文エラーなし`);
process.exit(ng ? 1 : 0);
