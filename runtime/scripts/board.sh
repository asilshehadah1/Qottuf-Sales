#!/bin/bash
# Starts the Qottuf BD Board and opens it in the browser. Leave the window open while you use it; Control-C stops it.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=$(grep -E '^BOARD_PORT=' .env 2>/dev/null | head -1 | cut -d= -f2 | tr -d '"' || true)
PORT=${PORT:-4300}
URL="http://localhost:$PORT"

open_page() {
  if command -v open >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1
  else echo "Open $URL in your browser."
  fi
}
up() { curl -fsS -o /dev/null "$URL/api/status" 2>/dev/null; }

if up; then
  echo "The board is already running at $URL"
  open_page
  exit 0
fi

# Open the page as soon as the server answers.
( for _ in $(seq 1 90); do sleep 1; if up; then open_page; exit 0; fi; done ) &
exec npm run --silent board
