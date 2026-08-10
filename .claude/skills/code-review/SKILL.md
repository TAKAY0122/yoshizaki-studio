---
name: code-review
description: yoshizaki-studioの実装差分を、設計方針・計算ロジック・ルール違反の観点でレビューする。実装後に使う。
allowed-tools: Read Grep Glob Bash
---

# 手順
1. `git diff` で変更内容を確認する
2. `.claude/rules/architecture.md` の方針（単一ファイル構成の踏襲、料金体系は管理画面編集可能な設計を維持等）に沿っているか確認する
3. 見積金額・セットプラン割引・納品スケジュール倍率の計算ロジックが変わっている場合、既存の計算結果とのズレがないか確認する
4. `.claude/rules/wrangler.md`・`content-policy.md`・`repo-hygiene.md` に反していないか確認する

# 出力
- 問題ない点
- 修正が必要な点（重大度付き、具体的な修正案つき）
- 判断が難しく人手確認が必要な点
