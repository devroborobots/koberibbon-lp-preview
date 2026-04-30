# 神戸リボン LP デザインプレビュー

[有限会社 神戸リボン](https://kobe-ribbon.co.jp) の Shopify 移行プロジェクトにおける、
トップページデザインのプレビュー版（Phase 0：デザイン確認用）です。

## プレビュー URL

**https://devroborobots.github.io/koberibbon-lp-preview/**

## ステータス

- ✅ Group A：テキスト差し替え（サブコピー / 装飾英文 / EVENT タグ色 / 日付 / 決済方法 / STRENGTH 02 アイコン）
- ✅ Group B：ACCESS / LINE CTA を画像から HTML/CSS 構造に再構築
- ⏳ Group C：FAQ 回答本文 / フッター / JSON-LD（次工程）

## 関連

- 設計仕様：`docs/superpowers/specs/2026-04-30-top-page-design.md`（プロジェクト本体リポ）
- 採用判断：`docs/DECISIONS.md` D-014〜D-018
- イテレーション履歴：`design/iteration-log.md`

## 注意

- 画像（`event_photo_*.png` / `hero_photo_blob.png` / `faq_illustration.png`）は
  Sprint 2 で AI 生成画像（D-017）に差し替え予定の **仮素材**
- ロゴは未確定のためプレースホルダ表示（Claude Design で作成中）
- ACCESS の地図・店舗外観は Sprint 2 で AI 生成画像 or Google Maps Embed に差し替え
- 768px 未満のレスポンシブ対応は Phase 1 Liquid 移植時に実施
