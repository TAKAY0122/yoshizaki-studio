# 既知の問題・回避策

発生した不具合とその回避策・恒久対応の状況を記録する。

- 過去に「/portal.html」等へのアクセスがCloudflareのクリーンURL化機能とsrc/index.ts側のリダイレクトで衝突し、無限リダイレクトループ（ERR_TOO_MANY_REDIRECTS）が発生。`wrangler.toml`の`html_handling = "none"`で解消済み
- （解消済み）ルート直下に未追跡の`schema.sql`が残っていたが、`db/schema.sql`より内容が多かったため統合し、ルート直下のファイルは削除した
- （解消済み）`public/index.html`が`estimate.html`の古いコピーとして残存し、どこからも参照されていなかった（2026-08-11 サイト構成レビューで発見・削除）。以後、`estimate.html`側の変更を`index.html`にも反映する、といった二重メンテナンスは不要
- （解消済み）`public/js/pricing-config.js`冒頭コメントが「xlsxの単価表を基準」という古い記述のままだった件は、2026-08-11に市場相場調査（`.claude/memory/decisions.md`参照）に基づく単価改定を実施し、コメントも実態に合わせて更新した。「カテゴリ内で日数のみ変える」設計自体は意図通り（同じ職種の作業時間差を表現する仕組み）であり、バグではなかった
