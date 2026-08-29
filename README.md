# Aster Systems / ty-mitumori

## 業務フロー（今回整理した正しい流れ）

```
① お客様がポータル(/portal)から見積もりシミュレーター(/customer/estimate.html)へ
② カテゴリ・プランを選択 → お名前・メールアドレスを入力して「この内容で見積書を受け取る」
   → お客様 と 社内(COMPANY_NOTIFY_EMAIL) の両方にメールで
     見積もり内容 + 御見積書PDFへのリンク が届く
③ お客様がヒアリングシートに記入して送信（見積もりコードは自動で引き継がれる）
④ 社内は管理者ダッシュボード(/admin)でヒアリング内容を確認し、正式な提案・対応を行う
```

※以前の実装は「見積もり→ヒアリング→DB保存のみ」でメール通知がありませんでした。
　今回、②の時点でお客様・社内の両方にメールが届くようにしました。

## 実装状況（全機能）
- [x] ポータル（`public/portal.html`）— サイトの起点
- [x] 見積もりシミュレーター（`public/customer/estimate.html`）— 人日単価×日数、おすすめカテゴリ提案、見積書メール送信
- [x] ヒアリングシート5種（`public/hearing/hearing*.html`）— 記入内容チェック機能付き
- [x] 見積書PDF（`public/customer/quote.html`）— ブラウザ印刷でPDF保存
- [x] 管理者ダッシュボード（`public/admin/admin.html`）— 隠しアクセス経由のみ
- [x] 顧客マイページ（`public/customer/mypage.html`）
- [x] 管理画面から編集できる料金体系（基本料金／おトクなセットプラン／納品スケジュール／キャンペーン）
- [x] 提案依頼書（ヒアリング回答を整形した書類、管理画面から表示・印刷）
- [x] 正式な見積書の送付（管理画面から、ヒアリング後の御見積書をお客様へメール送信）

## 提案依頼書・正式な見積書について

見積もりシミュレーターでの算出はあくまで**仮の概算見積もり**です。以下の流れで正式な書類を作成します。

1. お客様が見積もりシミュレーターで概算を算出（仮の見積もり）
2. お客様がヒアリングシートに回答・送信
3. 社内担当者が管理画面の案件詳細を開き、「📋 提案依頼書を表示」でヒアリング回答を整形した提案依頼書を確認・印刷（`public/admin/proposal.html`。ヒアリング項目のラベルに沿って自動整形されます）
4. 内容を確認のうえ、「✅ 正式な見積書を送付」を押すと、既存の見積もり内容をもとにした正式な御見積書メールがお客様に送信され、案件ステータスが「見積もり提示済み」に更新されます

提案依頼書ページ（`/admin/proposal.html?caseId=...`）は管理者ログイン必須です（`/api/admin/cases/:id` を利用するため、未ログイン時は401エラーとなります）。

## 料金・キャンペーン設定（管理画面 → 🎁 料金・キャンペーン設定）

1. **基本料金**：カテゴリを選ぶと全プラン・オプションの人日単価／人日数が編集できます。保存すると見積もりシミュレーターに即反映されます。
2. **セットプラン**：カテゴリ＋ベースプラン＋オプションをまとめて割引価格で提供。見積もりシミュレーター上部にカード表示されます。**初期状態で全カテゴリ分のサンプルセットプランと、通常／ゆったり／特急の3種類の納品スケジュールが投入済み**です（`db/schema.sql`実行時に自動投入。内容・金額は管理画面から自由に編集・削除できます）。セットプランを選んだ後、手動でプラン・オプションを変更するとセット割引は自動的に解除されます。
3. **納品スケジュール**：納期に応じた割増・割引の倍率を設定。仕様選択画面にラジオボタンとして表示されます。
4. **キャンペーン**：割引キャンペーンを作成・有効化すると、見積もりシミュレーター上部にバナー表示され自動で割引が適用されます（同時に有効なのは1件のみ）。
5. いずれも未設定なら通常通り動作します（グレースフルに無効化）。

## サイト構成・アクセス経路
- `/`, `/portal` → `/portal.html`（メインの入口）
- `/estimate` → `/customer/estimate.html`（見積もりシミュレーター）
- 見積もりシミュレーターは以前 `index.html` という名前だったため、Cloudflareの
  静的配信の仕様上「/」で自動的にこちらが表示されてしまう構造的なバグがありました。
  `estimate.html` にリネームし、`wrangler.toml` に `run_worker_first = true` を追加、
  常に `src/index.ts` のルーティング（`/` → `/portal.html`）を経由するよう修正済みです。

## 管理者ダッシュボードへのアクセス（お客様には非公開）

**通常のナビゲーションには一切表示されません。** 以下のいずれかでアクセスしてください。

1. **直接URLアクセス**：`https://<あなたのドメイン>/admin`
2. **隠しトリガー**：ポータル(`/portal`)のフッターにある会社名表記
   「Aster Systems — Creative & System Production」を**素早く5回クリック/タップ**すると
   `/admin` に遷移します（2.5秒以内に5回）

