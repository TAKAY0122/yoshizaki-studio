import json, sys, re

data = json.load(sys.stdin) if not sys.stdin.isatty() else {}
text = json.dumps(data, ensure_ascii=False)

patterns = [
    r"AKIA[0-9A-Z]{16}",
    r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
    r"sk-[A-Za-z0-9_-]{20,}",  # Anthropic/OpenAI系APIキー形式
    r"re_[A-Za-z0-9]{20,}",     # Resend APIキー形式
]

if any(re.search(p, text) for p in patterns):
    print("秘密情報らしい文字列を検出しました。内容を確認してください。", file=sys.stderr)
    sys.exit(2)

sys.exit(0)
