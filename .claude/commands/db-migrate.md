---
description: D1のスキーマ変更を安全に適用する
---
1. 変更内容を `db/schema.sql` に反映する（ルート直下に別のschema.sqlを作らない）
2. ローカルでまず `npx wrangler d1 execute ty-mitumori-db --local --file=db/schema.sql` を使って動作確認する
3. 問題なければ本番D1に対して `npx wrangler d1 execute ty-mitumori-db --remote --file=db/schema.sql` を実行する
4. 既存のシード行（セットプラン等）を無断で削除・変更していないか確認する
5. 変更内容を `.claude/memory/decisions.md` に1行で記録する
