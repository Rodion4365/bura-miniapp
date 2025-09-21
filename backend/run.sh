#!/usr/bin/env bash
set -euo pipefail
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi
: "${BOT_TOKEN:?BOT_TOKEN is required (put it in backend/.env)}"
export ORIGIN=${ORIGIN:-"http://localhost:5173"}
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
