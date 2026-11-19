#!/bin/bash
# Starts the Qottuf BD Board and opens it in the browser. Leave the window open while you use it; Control-C stops it.
#
#   qottuf-board         start it, or open it if it's already running
#   qottuf-board stop    stop it, wherever it was started (the desktop app quits too)
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
up() { curl -fsS -o /dev/null --max-time 3 "$URL/api/status" 2>/dev/null; }
wait_down() { local _; for _ in $(seq 1 20); do up || return 0; sleep 0.5; done; return 1; }

stop_board() {
  if ! up; then echo "The board isn't running."; return 0; fi
  # The desktop app stops the board it started when it quits.
  if pgrep -x "Qottuf Board" >/dev/null 2>&1; then
    pkill -x "Qottuf Board" 2>/dev/null || true
    if wait_down; then echo "Stopped the board (and closed the Qottuf Board app)."; return 0; fi
  fi
  # Started from Terminal, or by the browser edition of the app: stop the process listening on the board's port.
  local pids
  pids=$( { lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || fuser -n tcp "$PORT" 2>/dev/null || true; } | tr -s ' \n' ' ')
  # shellcheck disable=SC2086 # process ids, one word each
  if [ -n "${pids// /}" ]; then kill $pids 2>/dev/null || true; fi
  if wait_down; then echo "Stopped the board."; return 0; fi
  echo "The board is still running at $URL. Quit it (Qottuf Board, then Quit; or Control-C where it runs), then try again." >&2
  return 1
}

case "${1:-}" in
  stop) stop_board; exit $? ;;
  "") ;;
  *) echo "Usage: qottuf-board [stop]" >&2; exit 2 ;;
esac

if up; then
  echo "The board is already running at $URL"
  open_page
  exit 0
fi

# Open the page as soon as the server answers.
( for _ in $(seq 1 90); do sleep 1; if up; then open_page; exit 0; fi; done ) &
exec npm run --silent board
