# yoshizaki-studio（内部コード名: ty-mitumori）プロジェクト方針

見積・ヒアリング・案件管理を行う社内ツール（studio.aster-system.com）。
GitHubリポジトリ名は `yoshizaki-studio`、`package.json`のname・D1データベース名・Cloudflare Workersのプロジェクト名は内部的に `ty-mitumori` のまま。両方とも同じプロジェクトを指す。

Claude Code で作業する際は、このファイルと `.claude/rules/`・`.claude/agents/`・`.claude/skills/` の内容を必ず踏まえること。

## スタック
- Cloudflare Workers + Hono。`src/index.ts`がfetch/emailハンドラと大半のロジックを持つが、AI自動パイプライン関連は`src/ai-pipeline.ts`・`src/claude-client.ts`・`src/category-info.ts`・`src/hearing-fields.ts`・`src/pricing-catalog.ts`に分割済み（2026-08-29、ユーザー承認済みの例外）
- D1（`wrangler.toml`のbinding: `DB`、database_name: `ty-mitumori-db`）
- Resend（見積書メール送信、`RESEND_API_KEY`）。メール受信はCloudflare Email Routing→`email()`ハンドラ（`src/index.ts`）
- Anthropic API（見積カテゴリ提案・ヒアリング補助・AI自動パイプライン、`ANTHROPIC_API_KEY`）
- 静的アセットは `public/` 配下、`[assets]`バインディングで配信

## 主な機能・ページ構成
- `public/portal.html` — サイトの起点（`/`, `/portal`）
- `public/customer/estimate.html` — 見積もりシミュレーター（人日単価×日数、カテゴリ提案）
- `public/hearing/hearing*.html`（5種）— ヒアリングシート
- `public/customer/quote.html` — 見積書PDF（ブラウザ印刷で保存）
- `public/admin/proposal.html` — 提案依頼書（ヒアリング回答の整形表示、管理者ログイン必須）
- `public/admin/admin.html` — 管理者ダッシュボード（隠しアクセス経由のみ）
- `public/customer/mypage.html` — 顧客マイページ
- `public/admin/dashboard.html` — 経営ダッシュボード（管理者ログイン必須）
- `public/admin/structure.html` — アプリ構造ビューアー（管理者ログイン必須）
- `public/admin/requirements.html` / `spec.html` — AI自動生成の要件定義書・仕様書下書き（社内専用・非公開、管理者ログイン必須）
- `public/admin/case-timeline.html` — 案件の全メール送受信・AI判定を時系列表示する監査ログ（管理者ログイン必須）

`public/` は役割別に `customer/`（顧客向けツール）・`hearing/`（ヒアリングシート）・`admin/`（管理者ログイン必須ページ）にサブフォルダ分けしている（2026-08-29整理）。`portal.html`・`404.html` はCloudflare Assetsの起点・フォールバック規約上ルート直下に残す。新規ページを追加する際もこの分類に従うこと。
- 管理画面から料金体系（基本料金・セットプラン・納品スケジュール・キャンペーン）を編集可能

## AI自動対応パイプライン（2026-08-29追加、同日中に金額関連ルールを撤廃）
依頼受付（サイト操作のヒアリング完了・メール受信）を起点に、AIが判断してヒアリング項目の抽出・プラン/オプション選定・金額判断・正式見積書送付・要件定義書/仕様書生成までを自動実行する機能。詳細な設計判断・撤廃の経緯は `.claude/memory/decisions.md`（2026-08-29の一連のエントリ）を参照。
- **既定OFF**。管理画面「全自動AI対応」ボタン（`auto_pipeline_config`テーブル）で明示的にONにするまで、既存の挙動（admin手動でsend-formal-quote等）は一切変わらない
- **金額はAIが自身の判断で決定する**（`src/ai-pipeline.ts`の`selectPlanAndAddons`が返す`aiTotal`）。実在するプラン/オプションかどうかの照合、決定的な金額計算ロジック（旧`computeServerSideTotal`）への委譲は、ユーザー明示指示により撤廃済み（2026-08-29）
- ヒアリング項目の抽出（実在する項目idへの照合）は金額に関わらないため維持している
- AIが金額を全く判断できなかった場合のみ、案件を`needs_info`にして確認メールを送るにとどめる
- 全ての自動送受信・AI判定は`case_events`テーブルに記録され、`admin/case-timeline.html`で確認できる
- メール受信は`src/index.ts`の`email()`ハンドラ（`postal-mime`でMIMEパース）。前提として受信用ドメインをCloudflareにオンボードし、ダッシュボード/`wrangler email routing rules create`でルーティング規則を作成する運用作業が別途必要（コード変更だけでは有効化されない）

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
- AI機能（見積カテゴリ提案・ヒアリング補助・自動パイプライン）は顧客向けUI・メール文言に「AI」と明示しない（管理画面・`case_events`の記録内容は開発者向けのため対象外）
- `wrangler.toml` は DB ID・メール設定を手動管理しているため、Claudeが自動で丸ごと書き換えない
- リポジトリ直下に資料ファイル（zip・docx等）やアプリと無関係なファイルを増やさない。資料は `docs/`（git管理外）に置く
- `db/schema.sql` と重複するスキーマファイルをルート直下に作らない。スキーマの正本は `db/schema.sql` のみとする
- 既存テーブルへの`ALTER TABLE`は追加しない（SQLiteは`IF NOT EXISTS`相当が無くschema.sql再実行時にエラーになるため）。カラム追加が必要な場合は`auto_pipeline_config`のような単一設定行の新規テーブルで代替する

## 作業の進め方
- リスクのある変更（DBスキーマ・認証・wrangler.toml・削除処理）は、実装前に簡単な計画を提示する
- 実装後は `.claude/agents/code-reviewer.md` や `security-reviewer.md` を使ってレビューを挟む
- 納品前は `/project:release-check`（`.claude/skills/release-check/`）で最終確認する
- `/project:release-check` とレビュー（code-reviewer等）が通過したら、確認を待たずに `/project:deploy` の手順で `npm run deploy` を実行し、続けて `.claude/memory/decisions.md` に変更内容を追記する（2026-08-14、ユーザー了承済みの運用ルール）。ただし以下は対象外とし、従来通り実装前に計画を提示して承認を得てから進める：
  - DBスキーマ・認証・wrangler.tomlに関わる変更（金額計算ロジックは2026-08-29のユーザー指示により対象外から除外し、他の変更と同様の扱いとする）
  - D1スキーマ変更を伴うデプロイ（`db/schema.sql`の適用は明示的な承認後に行う）
- コード修正は変更ファイルのみ提示する（差分がわかる形で）
- 新しい意思決定や既知の不具合は `.claude/memory/` に追記していく
- **見た目に関わる変更（HTML/CSS/レイアウト・文言追加）を行った場合、必ずPC幅とスマホ幅の両方で表示を確認する。**
  - 確認観点: レイアウト崩れ、文字列の意図しない折り返し（2列化）、要素のはみ出し・重なり、ボタン/フォームの操作しやすさ
  - `npm run dev` でローカルサーバーを起動し、ブラウザ操作が可能な場合は実際に両サイズで画面を確認する（スクリーンショット等）。確認できない場合は「未確認」であることを明記する

## 完了の定義
- 依頼された挙動が実装されている
- 関連チェック（`tsc --noEmit`等）が通っている、または通らない理由が説明されている
- 変更ファイルが一覧で示されている
- 残っているリスク・手動確認が必要な点が明記されている
