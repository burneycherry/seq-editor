# アーキテクチャ詳細

`index.html` 1 ファイルの構造メモ。行番号は変わるので関数名で探すこと。

## 全体構成

1. `<style>`: レイアウト CSS（CSS 変数は使わない）
2. HTML: ツールバー、電源タブ（`#sys-bar`）、パレット（`.pi` / `.pic`）、キャンバス `#cv`、プロパティパネル、ダイアログ（`#dlg-*`）、モーダル置き場 `#mr`
3. `<script>`: 全ロジック（`'use strict'`）

## データモデル

```js
systems = [{
  id, name, color,          // 電源ライン（タブ）
  diagram: {
    cols,                   // 列数
    nrow,                   // 行数（未設定なら NROW_DEF = 8）
    vsegs: { "c,r": el },   // 縦スロット（行 r の中の素子 or WIRE）
    hsegs: { "c,r": val }   // 行境界 r 上の、列 c と c+1 の間の横配線
  }
}]
el = { type, label, preset, comment }   // mkE()
```

- `hsegs` の値: `true`（通常）、`'br'`（右端でまたぐ）、`'bl'`（左端でまたぐ）、`'bridge'`（両端）
- 保存 JSON: `{ version: 6, systems, curSys, wireNumsManual }`
- 履歴（Undo/Redo）: `pushHistory()` が `{sys, wn, bg}` を JSON 文字列で保存（最大 50）

## 座標系

| 名前 | 内容 |
|---|---|
| `LM` / `TM` | 左 / 上マージン |
| `RH` | 行の高さ（80） |
| `CW` | 列の幅（`= RH`） |
| `NX(c)` | 列 c の X |
| `NY(r)` | 行境界 r の Y（`NY(0)` が P 母線、`NY(NR())` が N 母線） |
| `VS_Y(r)` | 行 r の中央 Y |

`zoom` で全体を拡大縮小。`resize()` がキャンバスサイズを計算する。

## 描画順（drawAll）

1. 背景・背景画像・ガイド点線
2. P/N 母線、行ラベル（A, B, …）、電源名
3. 縦スロット `drawVSeg()`（接点は `drawContactJIS()` → `drawCtSym()`、出力は `drawCoilSym()`）
4. 横配線 `drawHSeg()`（縦の上に描く。またぎ円弧が縦配線を隠すため）
5. 線番号 `drawWireNums()`
6. 連動点線（CS/COS 同士、PB 同士は `csGroups`、同じラベルの SET と RST は `srGroups`）
7. 列ヘッダ・選択枠
8. N 母線の下: タイマー経過表示と接点リファレンス（`a-001A` 形式）
9. 回り込み経路（シム中のみ、`drawSneaks()` がオレンジ破線で描く）
10. ホバー表示

## 図記号の関数

- `drawCtSym(c, type, cx, cy, col, k)`: 接点。`k` は倍率（回路図 1、パレット 0.75）。操作部の位置 `{ox, my}` を返す。
- `drawCoilShape(c, type, cx, cy, col, k, fill)`: コイル四角（40×20）、タイマー補助記号、ランプ（丸に×）。
- `palCt` / `palCoil` / `palLamp`: パレットアイコン。上の関数を呼ぶだけ。図記号を変えるときはパレットも自動で変わる。

## シミュレーション

- `toggleSim()`: 開始で `setInterval(runSim, spdMs())`。停止で全状態クリア。
- `runSim()`:
  1. 最大 20 パスで出力状態を収束させる。各パスで全電源ラインを評価し、コイル・ランプ・SET/RST に加えて
     タイマー（`simTimer()`、`simT[label] = {st, el, pr, was, out}`）も同じパスで評価する。
     20 パスで収束しなければ発振とみなし、変化し続ける出力を ON 扱いにする。
     切換スイッチを操作した直後は、まず途中の状態（ノンラップ＝全ノッチ OFF、ラップ＝新旧ノッチ両方 ON）で収束させ、
     次に `simSwNext` の切換後の状態を反映してもう一度収束させる（同じ `runSim()` の中で行う）。
  2. `runSimOneDiag()` は P 母線から到達するノード集合 `en` を返し、
     `en.nSide`（N 母線から到達するノード）と `en.view`（表示用: P 側＋通電中出力の下から N までの経路）を付ける。
     出力は上端 ∈ `en` かつ下端 ∈ `en.nSide` のときだけ ON。
  3. リレー動作遅延（`simDlyPending[label] = {st, val}`）。ランプには掛けない。SET/RST はリセット優先
  4. 瞬時動作の記録: パスの途中で ON になり最後に OFF へ戻った出力を `simPulse[label] = 時刻` に、
     ON のまま途中で一瞬 OFF になった出力を `simDip[label] = 時刻` に入れる（発振時は除く）。
     `simPulseOn(L)` が `PULSE_MS` の間 true を返し、コイル図記号・タイマー経過表示・シム状態欄だけを ON 表示にする
  5. 安全チェック（`safetyAll()` が全電源ラインの短絡 `checkSafety(d,true)` と回り込み `findSneaks`、最後に二重コイル `checkSafety(null)` をまとめる）。回り込みは 0-1 BFS（配線・閉じた接点 0、負荷 1）で
     P→N の経路のうち負荷を 2 つ以上通るものを探す。正規に通電している負荷・両端が同電位の負荷は対象外。
     結果は `sneakAll[si]` に入り、`drawSneaks()` がオレンジ破線で描く