### 初回の管理者アカウント作成
1. `/admin` にアクセス（管理者が1人もいない場合のみ、自動でセットアップ画面が出ます）
2. 名前・メールアドレス・パスワード（8文字以上）を入力して作成
3. 以後は通常のログイン画面になります（2人目以降のアカウントは現状SQLで直接追加する必要があります。UIは未実装）

パスワードは PBKDF2-SHA256（10万回）でハッシュ化してD1に保存しています。平文保存はしていません。

## 「AI」機能について（お客様には非表示）
- 見積もりシミュレーターの「おすすめカテゴリを見る」、ヒアリングシートの「記入内容をチェックする」は
  内部でClaude APIを使っていますが、**画面上の文言からは「AI」という単語を意図的に外しています。**
- 実装上は `src/index.ts` の `/api/ai/suggest-estimate`、`/api/ai/hearing-assist` がAI呼び出しを行っています（エンドポイント名にはaiが残っていますが、これはお客様の目には触れません）。

## 最終デプロイ手順（まとめ）

```bash
# 1. 依存関係インストール
npm install

# 2. D1データベース作成（初回のみ）
npx wrangler d1 create ty-mitumori-db
# → 出力された database_id を wrangler.toml の [[d1_databases]] に貼り付ける

# 3. スキーマ適用
npx wrangler d1 execute ty-mitumori-db --remote --file=db/schema.sql

# 4. シークレット設定
npx wrangler secret put ANTHROPIC_API_KEY   # おすすめカテゴリ・記入チェック機能用
npx wrangler secret put RESEND_API_KEY      # 見積書メール送信用

# 5. wrangler.toml の [vars] を編集（メール送信元・社内通知先）
#   MAIL_FROM = "quotes@あなたのドメイン"      ※Resendで送信ドメイン認証が必要
#   COMPANY_NOTIFY_EMAIL = "info@あなたのドメイン"

# 6. 型チェック
npx tsc --noEmit

# 7. デプロイ
npm run deploy
```

## Resend（メール送信）のセットアップ
1. https://resend.com でアカウント作成
2. 「Domains」から送信に使うドメイン（例：`aster-systems.jp`）を追加し、
   表示されるDNSレコード（SPF/DKIM）をドメインのDNS設定に追加して認証を完了させる
   （認証が済むまでは `onboarding@resend.dev` などResend提供の仮アドレスでテスト送信は可能）
3. 「API Keys」でキーを発行 → `npx wrangler secret put RESEND_API_KEY` で設定
4. `wrangler.toml` の `MAIL_FROM` を認証済みドメインのアドレスに変更

## AI自動対応パイプライン（2026-08-29追加、既定OFF）

依頼受付（見積もりシミュレーター→ヒアリング完了、またはメール受信）を起点に、AIがヒアリング内容を分類・構造化し、正式見積書の送付や要件定義書・仕様書（社内専用）の下書き生成までを人の確認なしで自動実行する機能です。

- **既定でOFF**です。管理画面の「全自動AI対応」ボタンから明示的にONにするまで、これまでの挙動（管理者が手動で正式見積書を送付する等）は一切変わりません
- **金額はAI自身の判断で決定されます**（2026-08-29、ユーザー明示指示により決定的な計算ロジックへの委譲・実在するプラン/オプションかどうかの照合を撤廃済み）。AIが判断した金額がそのまま正式見積書として自動送信される点にご留意ください
- 全ての自動送受信・AI判定は「やり取りタイムライン」（管理画面の各案件詳細から開けます）で確認できます
- 詳しい設計判断・撤廃の経緯は `.claude/memory/decisions.md`（2026-08-29）を参照してください

### メール受信を有効にする場合（Phase 7、任意）

問い合わせメールをAIが自動で読み取り、上記パイプラインに乗せる機能です。**以下はCloudflareダッシュボード側の手動設定が必要で、コードのデプロイだけでは有効になりません。**

1. 受信に使う独自ドメイン（例：`aster-system.com`）をCloudflareにオンボード（DNSをCloudflareに向ける）
2. Cloudflareダッシュボード → 該当ドメイン →「Email」→「Email Routing」を有効化
3. 「Routing rules」で、受信したいアドレス（例：`info@aster-system.com`）→ 宛先を「Send to a Worker」→ このWorker（`ty-mitumori`）を選択
   （CLIの場合：`wrangler email routing rules create` でも設定可能）
4. 必要であれば、`wrangler.toml` の `[vars]` に `SITE_ORIGIN = "https://studio.aster-system.com"` を追記する（未設定でも同じ値にフォールバックするため必須ではない）
5. 実際にテストメールを送信し、管理画面の案件一覧・やり取りタイムラインに反映されることを確認する

## Gitとの連携
このプロジェクトをGitHub等で管理し、Cloudflareと連携する方法は主に2通りあります。

