# 意思決定ログ

過去の重要な決定を日付付きで残す。Claudeが文脈を再学習しなくて済むようにするためのもの。

- AI機能はUI非表示の方針（顧客向けに「AIが自動提案」と見せない）
- 管理画面アクセスは隠しアクセス方式を採用
- 見積もり→ヒアリング→提案依頼書→正式見積書送付、という業務フローに整理（以前はヒアリング後のメール通知がなかったため追加した）
- リポジトリ名は`yoshizaki-studio`、内部コード名（package.json/D1名/Workers名）は`ty-mitumori`のまま維持することに決定
- 2026-08-11: `pricing-config.js`のグラフィック・デザインカテゴリの人日単価を35,000円→45,000円に改定（ユーザー了承済み）。根拠: フリーランス/制作会社のロゴデザイン・Webデザイン等の公開相場情報（ロゴ制作5万〜30万円、Webデザイナー人日単価5万円など）と比較して旧単価が低すぎたため。web(45,000)/video(40,000)/app(65,000)/system(70,000)の各単価は同様の市場調査の結果、概ね妥当と判断し据え置き。単価の妥当性は今後も定期的に見直すこと
- 2026-08-14: `.claude/skills/`にAster Systems個人用スキル一式（開発・デザイン・マーケ等、プロジェクト非依存）を追加。うちdesigners/animation-referencesが紹介する外部デザインツールは、既存の`tokens.css`（navy×gold、2026-08-11確定）と衝突しない「既存UI監査・改善系」のみ選定してインストール（Frontend Design＝Anthropic公式、Taste `redesign-existing-projects`バリアント、apple-design、transitions-dev）。ゼロからデザインシステムを生成するタイプのツール（UI UX Pro Max、Taste `design-taste-frontend`等）は既存ブランド軸と衝突するため見送った
- 2026-08-14: 上記スキルを使い、全8テンプレート（portal/estimate/hearing×5/quote/proposal/mypage/admin）を構成から見直して刷新。ヘッダー/フッター/ツールバーの重複CSSを`public/css/base.css`に一本化。見積計算ロジック（`computeTotal`/`encodeEstimate`/`decodeEstimate`/`buildLineItems`）・`src/index.ts`・`admin.js`・DBスキーマは一切変更していない。code-reviewerエージェントによる独立レビューを実施し、指摘（スマホ幅でのサマリーバーのズレ等）を反映済み。ブラウザのウィンドウリサイズが機能しない開発環境だったため、スマホ幅の最終確認はユーザー実機依存だった
- 2026-08-14: release-check・レビュー通過後は確認を待たずに`npm run deploy`し`.claude/memory/decisions.md`を更新する運用に変更（ユーザー依頼、CLAUDE.md「作業の進め方」に明記）。金額計算・DBスキーマ・認証・wrangler.toml関連の変更は従来通り事前承認が必要
