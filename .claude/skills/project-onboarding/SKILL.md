---
name: project-onboarding
description: yoshizaki-studioに新しくアサインされたメンバー（人間・Claude双方）向けに、プロジェクトの全体像を要約する。「このプロジェクトについて説明して」と言われたら使う。
allowed-tools: Read Grep Glob
---

# 手順
1. `CLAUDE.md` を読み、プロジェクトの目的・スタック・制約を把握する
2. `.claude/rules/` 配下を読み、設計方針・禁止事項を把握する
3. `.claude/memory/decisions.md`・`known-issues.md` を読み、過去の経緯・既知の問題を把握する
4. `README.md` を読み、業務フロー（見積もり→ヒアリング→提案依頼書→正式見積書送付）を把握する
5. 主要なディレクトリ構成（`src/index.ts`、`public/`、`db/schema.sql`）をざっと確認する

# 出力
- プロジェクトの目的・主な機能（3〜5行）
- 守るべき制約（RB事業2課の記載禁止、AI非表示、wrangler.toml、リポジトリ整理ルール等）
- 現状わかっている既知の問題
- 作業を始める上で確認すべき点
