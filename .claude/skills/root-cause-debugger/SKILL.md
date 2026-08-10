---
name: root-cause-debugger
description: yoshizaki-studioで発生したバグ・エラーの根本原因を特定する。「なぜこのエラーが起きるか調べて」と言われたら使う。
allowed-tools: Read Grep Glob Bash
---

# 手順
1. エラーメッセージ・再現手順・期待される挙動を整理する
2. 関連コード（`src/index.ts`のルーティング、見積計算・PDF生成・メール送信・D1クエリ等）を特定する
3. 最小の再現ケースを作れないか試す
4. 根本原因の仮説を1つに絞り込めるまで調査する
5. 応急対応と恒久対応を分けて提示する

# ルール
- 原因を特定する前に修正コードを書かない
- リダイレクト・ルーティング関連の不具合では `wrangler.toml` の `html_handling` / `run_worker_first` の設定も疑う（過去に無限リダイレクトの実例あり）
- 調査結果は `.claude/memory/known-issues.md` に追記できる形式でまとめる
