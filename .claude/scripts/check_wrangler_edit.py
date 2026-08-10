import json, sys

data = json.load(sys.stdin) if not sys.stdin.isatty() else {}
text = json.dumps(data, ensure_ascii=False)

if "wrangler.toml" in text:
    print(
        "wrangler.tomlへの編集を検知しました。database_id・MAIL_FROM・COMPANY_NOTIFY_EMAILを"
        "書き換えていないか、.claude/rules/wrangler.md のルールに沿っているか確認してください。",
        file=sys.stderr,
    )
    # ブロックはせず注意喚起のみ（sys.exit(2)にすると毎回止まってしまうため）
    sys.exit(0)

sys.exit(0)
