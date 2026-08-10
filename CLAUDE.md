# yoshizaki-studio（内部コード名: ty-mitumori）プロジェクト方針

見積・ヒアリング・案件管理を行う社内ツール（studio.aster-system.com）。
GitHubリポジトリ名は `yoshizaki-studio`、`package.json`のname・D1データベース名・Cloudflare Workersのプロジェクト名は内部的に `ty-mitumori` のまま。両方とも同じプロジェクトを指す。

Claude Code で作業する際は、このファイルと `.claude/rules/`・`.claude/agents/`・`.claude/skills/` の内容を必ず踏まえること。

## スタック
- Cloudflare Workers + Hono（`src/index.ts` 単一ファイル構成）
- D1（`wrangler.toml`のbinding: `DB`、database_name: `ty-mitumori-db`）
- Resend（見積書メール送信、`RESEND_API_KEY`）
- Anthropic API（見積カテゴリ提案・ヒアリング補助、`ANTHROPIC_API_KEY`）
- 静的アセットは `public/` 配下、`[assets]`バインディングで配信

## 主な機能・ページ構成
- `public/portal.html` — サイトの起点（`/`, `/portal`）
- `public/estimate.html` — 見積もりシミュレーター（人日単価×日数、カテゴリ提案）
- `public/hearing*.html`（5種）— ヒアリングシート
- `public/quote.html` — 見積書PDF（ブラウザ印刷で保存）
- `public/proposal.html` — 提案依頼書（ヒアリング回答の整形表示、管理者ログイン必須）
- `public/admin.html` — 管理者ダッシュボード（隠しアクセス経由のみ）
- `public/mypage.html` — 顧客マイページ
- 管理画面から料金体系（基本料金・セットプラン・納品スケジュール・キャンペーン）を編集可能

## コマンド（実際に存在するもののみ）
- 開発: `npm run dev`（= `wrangler dev`）
- デプロイ: `npm run deploy`（= `wrangler deploy`）
- DBスキーマ適用: `npx wrangler d1 execute ty-mitumori-db --remote --file=db/schema.sql`
- `build`・`test`スクリプトは存在しない。型チェックが必要な場合は `npx tsc --noEmit` を使う

## 優先順位
1. 正確性（見積金額・計算ロジックを絶対に壊さない）
2. 安全性（wrangler.toml・秘密情報・認証まわりを誤って書き換えない）
3. 保守性
4. シンプルさ
5. 速度

## 重要な制約（詳細は .claude/rules/ 参照）
- RB事業2課への言及は一切禁止（コード・コメント・ドキュメントすべて対象）
- AI機能（見積カテゴリ提案・ヒアリング補助）はUI上に「AI」と明示しない
- `wrangler.toml` は DB ID・メール設定を手動管理しているため、Claudeが自動で丸ごと書き換えない
- リポジトリ直下に資料ファイル（zip・docx等）やアプリと無関係なファイルを増やさない。資料は `docs/`（git管理外）に置く
- `db/schema.sql` と重複するスキーマファイルをルート直下に作らない。スキーマの正本は `db/schema.sql` のみとする

## 作業の進め方
- リスクのある変更（金額計算ロジック・DBスキーマ・認証・wrangler.toml・削除処理）は、実装前に簡単な計画を提示する
- 実装後は `.claude/agents/code-reviewer.md` や `security-reviewer.md` を使ってレビューを挟む
- 納品前は `/project:release-check`（`.claude/skills/release-check/`）で最終確認する
- コード修正は変更ファイルのみ提示する（差分がわかる形で）
- 新しい意思決定や既知の不具合は `.claude/memory/` に追記していく

## 完了の定義
- 依頼された挙動が実装されている
- 関連チェック（`tsc --noEmit`等）が通っている、または通らない理由が説明されている
- 変更ファイルが一覧で示されている
- 残っているリスク・手動確認が必要な点が明記されている
