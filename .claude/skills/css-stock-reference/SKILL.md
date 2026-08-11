---
name: css-stock-reference
description: yoshizaki-studioのUIパーツ（ボタン・アコーディオン・タブ・ツールチップ・モーダル・ローディング等）を新規作成・更新する際に、CSS Stock（pote-chil.com/css-stock/ja）を参考パターン集として参照する。「CSSを更新して」「このパーツ追加して」と言われたら使う。
allowed-tools: Read Grep Glob WebFetch Edit
---

# 参考サイト
- https://pote-chil.com/css-stock/ja （CSS Stock。HTML/CSS知識不要で使えるUIパーツ集、全222種類）
- 主なカテゴリと個別URL（2026-08-11時点で確認）:
  - ボタン: https://pote-chil.com/css-stock/ja/button
  - アコーディオンメニュー: https://pote-chil.com/css-stock/ja/accordion
  - タブ: https://pote-chil.com/css-stock/ja/tab
  - ツールチップ: https://pote-chil.com/css-stock/ja/tooltip
  - モーダルウィンドウ: https://pote-chil.com/css-stock/ja/modal
  - ローディング: https://pote-chil.com/css-stock/ja/loading（スピナー11種・バー2種・テキスト1種・記事読込1種）
  - トグルボタン: https://pote-chil.com/css-stock/ja/toggle-button
  - ページネーション: https://pote-chil.com/css-stock/ja/pagination
  - パンくずリスト: https://pote-chil.com/css-stock/ja/breadcrumb
  - Q&Aリスト: https://pote-chil.com/css-stock/ja/qa
  - 見出し/ボックス/リスト/吹き出し/付箋/引用ボックス/検索フォーム/セレクトボックス/テキストボックス/チェックボックス/ラジオボタン/目次/タイムライン/フッター/円グラフ/棒グラフ/レーダーチャート/「続きを読む」ボタン も同ドメイン配下に存在

# 使い方
1. 追加・更新したいUIパーツのカテゴリを特定し、上記URL（または `https://pote-chil.com/css-stock/ja` トップから辿った該当ページ）をWebFetchで確認する
2. **注意**: 実際のHTML/CSSコードは「デザイン調整→コピー」という対話的なUI（ステップ形式）で生成される形式のため、WebFetch（静的HTML取得）では実コードを取得できないことが多い。コードそのものが必要な場合はclaude-in-chromeスキルでページを操作してコピーするか、ユーザーに該当ページを開いてコードを貼ってもらう
3. 取得できたパターン（配色・アニメーション・構造）は、そのまま貼らず `public/css/tokens.css` のデザイントークン（`--navy` `--gold` `--ink` `--radius-card` `--shadow-card` `--ease-studio` `--step-*` など）に置き換えて実装する
4. 対象ページのCSS（`public/css/estimate.css` `admin.css` `hearing.css` 等）の既存クラス命名規則（例: `.tab-btn.is-active`、`.badge.new`、`.modal-card`）に合わせる。新しいクラス体系を持ち込まない

# プロジェクト内の既存実装（重複追加を避けるための現状把握）
- バッジ: `public/css/admin.css` の `.badge` 系（ステータス別に new/hearing/quoted/won/lost）
- モーダル: `public/css/admin.css` の `#case-modal` `.modal-card` 系
- タブ: `public/css/admin.css` の `.tab-btn` `.tab-panel`（料金設定モーダル内）
- アコーディオン相当: `public/css/estimate.css` の `.summary-toggle`（開閉トグル、スピナー等のアニメーションは無し）
- ラジオボタン: `public/css/hearing.css` の `.radio-opt`（`:has(input:checked)` によるカード風選択）
- トグルスイッチ: `public/css/admin.css` の `.is-active-toggle`（ボタン切替、iOS風スイッチ意匠ではない）

# まだ無いもの（更新候補として検討可能）
- ツールチップ（見積カテゴリ提案・料金項目の補足説明などに使える余地あり）
- ローディングスピナーのアニメーション（`estimate.css` の `.send-status.is-loading` は色変化のみでスピナー無し）
- ページネーション（管理画面の案件一覧 `.case-table` が増えた場合に検討）
- パンくずリスト

# ルール
- CSS Stockの掲載コードは「自由に使用可・他媒体転載時は帰属表示必須」という利用条件がある。プロジェクトのCSSに直接コピペする場合、構造や配色は tokens.css に合わせて書き換える前提とし、丸ごとの転載はしない
- 見積・料金計算ロジック（`public/js/`）には触れない。あくまで見た目（CSS）の参考に留める
- 変更時は `.claude/rules/file-delivery.md` に従い、変更ファイルのみを提示する