### 方法A：Cloudflare Workers Builds（GUIから連携・おすすめ）
1. GitHubにこのフォルダの中身をpush（リポジトリ作成 → `git init` → `git add .` → `git commit` → `git push`）
2. Cloudflareダッシュボード → Workers & Pages → 該当のWorker → 「Settings」→「Build」
3. 「Connect to Git」からGitHubリポジトリを選択し、ブランチ（例：`main`）を指定
4. 以後はそのブランチにpushするたびに自動でビルド・デプロイされます
5. シークレット（ANTHROPIC_API_KEY等）はダッシュボードの「Settings」→「Variables and Secrets」からも設定可能です

### 方法B：GitHub Actionsで `wrangler deploy` を実行
リポジトリに `.github/workflows/deploy.yml` を追加し、Cloudflareの
API Token（`CLOUDFLARE_API_TOKEN`）をGitHub Secretsに設定してpush時に
`npx wrangler deploy` を実行させる方法です。細かい設定が必要な場合はお知らせください。

**注意**：`.gitignore` で `node_modules/`・`.wrangler/`・`.dev.vars` は除外済みです。
シークレット類（APIキー）は**絶対にコードにもGitにも含めない**でください。

## 独自ドメインの設定
1. ドメインをCloudflareに追加していない場合は、Cloudflareダッシュボードで
   「ドメインを追加」からネームサーバーをCloudflareに向ける
2. Workers & Pages → 該当のWorker →「Settings」→「Domains & Routes」
3. 「Add」→「Custom Domain」で使いたいドメイン／サブドメイン
   （例：`mitsumori.aster-systems.jp`）を入力
4. 自動的にDNSレコードとSSL証明書が設定され、数分で反映されます
5. 反映後はそのドメインで `https://mitsumori.aster-systems.jp/portal` のようにアクセスできます

## 構成

| パス | 内容 |
|---|---|
| `public/portal.html` + `css/portal.css` | ポータル（メインの入口） |
| `public/customer/estimate.html` + `css/estimate.css` | 見積もりシミュレーター（旧index.html） |
| `public/hearing/hearing*.html` + `css/hearing.css` | ヒアリングシート5種 |
| `public/customer/quote.html` + `css/quote.css` + `js/quote.js` | 見積書（印刷/PDF保存） |
| `public/admin/admin.html` + `css/admin.css` + `js/admin.js` | 管理者ダッシュボード（隠しアクセスのみ） |
| `public/customer/mypage.html` + `css/mypage.css` + `js/mypage.js` | 顧客マイページ |
| `public/admin/dashboard.html` + `css/insights.css` + `js/dashboard.js` | 経営ダッシュボード |
| `public/admin/structure.html` + `css/insights.css` + `js/structure.js` | アプリ構造ビューアー |
| `public/admin/proposal.html` + `css/proposal.css` + `js/proposal.js` | 提案依頼書 |
| `public/admin/requirements.html` / `spec.html` + `js/document-viewer.js` | AI自動生成の要件定義書・仕様書下書き（社内専用） |
| `public/admin/case-timeline.html` + `js/case-timeline.js` | やり取りタイムライン（監査ログ） |
| `public/js/pricing-config.js` | 料金ロジック設定（人日単価×日数、ブラウザ正本） |
| `public/js/pricing-calc.js` | 金額計算ロジック本体（ブラウザ・サーバー共有） |
| `public/js/hearing-config.js` | ヒアリング項目設定（カテゴリ別） |
| `src/index.ts` | Cloudflare Workers（Hono）。API・認証・メール送信/受信・AI連携・静的配信 |
| `src/ai-pipeline.ts` | AI自動判断パイプライン（分類・抽出・選定・資料生成） |
| `src/pricing-catalog.ts` | 料金カタログのサーバー用複製（`pricing-config.js`と要同期） |
| `db/schema.sql` | D1スキーマ |
| `tsconfig.json` | 型チェック用設定（`npx tsc --noEmit`） |

## 料金ロジック（人日ベース）
`public/js/pricing-config.js` の各プラン・オプションは
`人日単価（rate）× 稼働日数（days）＝ 金額（price）` で構成しています。
カテゴリ別標準人日単価：Web ¥45,000 / 動画 ¥40,000 / アプリ ¥65,000 / デザイン ¥35,000 / システム ¥70,000。

## 認証について
- パスワードは PBKDF2-SHA256（10万回）でハッシュ化しD1に保存。
- セッションはCookie（httpOnly, 7日間有効）+ D1の `admin_sessions` テーブルで管理。
- 管理者アカウントの追加・削除UIは未実装です。

## 注意
- Googleフォント（Noto Sans JP / JetBrains Mono）を使用しているため、インターネット接続がある環境でご確認ください。
- `/api/ai/*` は未認証の一般公開エンドポイントです。公開後はCloudflareダッシュボードの「Rate Limiting Rules」でIP単位のレート制限を追加することを推奨します。
- `CATEGORY_INFO`（`src/index.ts`）は `pricing-config.js` と手動同期が必要です。プラン構成変更時はあわせて更新してください。
- `wrangler.toml` の `database_id` は実際に `wrangler d1 create` で発行されたIDに置き換え済みかご確認ください。
