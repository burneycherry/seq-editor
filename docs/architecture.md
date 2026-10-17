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
6. 連動点線（CS/COS 同士、PB 同士。`csGroups`）
7. 列ヘッダ・選択枠
8. N 母線の下: タイマー経過表示と接点リファレンス（`a-001A` 形式）
9. ホバー表示

## 図記号の関数

- `drawCtSym(c, type, cx, cy, col, k)`: 接点。`k` は倍率（回路図 1、パレット 0.75）。操作部の位置 `{ox, my}` を返す。
- `drawCoilShape(c, type, cx, cy, col, k, fill)`: コイル四角（40×20）、タイマー補助記号、ランプ（丸に×）。
- `palCt` / `palCoil` / `palLamp`: パレットアイコン。上の関数を呼ぶだけ。図記号を変えるときはパレットも自動で変わる。

## シミュレーション

- `toggleSim()`: 開始で `setInterval(runSim, spdMs())`。停止で全状態クリア。
- `runSim()`:
  1. タイマー評価（TON/TOF、`simT[label] = {st, el, pr, was, out}`）
  2. 最大 20 パスでコイル状態を収束させる（発振検出 `oscillateOn`）
  3. リレー動作遅延（`simDlyPending[label] = {st, val}`）
  4. 安全チェック（短絡 `checkSafety`、回り込み `checkBackfeed`）
- 時間判定はすべて `performance.now()`。満了時刻は `simTmSchedule(ms)` で `setTimeout` 予約し、その時点で `runSim()` を再実行する。
- 状態変数: `simSt`（入力）、`simRel`（出力・リレー）、`simEn`（通電ノード集合）、`simActed`（SET/RST 保持）
- タイムチャート: `tcRecord()` が `runSim()` ごとに 1 サンプル記録する。

## 出力

- CSV: `exportCsv()`（BOM 付き UTF-8）
- PDF: `exportPdf(mono)`。`pdfMode = true; zoom = 5` で各電源ラインを描画し、新しいウィンドウで印刷する。
- JSON 保存: `saveFile()`（ファイル名は `電源名_日付.json`）

## テーマ

`C_DARK` / `C_LIGHT` の色オブジェクトを `C` に入れて切り替える。新しい色が必要なら両方に追加すること。
