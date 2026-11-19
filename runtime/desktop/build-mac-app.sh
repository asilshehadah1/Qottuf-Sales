#!/bin/bash
# Builds the Qottuf Board desktop app on this Mac: ~/Applications/Qottuf Board.app, with a link on the Desktop.
# The installer runs it. Run it again yourself after moving the board's folder or changing Node:
#
#   bash ~/Qottuf-Sales/runtime/desktop/build-mac-app.sh
#
# It compiles QottufBoard.swift with Apple's command line tools. Without them, the app it builds opens the board in
# the browser instead of in its own window. Written for the bash 3.2 that ships with macOS.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
RUNTIME="$(cd "$HERE/.." && pwd)"
NAME="Qottuf Board"
APPS="${QOTTUF_APP_DIR:-$HOME/Applications}"
APP="$APPS/$NAME.app"
BUILD_LOG="$HOME/Library/Logs/Qottuf Board build.log"

note() { printf '%s\n' "$*"; }
[ "$(uname)" = "Darwin" ] || { note "The desktop app is for macOS. On this computer, use the qottuf-board command."; exit 1; }
NODE="${QOTTUF_NODE:-$(command -v node || true)}"
[ -n "$NODE" ] || { note "Node isn't on this terminal's PATH. Run the board's installer first."; exit 1; }
mkdir -p "$(dirname "$BUILD_LOG")"
: > "$BUILD_LOG"

work="$(mktemp -d "${TMPDIR:-/tmp}/qottuf-board-app.XXXXXX")"
trap 'rm -rf "$work"' EXIT
bundle="$work/$NAME.app"
mkdir -p "$bundle/Contents/MacOS" "$bundle/Contents/Resources"

# ---------------------------------------------------------------- 1. the program
# Its own window when this Mac can compile it; otherwise a launcher that opens the board in the browser.
note "Building the app (up to a minute)…"
kind=window
if ! xcrun --sdk macosx swiftc -O -parse-as-library -o "$bundle/Contents/MacOS/$NAME" "$HERE/QottufBoard.swift" >> "$BUILD_LOG" 2>&1; then
  kind=browser
  cp "$HERE/launcher.sh" "$bundle/Contents/MacOS/$NAME"
  chmod +x "$bundle/Contents/MacOS/$NAME"
fi

# ---------------------------------------------------------------- 2. what the app reads: the board's folder and Node
printf 'runtime=%s\nnode=%s\n' "$RUNTIME" "$NODE" > "$bundle/Contents/Resources/board.conf"

cat > "$bundle/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleDisplayName</key><string>Qottuf Board</string>
  <key>CFBundleExecutable</key><string>Qottuf Board</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundleIdentifier</key><string>com.qottuf.bd-board</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>Qottuf Board</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.business</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSSupportsAutomaticTermination</key><false/>
  <key>NSSupportsSuddenTermination</key><false/>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key><true/>
    <key>NSAllowsArbitraryLoadsInWebContent</key><true/>
  </dict>
</dict>
</plist>
PLIST

# ---------------------------------------------------------------- 3. the icon
# The Qottuf mark from the brand skill when the board knows where the skill is (made here, never stored in git);
# otherwise the board's own icon.
icon_src="$HERE/icon-1024.png"
icon_kind="the board's icon"
brand=$(grep -E '^QOTTUF_BRAND_DIR=' "$RUNTIME/.env" 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true)
mark="$brand/assets/logo/icon-white.png"
if [ "$kind" = window ] && [ -n "$brand" ] && [ -f "$mark" ] \
  && "$bundle/Contents/MacOS/$NAME" --compose-icon "$mark" "$work/icon-1024.png" >> "$BUILD_LOG" 2>&1; then
  icon_src="$work/icon-1024.png"
  icon_kind="the Qottuf mark"
fi
make_icns() {
  local iconset="$work/AppIcon.iconset" s
  mkdir -p "$iconset"
  for s in 16 32 128 256 512; do
    sips -z "$s" "$s" "$icon_src" --out "$iconset/icon_${s}x${s}.png" > /dev/null || return 1
    sips -z "$((s * 2))" "$((s * 2))" "$icon_src" --out "$iconset/icon_${s}x${s}@2x.png" > /dev/null || return 1
  done
  iconutil -c icns "$iconset" -o "$bundle/Contents/Resources/AppIcon.icns"
}
if ! make_icns >> "$BUILD_LOG" 2>&1; then
  icon_kind="no icon (it couldn't be made; the app works without it)"
fi

# ---------------------------------------------------------------- 4. sign it for this Mac only, and put it in place
codesign --force --deep --sign - "$bundle" >> "$BUILD_LOG" 2>&1 || true
mkdir -p "$APPS"
rm -rf "$APP"
mv "$bundle" "$APP"
touch "$APP"
lsregister=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
if [ -x "$lsregister" ]; then "$lsregister" -f "$APP" > /dev/null 2>&1 || true; fi

# A link on the Desktop, unless something else already has the name.
on_desktop=no
link="$HOME/Desktop/$NAME"
if [ -L "$link" ] || [ ! -e "$link" ]; then
  if ln -sfn "$APP" "$link" 2> /dev/null; then on_desktop=yes; fi
fi

# ---------------------------------------------------------------- 5. say what was built
if [ "$kind" = window ]; then
  note "Built $APP: the board in its own window, with $icon_kind."
else
  note "Built $APP, but this Mac couldn't compile the app's own window, so the app opens the board in your browser."
  note "  Why: $(grep -m1 -iE 'error|license|xcrun|not found' "$BUILD_LOG" || tail -1 "$BUILD_LOG")"
  note "  For the window: install Apple's command line tools (xcode-select --install), then run: bash \"$HERE/build-mac-app.sh\""
fi
if [ "$on_desktop" = yes ]; then
  note "Open it from your Desktop, Launchpad or Spotlight (type Qottuf). To keep it in the Dock: open it, Control-click its Dock icon, then Options, Keep in Dock."
else
  note "Open it from Launchpad or Spotlight (type Qottuf), or from $APPS."
fi
