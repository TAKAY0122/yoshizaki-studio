import json, sys

data = json.load(sys.stdin) if not sys.stdin.isatty() else {}
file_path = data.get("tool_input", {}).get("file_path", "(不明なファイル)")
print(f"[変更通知] {file_path} が編集されました。", file=sys.stderr)
sys.exit(0)
