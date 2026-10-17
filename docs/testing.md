# テスト・確認手順

自動テストは Playwright + Chromium で行う。iPhone / iPad 実機での確認は手動。

## 前提

- Node.js 18 以上
- Playwright（グローバルでもローカルでも可。スクリプトが両方を探す）
- Chromium（`PW_CHROMIUM` 環境変数でパスを指定できる。未指定なら Playwright の既定ブラウザを使う）

## スクリプト

| コマンド | 内容 |
|---|---|
| `node tests/check-syntax.mjs` | `index.html` 内の `<script>` を取り出して構文チェック（ブラウザ不要） |
| `node tests/timing.mjs` | TON 3秒 / TON 1秒 / TOF 2秒 / リレー遅延 800ms の実測。許容誤差 ±0.1 秒 |
| `node tests/render.mjs out.png` | 全図記号を並べた回路を描いてスクリーンショットを保存 |

編集のたびに `check-syntax` を、シミュレーション関係を変えたら `timing` を実行する。
見た目を変えたら `render` の画像を見て確認する。

## 手動確認チェックリスト（実機）

- [ ] iPhone Safari: 起動・素子配置・シム実行
- [ ] iPad PWA（ホーム画面に追加）: 同上
- [ ] タッチでのドラッグ・長押し
- [ ] PDF 出力（カラー / モノクロ）
- [ ] ライトモード表示
- [ ] 保存 → 読込で内容が一致する
- [ ] アプリを裏に回して戻ったときのタイマー挙動（復帰時にまとめて判定される）
