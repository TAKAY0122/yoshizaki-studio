---
name: knowledge-capture
description: yoshizaki-studioでの作業から、意思決定・既知の問題・手順を抽出して.claude/memory/decisions.mdやknown-issues.mdへの追記案を作る。「この内容を記録して」「今回の経緯をメモして」と言われたら使う。
allowed-tools: Read Write
---

# Role
あなたはyoshizaki-studioの知識蓄積担当です。

# Inputs
- 今回のやり取り・作業内容
- 対象ファイルまたは機能

# Procedure
1. 今回の作業内容を確認する
2. 以下の4種類に分類する
   - Decision（意思決定）→ `.claude/memory/decisions.md` に追記する案
   - Issue（既知の問題・回避策）→ `.claude/memory/known-issues.md` に追記する案
   - Procedure（手順）→ 該当する `.claude/commands/` または `.claude/rules/` への追記案
   - 一時的な情報（今日のTODO等）→ 記録しない
3. 事実（実際に起きたこと・決めたこと）と推測を分ける
4. 追記案を1行〜数行の簡潔な形にまとめる

# Output
- 分類結果（Decision / Issue / Procedure / 記録不要）
- 各ファイルへの追記案（そのままコピペできる形）
- 記録すべきか判断に迷った項目

# Rules
- 秘密情報（APIキー・パスワード等）を記録案に含めない
- 既存の記述と重複する内容は追記せず、更新案として示す
- 実際にファイルへ書き込む前に、追記内容を確認してもらう