- 時間判定はすべて `performance.now()`。満了時刻は `simTmSchedule(ms)` で `setTimeout` 予約し、その時点で `runSim()` を再実行する。
- 状態変数: `simSt`（入力）、`simRel`（出力・リレー）、`simEn`（通電ノード集合）、`simActed`（SET/RST 保持）
- タイムチャート: `tcRecord()` が `runSim()` ごとに実時刻付きで 1 サンプル記録する（`{t, states, pulse, dip}`。横軸は `tcT0`＝シム開始からの実時間、表示幅 `tc-max` 秒より古い記録は捨てる。`pulse` はその評価で瞬時動作した出力で、`drawTimechart()` が黄色の細いパルスで描く）。

## 出力

- PDF: `exportPdf(mono)`。選定アプリ（tr）の印刷と同じ方式。ボタンのクリック処理の中で**同期的に** `window.print()`／共有シートまで進める（ファイル名の入力ダイアログを `await` で挟んだ版は iOS の PWA で反応しなかった）。PDF のファイル名は `シーケンス図_YYYY-MM-DD`。
  - `pdfRender(list, mono, ds, enc, q)`：電源ラインごとに `pdfMode = true` で描く。描画中は `simOn = false`・`simT = {}`・`C = C_DARK`（シムの状態を印刷しない。`simEn` は表示中タブの通電状態なので、そのままだと別タブに色が付く。ライト／ダークで印刷の色を変えない）。`try/finally` で `curSys`・`zoom`・`C`・`simOn`・`simT`・`pdfMode` と `#cw` のスクロール位置を必ず戻す。タイマーの表示は `設定s` だけ（`timerCountText`）。
  - 解像度は 1 ページ約 400dpi（4400×2900 画素、1 枚約 1,280 万画素＝iOS の 1 枚の上限 約 1,670 万画素より小さい）まで（`zoom` は最大 4）。`pdfBox()` で白くない範囲を求めて余白を切り詰める。モノクロは `pdfMonoV()`（明るさ 160 以下を黒・245 以上を白、その間はなだらかにつなぐ＝縁のぼかしを残してギザギザにしない）。見出しは「電源名　日付　（モノクロ）　ページ/総ページ」。
  - **Safari・Android・パソコン**：`pdfCrop()` のキャンバスを `#pdfPrint` に入れて `html.pdf-printing` を付け `window.print()`。印刷用 CSS は `@page{size:A4 landscape}`、`.pg` 1 つ＝1 ページ、画像は `max-width:100%; max-height:184mm`。全ページのキャンバスを残すので合計 4,000 万画素まで。印刷中は `document.title` をファイル名に。iOS はプレビュー作成直後に `afterprint` を出すため、印刷用の表示・題名・キャンバスは次に画面を触ったとき（`pointerdown` / `keydown`）に戻す（`pdfClear()` で幅・高さを 0 にして捨てる）。
  - **iOS・iPadOS のホーム画面のアプリ（PWA）**：`window.print()` に反応しない（v15.49 実機。選定アプリでも同じ、tr の docs/spec-common.md「印刷・PDF（ホーム画面のアプリ）」）。`pdfIsPwa()`（`navigator.standalone`、または iPhone・iPad で `display-mode: standalone/fullscreen`。Android・パソコンのアプリは `window.print()` のまま）のときは `window.print()` を呼ばず：
    - 1 ページ描くたびに `pdfImg()` で PDF の画像（上に見出しの帯・可逆の RunLength）に変え、キャンバスは残さない（大きなキャンバスは描画用の `cv` 1 枚だけ。見出しは小さいキャンバスに描いて画素をつなぐ）。ページ数によらず約 400dpi。
    - 失敗したら（メモリ不足など）解像度を半分（`q = 0.5`）にして 1 回だけ作り直し、それでもだめなら「PDF を作れませんでした（理由）」。
    - `pdfMake(imgs, title)`：外部ライブラリなし、1 ページ＝画像 1 枚を A4 横・余白 8mm に収めて左上、Info に題名（UTF-16BE）。選定アプリの `js/pdf.js` の `buildPdf` と同じ形。**画像は JPEG ではなく可逆の RunLengthDecode**（`pdfRle()`、結果は `slice` で必要な長さだけ写す。JPEG は文字・細い線の縁がにじんだ＝v15.50 の実機の PDF でユーザー指摘 2026-10-27。カラーは RGB 8 ビット、モノクロはグレー 8 ビット。18 列の回路でカラー約 1.5MB・モノクロ約 0.3MB）。
    - `pdfShare()`：同期処理のままボタンの操作の中で `navigator.share({ files })`（**`title` は渡さない**＝iOS の「ファイルに保存」で .txt も保存されるため）。断られたら（`AbortError` 以外）画面下の案内 `#pdfSheet`（`pdfSheet()`）の「保存・共有」で出し直す。共有できない端末は `pdfSave()` でダウンロード。
    - v15.50 で iPad の PWA から共有シートが開き PDF を作れることをユーザーが確認（2026-10-27）。
  - 以前あった未使用の `<iframe id="print-frame">`、PDF を作れなかったときの印刷用 HTML の保存（`pdfHtml`）は削除した（作り直しの方が確実で、HTML もキャンバスが要るため）。
- JSON 保存: `saveFile()`（ファイル名は `電源名_YYYY-MM-DD_HHMM.json`。同じ日に何度保存しても見分けられるよう時刻を付ける）

## テーマ

`C_DARK` / `C_LIGHT` の色オブジェクトを `C` に入れて切り替える。新しい色が必要なら両方に追加すること。
