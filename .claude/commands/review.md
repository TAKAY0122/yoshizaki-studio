---
description: 変更内容をyoshizaki-studioのルールに沿ってレビューする
---
1. `.claude/rules/architecture.md` に沿った設計になっているか確認する
2. `wrangler.toml` に触れていないか、触れている場合は `.claude/rules/wrangler.md` に反していないか確認する
3. コード・コメント・UI文言に「RB事業2課」「AI」といった禁止表現が含まれていないか確認する（`.claude/rules/content-policy.md` 参照）
4. リポジトリ直下に資料ファイルや重複スキーマが増えていないか確認する（`.claude/rules/repo-hygiene.md` 参照）
5. 変更ファイルのみが提示されているか確認する
6. 必要に応じて `.claude/agents/code-reviewer.md` や `security-reviewer.md` を使った独立レビューを依頼する
