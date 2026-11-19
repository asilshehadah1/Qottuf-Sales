#!/bin/bash
# Installs the Qottuf BD Board on this computer and opens it. On a Mac it builds the Qottuf Board desktop app
# (~/Applications, with a link on the Desktop); everywhere it adds a `qottuf-board` command. Linux works too.
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/asilshehadah1/Qottuf-Sales/refs/heads/claude/hopeful-archimedes-6kncjp/runtime/scripts/install-board.sh)
#
# Run it again any time to update. It never overwrites your settings (runtime/.env) or your data (runtime/.data).
# Written for the bash 3.2 that ships with macOS.
set -euo pipefail

REPO_URL="https://github.com/asilshehadah1/Qottuf-Sales.git"
BRANCH="claude/hopeful-archimedes-6kncjp"
DIR="${QOTTUF_BOARD_HOME:-$HOME/Qottuf-Sales}"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
note() { printf '%s\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
# Questions are read from the terminal itself, so they work under bash <(curl …). With no terminal, they're skipped.
has_tty() { (exec </dev/tty) 2>/dev/null; }
ask() { # ask "question" -> reply in $REPLY
  REPLY=""
  has_tty || return 0
  printf '%s' "$1"
  IFS= read -r REPLY 2>/dev/null </dev/tty || REPLY=""
}

# ---------------------------------------------------------------- 1. git and Node 22.18 or newer
command -v git >/dev/null 2>&1 || fail "git isn't installed. Run:  xcode-select --install   then run this installer again."

node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local v major rest minor
  v=$(node -p 'process.versions.node' 2>/dev/null) || return 1
  major=${v%%.*}; rest=${v#*.}; minor=${rest%%.*}
  [ "$major" -gt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -ge 18 ]; }
}

if ! node_ok; then
  if command -v brew >/dev/null 2>&1; then
    if command -v node >/dev/null 2>&1; then
      ask "Node $(node -v) is too old for the board (it needs 22.18 or newer). Upgrade it with Homebrew now? [y/N] "
      case "$REPLY" in [yY]*) brew upgrade node || brew install node ;; *) fail "Upgrade Node (brew upgrade node, or the LTS from https://nodejs.org), then run this again." ;; esac
    else
      say "Installing Node with Homebrew…"
      brew install node
    fi
    hash -r
    node_ok || fail "Node is still older than 22.18 on this terminal's PATH ($(command -v node)). Install the LTS from https://nodejs.org, open a new Terminal window and run this again."
  else
    fail "The board needs Node 22.18 or newer. Install the LTS from https://nodejs.org, open a new Terminal window and run this again."
  fi
fi
note "Node $(node -v) at $(command -v node)"

# ---------------------------------------------------------------- 2. the code: download, or update an existing copy
if [ -d "$DIR/.git" ]; then
  say "Updating $DIR…"
  git -C "$DIR" fetch --quiet origin "$BRANCH"
  git -C "$DIR" checkout --quiet "$BRANCH" 2>/dev/null || git -C "$DIR" checkout --quiet -b "$BRANCH" "origin/$BRANCH"
  git -C "$DIR" merge --ff-only --quiet "origin/$BRANCH" || fail "$DIR has local changes that block the update. Move the folder aside and run this again."
elif [ -e "$DIR" ]; then
  fail "$DIR already exists and isn't a copy of the board. Move it aside, or install elsewhere with:  QOTTUF_BOARD_HOME=/some/other/folder bash <(curl …)"
else
  say "Downloading the board to $DIR…"
  git clone --quiet --branch "$BRANCH" --single-branch "$REPO_URL" "$DIR"
fi
cd "$DIR/runtime"

# A running board would keep the old code, and npm ci swaps its packages out from under it: stop it first.
port=$(grep -E '^BOARD_PORT=' .env 2>/dev/null | head -1 | cut -d= -f2 | tr -d '"' || true)
if curl -fsS -o /dev/null --max-time 3 "http://localhost:${port:-4300}/api/status" 2>/dev/null; then
  say "Stopping the running board for the update…"
  bash scripts/board.sh stop || fail "Quit the board first (Qottuf Board, then Quit; or Control-C where it runs), then run this again."
fi

say "Installing the board's packages (a minute or two the first time)…"
npm ci --no-audit --no-fund --no-update-notifier --loglevel=error

