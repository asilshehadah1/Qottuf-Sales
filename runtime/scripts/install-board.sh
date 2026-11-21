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
# Questions are read from the terminal itself, so they work under bash <(curl ...). With no terminal, they're skipped.
has_tty() { (exec </dev/tty) 2>/dev/null; }
ask() { # ask "question" -> reply in $REPLY
  REPLY=""
  has_tty || return 0
  printf '%s' "$1"
  IFS= read -r REPLY 2>/dev/null </dev/tty || REPLY=""
}

# ---------------------------------------------------------------- 1. git and Node 22.18 or newer
# On a Mac, a `git` command exists even without Apple's command line tools: a stand-in that only offers to install
# them. So run it rather than look for it.
if ! git --version >/dev/null 2>&1; then
  if [ "$(uname)" = "Darwin" ]; then
    fail "This Mac needs Apple's command line tools first: they include git, and the app is built with them.
A window may have opened offering to install them. Click Install and wait until it finishes (a few minutes).
If no window opened, run:  xcode-select --install
Then run this installer again."
  fi
  fail "git isn't installed. Install it, then run this installer again."
fi

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
      say "Installing Node with Homebrew..."
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
  say "Updating $DIR..."
  git -C "$DIR" fetch --quiet origin "$BRANCH"
  git -C "$DIR" checkout --quiet "$BRANCH" 2>/dev/null || git -C "$DIR" checkout --quiet -b "$BRANCH" "origin/$BRANCH"
  git -C "$DIR" merge --ff-only --quiet "origin/$BRANCH" || fail "$DIR has local changes that block the update. Move the folder aside and run this again."
elif [ -e "$DIR" ]; then
  fail "$DIR already exists and isn't a copy of the board. Move it aside, or install elsewhere with:  QOTTUF_BOARD_HOME=/some/other/folder bash <(curl ...)"
else
  say "Downloading the board to $DIR..."
  git clone --quiet --branch "$BRANCH" --single-branch "$REPO_URL" "$DIR"
fi
cd "$DIR/runtime"

# A running board would keep the old code, and npm ci swaps its packages out from under it: stop it first.
port=$(grep -E '^BOARD_PORT=' .env 2>/dev/null | head -1 | cut -d= -f2 | tr -d '"' || true)
if curl -fsS -o /dev/null --max-time 3 "http://localhost:${port:-4300}/api/status" 2>/dev/null; then
  say "Stopping the running board for the update..."
  bash scripts/board.sh stop || fail "Quit the board first (Qottuf Board, then Quit; or Control-C where it runs), then run this again."
fi

say "Installing the board's packages (a minute or two the first time)..."
npm ci --no-audit --no-fund --no-update-notifier --loglevel=error

# ---------------------------------------------------------------- 3. settings in runtime/.env: created once, never overwritten
if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  note "Created $DIR/runtime/.env"
fi

# The writers (case studies, briefs, LinkedIn posts, elevator ads, web pages) call Claude in one of two ways:
#  - your Claude plan: Claude Code on this computer, signed in to your own Claude account, runs each call;
#  - an Anthropic API key, billed per use.
env_value() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | tr -d '"' || true; }
set_env() { # set_env NAME VALUE: replace the line, or add it
  local tmp
  tmp=$(mktemp)
  grep -v -E "^$1=" .env > "$tmp" || true
  printf '%s=%s\n' "$1" "$2" >> "$tmp"
  mv "$tmp" .env
  chmod 600 .env
}
confirm() { # confirm "question" -> yes only when someone answers (Enter counts as yes); never yes without a terminal
  has_tty || return 1
  ask "$1"
  case "$REPLY" in [nN]*) return 1 ;; *) return 0 ;; esac
}
find_claude() {
  local c
  for c in "$(command -v claude 2>/dev/null || true)" "$HOME/.local/bin/claude" "$HOME/.claude/local/claude" /opt/homebrew/bin/claude /usr/local/bin/claude; do
    if [ -n "$c" ] && [ -x "$c" ]; then printf '%s' "$c"; return 0; fi
  done
  return 1
}

