# 既知の問題・回避策

発生した不具合とその回避策・恒久対応の状況を記録する。

- 過去に「/portal.html」等へのアクセスがCloudflareのクリーンURL化機能とsrc/index.ts側のリダイレクトで衝突し、無限リダイレクトループ（ERR_TOO_MANY_REDIRECTS）が発生。`wrangler.toml`の`html_handling = "none"`で解消済み
- （解消済み）ルート直下に未追跡の`schema.sql`が残っていたが、`db/schema.sql`より内容が多かったため統合し、ルート直下のファイルは削除した
