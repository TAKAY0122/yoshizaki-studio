# 既知の問題・回避策

発生した不具合とその回避策・恒久対応の状況を記録する。

- 過去に「/portal.html」等へのアクセスがCloudflareのクリーンURL化機能とsrc/index.ts側のリダイレクトで衝突し、無限リダイレクトループ（ERR_TOO_MANY_REDIRECTS）が発生。`wrangler.toml`の`html_handling = "none"`で解消済み
- （解消済み）ルート直下に未追跡の`schema.sql`が残っていたが、`db/schema.sql`より内容が多かったため統合し、ルート直下のファイルは削除した
- （解消済み）`public/index.html`が`estimate.html`の古いコピーとして残存し、どこからも参照されていなかった（2026-08-11 サイト構成レビューで発見・削除）。以後、`estimate.html`側の変更を`index.html`にも反映する、といった二重メンテナンスは不要
- （未解消・要確認）`public/js/pricing-config.js`冒頭コメントは「xlsxの単価表を基準にした目安値」と説明しているが、実際は`web`カテゴリの全プランが`dailyRate: 45000`固定で日数のみ変える設計になっている。コメントと実装意図に齟齬がある可能性があり、金額計算ロジックに関わるため担当者の確認が必要（2026-08-11時点、未対応）