plan_setup() {
  local claude_bin method
  claude_bin=$(find_claude || true)
  if [ -z "$claude_bin" ]; then
    if confirm "The writers run through Claude Code, which isn't on this computer. Install it with Anthropic's installer? [Y/n] "; then
      curl -fsSL https://claude.ai/install.sh | bash || note "Claude Code didn't install. Try again later, or see https://code.claude.com/docs/en/setup"
      claude_bin=$(find_claude || true)
    fi
    if [ -z "$claude_bin" ]; then
      note "Without Claude Code the writers stay off. Install it with:  curl -fsSL https://claude.ai/install.sh | bash   then run this installer again."
      set_env QOTTUF_MODEL_CALLS claude-plan
      return 0
    fi
  fi
  note "Claude Code $("$claude_bin" --version 2>/dev/null | head -1 | cut -d' ' -f1) at $claude_bin"
  # How it's signed in, without any API key from the environment (that would bill the API, not the plan).
  method=$(env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN "$claude_bin" auth status 2>/dev/null | sed -n 's/.*"authMethod": *"\([^"]*\)".*/\1/p' | head -1 || true)
  case "$method" in
    claude.ai|oauth_token) note "Signed in to your Claude account." ;;
    *)
      if [ -n "$method" ] && [ "$method" != none ]; then note "Claude Code is signed in with $method, which isn't your Claude plan."; fi
      if confirm "Sign in to Claude Code with your Claude account now? A browser window opens. [Y/n] "; then
        env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN "$claude_bin" auth login </dev/tty || note "The sign-in didn't finish. Later, in Terminal:  claude auth login"
      else
        note "Later, in Terminal:  claude auth login   (sign in with your Claude account), then restart the board."
      fi
      ;;
  esac
  set_env QOTTUF_MODEL_CALLS claude-plan
  set_env QOTTUF_CLAUDE_BIN "$claude_bin"
  say "The writers run on your Claude plan, through Claude Code."
}

api_key_setup() {
  local key=""
  if [ -n "$(env_value ANTHROPIC_API_KEY)" ]; then set_env QOTTUF_MODEL_CALLS enabled; return 0; fi
  has_tty || { note "No API key yet: add ANTHROPIC_API_KEY to $DIR/runtime/.env to turn the writing agents on."; return 0; }
  printf 'Paste your API key from console.anthropic.com, or press Enter to skip (you can add it to runtime/.env later): '
  IFS= read -rs key 2>/dev/null </dev/tty || key=""
  echo
  [ -n "$key" ] || return 0
  case "$key" in sk-ant-*) ;; *) note "That doesn't look like an Anthropic key (they start with sk-ant-). Saving it anyway; check it on the board's Connections page." ;; esac
  set_env QOTTUF_MODEL_CALLS enabled
  set_env ANTHROPIC_API_KEY "$key"
  unset key
  say "Saved. The key stays in $DIR/runtime/.env, readable only by you, and never goes into git."
}

if [ "$(env_value QOTTUF_MODEL_CALLS)" = "claude-plan" ]; then
  plan_setup
elif has_tty; then
  printf '\nThe writing agents (case studies, briefs, LinkedIn posts, elevator ads, web pages) call Claude.\n'
  if confirm "Run them on your Claude plan, through Claude Code signed in to your Claude account? (n: an Anthropic API key, billed per use) [Y/n] "; then
    plan_setup
  else
    api_key_setup
  fi
else
  note "The writing agents are off. To run them on your Claude plan, run this installer again in Terminal."
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
  say "Making the Qottuf Board app..."
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
  say "Opening Qottuf Board..."
  open "$app"
  exit 0
fi
say "Starting the board..."
exec "$launcher"
