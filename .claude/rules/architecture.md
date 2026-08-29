# アーキテクチャ方針

## 基本構成
- `src/index.ts` にHonoのルーティングを集約する単一ファイル構成が原則。ただしAI自動パイプライン関連は例外として`src/ai-pipeline.ts`（分類・抽出・選定・資料生成）・`src/claude-client.ts`（Anthropic API共通呼び出し）・`src/category-info.ts`・`src/hearing-fields.ts`・`src/pricing-catalog.ts`に分割済み（2026-08-29、ユーザー承認済み）。これ以上の分割やAI以外の機能の分割は事前に方針を相談する
- 静的ページは `public/portal.html`（起点）・`public/404.html`（フォールバック）をルート直下に置き、それ以外は `public/customer/`（顧客向けツール）・`public/hearing/`（ヒアリングシート5種）・`public/admin/`（管理者ログイン必須ページ）にサブフォルダ分けする（2026-08-29整理）。CSS/JS/画像は従来通り `public/css/*.css`・`public/js/*.js`・`public/img/*` に集約し、HTMLからは常に絶対パス（`/css/...`・`/js/...`・`/img/...`）で参照する。フレームワークは使わずバニラJS/CSS
- データ永続化は D1（binding: `DB`、database_name: `ty-mitumori-db`）
- 管理者認証はセッションCookie（`ty_admin_session`）+ PBKDF2-SHA256によるパスワードハッシュ

## コーディング方針
- 既存のディレクトリ構成・命名規則を踏襲する（新規に大きく構造を変えない）
- D1のスキーマ変更を伴う修正では、`db/schema.sql` を更新し、必要ならマイグレーション手順を明記する
- Resend・Anthropic APIキーはハードコードせず、`wrangler secret put` で設定する前提を守る（`wrangler.toml`には書かない）
- AI機能（見積カテゴリ提案・ヒアリング補助）はAPIキー未設定時に503を返す設計を維持し、他機能に影響しないようにする

## 見積・料金ロジック（見積もりシミュレーター本体）
- 人日単価・セットプラン割引・納品スケジュール倍率・キャンペーンの計算ロジックを変更する場合は、既存の計算結果とのズレがないか必ず確認する
- 料金体系は管理画面から編集可能な設計を維持する（ハードコードした金額を増やさない）
- セットプラン選択後に手動でプラン・オプションを変更すると割引が解除される既存挙動を壊さない
- 金額計算の本体は `public/js/pricing-calc.js` の `computeTotalPure()`（見積もりシミュレーター`estimate.js`が使う）

## AI自動対応パイプライン（2026-08-29追加、2026-08-29にユーザー指示で金額関連ルールを撤廃）
- AIが自動パイプライン内でプラン・オプション・金額（`aiTotal`）を判断する（`src/ai-pipeline.ts`の`selectPlanAndAddons`）。実在するプラン/オプションかどうかのホワイトリスト照合、および決定的ロジック（旧`computeServerSideTotal`）への委譲は撤廃済み。AIの判断をそのまま信用する設計であることを踏まえて扱うこと
- ヒアリング項目の抽出（`extractHearingFields`）は引き続き実在する項目id（`src/hearing-fields.ts`）と照合し、一致しないものは除去する（金額に関わらないため維持）
- 全自動送信・自動生成は`email_settings`とは別の`auto_pipeline_config`テーブル（既定OFF）で制御する。既定でON化されないようにする
- 案件に関する全てのメール送受信・AI判定は`case_events`テーブルに記録する（`logCaseEvent`ヘルパーを使う）

## ページ間の連携
- 見積もり→ヒアリング→提案依頼書→正式見積書送付、という一連のフローを壊さないよう、案件ステータス遷移を意識する
- `admin/proposal.html` は管理者ログイン必須（`/api/admin/cases/:id` 経由）。未ログイン時401の挙動を維持する

## 管理画面
- 隠しアクセス方式を維持する。通常ナビゲーションにリンクを露出させない
