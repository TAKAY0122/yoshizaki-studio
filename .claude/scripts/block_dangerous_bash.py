import json, sys, re

data = json.load(sys.stdin) if not sys.stdin.isatty() else {}
text = json.dumps(data, ensure_ascii=False)

danger = [
    r"rm\s+-rf\s+/",
    r"git\s+push\s+.*--force",
    r"npm\s+publish",
    r"curl.+\|\s*(?:bash|sh)",
    r"wrangler\s+d1\s+execute.*--yes",  # 確認なしのD1実行を警戒
]

if any(re.search(p, text, re.I) for p in danger):
    print("危険度の高いコマンド候補をブロックしました。人が確認してください。", file=sys.stderr)
    sys.exit(2)

sys.exit(0)
