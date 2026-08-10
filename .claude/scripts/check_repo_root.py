import json, sys, re

data = json.load(sys.stdin) if not sys.stdin.isatty() else {}
text = json.dumps(data, ensure_ascii=False)

# リポジトリ直下に新しい資料ファイル(zip/docx等)や重複schema.sqlを作ろうとしていないか検知
patterns = [
    r'"file_path"\s*:\s*"(?!.*\/)[^"/]*\.(zip|docx|pdf)"',  # ルート直下のzip/docx/pdf
    r'"file_path"\s*:\s*"schema\.sql"',  # ルート直下のschema.sql
]

if any(re.search(p, text) for p in patterns):
    print(
        "リポジトリ直下に資料ファイルや重複スキーマを作成しようとしている可能性があります。"
        ".claude/rules/repo-hygiene.md を確認してください（資料はdocs/へ、スキーマ正本はdb/schema.sqlのみ）。",
        file=sys.stderr,
    )
    sys.exit(0)  # 注意喚起のみ、ブロックはしない

sys.exit(0)
