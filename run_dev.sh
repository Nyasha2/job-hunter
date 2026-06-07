#!/usr/bin/env bash
# Start Job Hunter backend (:8001) and frontend (:5174) together.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

cleanup() {
  [[ -n "${BACKEND_PID:-}" ]] && kill "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

if [[ ! -x "$ROOT/backend/.venv/bin/python" ]]; then
  echo "Creating backend venv…"
  (cd "$ROOT/backend" && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt)
fi

if [[ ! -f "$ROOT/backend/.env" ]]; then
  echo "Create backend/.env from .env.example and set ANTHROPIC_API_KEY"
  cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"
fi

if [[ ! -d "$ROOT/node_modules" ]]; then
  echo "Installing frontend dependencies…"
  (cd "$ROOT" && npm install)
fi

echo "Starting backend on http://127.0.0.1:8001 …"
if lsof -i :8001 -t >/dev/null 2>&1; then
  lsof -i :8001 -t | xargs kill 2>/dev/null || true
  sleep 1
fi
"$ROOT/backend/run_dev.sh" &
BACKEND_PID=$!
sleep 2

echo "Starting frontend on http://localhost:5174 …"
cd "$ROOT"
exec npm run dev
