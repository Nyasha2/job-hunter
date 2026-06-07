#!/usr/bin/env bash
# Always use the app venv — avoids conda/base dissyslab 1.1.x shadowing 1.4.x.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
LIB_ROOT="$(cd "$ROOT/.." && pwd)/lib"
if [[ ! -x "$ROOT/.venv/bin/python" ]]; then
  echo "Missing .venv — run: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
  exit 1
fi
exec "$ROOT/.venv/bin/uvicorn" main:app --reload --reload-dir "$ROOT" --reload-dir "$LIB_ROOT" --port 8001
