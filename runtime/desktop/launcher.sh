#!/bin/bash
# Qottuf Board, browser edition: what the desktop app runs when this Mac couldn't compile the app's own window.
# It starts the board in the background if it isn't running, then opens it in an app-style window of Chrome, Edge
# or Brave, or else in the default browser. The board keeps running in the background; stop it with:  qottuf-board stop
# build-mac-app.sh copies this file into the app as its program. Written for the bash 3.2 that ships with macOS.
set -u

here="$(cd "$(dirname "$0")" && pwd)"
conf="$here/../Resources/board.conf"
RUNTIME=$(sed -n 's/^runtime=//p' "$conf" 2>/dev/null)
NODE=$(sed -n 's/^node=//p' "$conf" 2>/dev/null)
LOG="$HOME/Library/Logs/Qottuf Board.log"

# A dialog, since an app has no terminal to print to.
problem() {
  /usr/bin/osascript -e 'on run argv' -e 'display alert "Qottuf Board" message (item 1 of argv)' -e 'end run' "$1" >/dev/null 2>&1 \
    || printf '%s\n' "$1" >&2
}

if [ -z "$RUNTIME" ] || [ ! -d "$RUNTIME" ]; then
  problem "The app doesn't know where the board is. Run the board's installer again."
  exit 1
fi

PORT=$(grep -E '^BOARD_PORT=' "$RUNTIME/.env" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '"' || true)
PORT=${PORT:-4300}
URL="http://localhost:$PORT"
up() { curl -fsS -o /dev/null --max-time 2 "$URL/api/status" 2>/dev/null; }

if ! up; then
  # Apps don't get the terminal's PATH: use the Node the installer found, else the usual places.
  for candidate in "$NODE" /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then NODE=$candidate; break; fi
  done
  if [ -z "$NODE" ] || [ ! -x "$NODE" ]; then
    problem "Node.js wasn't found. The board needs Node 22.18 or newer: run the board's installer again."
    exit 1
  fi
  mkdir -p "$(dirname "$LOG")"
  printf '\n--- %s Qottuf Board (browser edition) starts the board on port %s with %s\n' "$(date)" "$PORT" "$NODE" >> "$LOG"
  (
    cd "$RUNTIME" || exit 1
    PATH="$(dirname "$NODE"):/opt/homebrew/bin:/usr/local/bin:$PATH" \
      nohup "$NODE" --import tsx "$RUNTIME/src/board/main.ts" >> "$LOG" 2>&1 < /dev/null &
  )
  for _ in $(seq 1 240); do up && break; sleep 0.5; done
  if ! up; then
    problem "The board didn't start. Its log opens next: the last lines say why."
    open "$LOG"
    exit 1
  fi
fi

# An app-style window (no tabs or address bar) where a Chromium browser is installed, else the default browser.
for browser in "Google Chrome" "Microsoft Edge" "Brave Browser" "Chromium"; do
  for folder in /Applications "$HOME/Applications"; do
    if [ -d "$folder/$browser.app" ]; then
      open -na "$folder/$browser.app" --args --app="$URL/"
      exit 0
    fi
  done
done
open "$URL/"
