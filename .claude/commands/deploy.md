---
description: yoshizaki-studio（ty-mitumori）をCloudflareにデプロイする
---
1. 型チェックが必要であれば `npx tsc --noEmit` を実行する（`build`スクリプトは存在しない）
2. D1のスキーマ変更がある場合は、先に以下を実行する
   `npx wrangler d1 execute ty-mitumori-db --remote --file=db/schema.sql`
3. `npm run deploy`（= `wrangler deploy`）を実行する
4. デプロイ後、studio.aster-system.com で以下をスモークテストする
   - ポータル→見積もりシミュレーターの入力〜金額計算
   - ヒアリングシート5種の送信
   - 見積書PDF生成とメール送信
   - 提案依頼書の表示（管理者ログイン状態）
   - 管理者ダッシュボード（隠しアクセス）とマイページの表示
