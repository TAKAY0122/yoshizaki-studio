# wrangler.toml の扱い

## 絶対に守ること
- `database_id`（現行: a789626d-c648-4234-b394-8f6f6a19f9a9）を勝手に変更・再生成しない
- `MAIL_FROM` / `COMPANY_NOTIFY_EMAIL` を推測で書き換えない
- `ANTHROPIC_API_KEY` / `RESEND_API_KEY` を `[vars]` に直書きしない（`wrangler secret put` で設定するのが正しい運用）
- `wrangler.toml` 全体を書き直すのではなく、必要な箇所だけを diff / str_replace 形式で提示する

## 理由
- DB IDとメール設定は環境ごとに手動管理しており、自動生成・上書きされると本番接続が壊れる
- この制約は `.claude/scripts/block_dangerous_bash.py` の危険コマンド検知・`check_wrangler_edit.py` の注意喚起とは別に、ルールとしても明記している（機構＋ルールの二重防御）

## 変更が必要なとき
1. どの項目を変更したいか明示する（例: 新しい環境変数を追加したい）
2. 変更前後の該当行のみを提示する
3. `database_id`やメール関連の行には触れない、または触れる場合は必ず一言確認を入れる