# ---------------------------------------------------------------- 3. settings in runtime/.env: created once, never overwritten
if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  note "Created $DIR/runtime/.env"
fi

current_key=$(grep -E '^ANTHROPIC_API_KEY=' .env | head -1 | cut -d= -f2- | tr -d '"' || true)
if [ -z "$current_key" ] && ! has_tty; then
  note "No API key yet: add ANTHROPIC_API_KEY to $DIR/runtime/.env to turn the writing agents on."
elif [ -z "$current_key" ]; then
  printf '\nThe writing agents (case studies, briefs, LinkedIn posts, elevator ads, web pages) run on your Anthropic API account.\n'
  printf 'Paste your API key from console.anthropic.com, or press Enter to skip (you can add it to runtime/.env later): '
  key=""
  IFS= read -rs key 2>/dev/null </dev/tty || key=""
  echo
  if [ -n "$key" ]; then
    case "$key" in sk-ant-*) ;; *) note "That doesn't look like an Anthropic key (they start with sk-ant-). Saving it anyway; check it on the board's Connections page." ;; esac
    tmp=$(mktemp)
    grep -v -E '^(ANTHROPIC_API_KEY|QOTTUF_MODEL_CALLS)=' .env > "$tmp" || true
    printf 'QOTTUF_MODEL_CALLS=enabled\nANTHROPIC_API_KEY=%s\n' "$key" >> "$tmp"
    mv "$tmp" .env
    chmod 600 .env
    unset key
    say "Saved. The key stays in $DIR/runtime/.env, readable only by you, and never goes into git."
  fi
fi

# The qottuf-brand skill: the rulebook and the fact base the board reads at start.
if ! grep -qE '^QOTTUF_BRAND_DIR=' .env; then
  brand=""
  for base in "$HOME/.claude/skills" "$HOME/Library/Application Support/Claude" "$HOME/.config/claude"; do
    [ -d "$base" ] || continue
    found=$(find "$base" -maxdepth 7 -type f -name facts-and-claims.md -path '*qottuf-brand*' 2>/dev/null | head -1 || true)
    if [ -n "$found" ]; then brand=$(cd "$(dirname "$found")/.." && pwd); break; fi
  done
  if [ -n "$brand" ] && [ -f "$brand/assets/brand-rules.json" ]; then
    printf 'QOTTUF_BRAND_DIR="%s"\n' "$brand" >> .env
    note "Found the Qottuf brand skill: $brand"
  else
    note "The qottuf-brand skill wasn't found here. The board runs with its test rulebook until QOTTUF_BRAND_DIR in runtime/.env names the skill's folder (the board's Connections page says which is in use)."
  fi
fi

# ---------------------------------------------------------------- 4. the command: qottuf-board
launcher="$DIR/runtime/scripts/board.sh"
chmod +x "$launcher"
case "${SHELL:-}" in *bash) rc="$HOME/.bash_profile" ;; *) rc="$HOME/.zshrc" ;; esac
if ! grep -q 'alias qottuf-board=' "$rc" 2>/dev/null; then
  printf '\n# Qottuf BD Board (added by its installer)\nalias qottuf-board="%s"\n' "$launcher" >> "$rc"
  note "Added the qottuf-board command to $rc"
fi

# ---------------------------------------------------------------- 5. the desktop app (macOS)
app=""
if [ "$(uname)" = "Darwin" ]; then
  say "Making the Qottuf Board app…"
  if bash "$DIR/runtime/desktop/build-mac-app.sh"; then
    app="${QOTTUF_APP_DIR:-$HOME/Applications}/Qottuf Board.app"
  else
    printf '#!/bin/bash\nexec "%s"\n' "$launcher" > "$DIR/Qottuf Board.command"
    chmod +x "$DIR/Qottuf Board.command"
    note "The app couldn't be made. Double-click this instead: $DIR/Qottuf Board.command"
  fi
fi

say "Installed."
if [ -n "$app" ]; then note "Open Qottuf Board from your Desktop, Launchpad or Spotlight."; fi
note "From Terminal:  qottuf-board  starts it,  qottuf-board stop  stops it."
[ -n "${QOTTUF_INSTALL_NO_START:-}" ] && exit 0
if [ -n "$app" ]; then
  say "Opening Qottuf Board…"
  open "$app"
  exit 0
fi
say "Starting the board…"
exec "$launcher"
