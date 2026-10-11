#!/bin/bash
# OpenCaptions.app (macOS). The app files travel inside the bundle (Contents/Resources/app). The first time each
# version runs, they're copied to ~/Library/Application Support/OpenCaptions/app-<version>: macOS may run a
# downloaded app from a read-only place ("App Translocation"), and the app needs to install its libraries. Settings,
# passwords and transcripts live in .../OpenCaptions/data, and the free local AI's downloads in .../OpenCaptions/local,
# so they survive updates. Then a Terminal window runs
# OpenCaptions (scripts/start.js), which opens the dashboard; closing the window stops it. No Node.js on this Mac
# (or older than 20): the official one is downloaded once into .../OpenCaptions/node.
# Run by the app's program (launcher.c); both are put in the app by scripts/package-desktop.js.
CONTENTS="$(cd "$(dirname "$0")/.." && pwd)" # OpenCaptions.app/Contents
SRC="$CONTENTS/Resources/app"
SUPPORT="$HOME/Library/Application Support/OpenCaptions"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

case "$(defaults read -g AppleLocale 2>/dev/null)" in es*) ES=1 ;; *) ES= ;; esac
say() { if [ -n "$ES" ]; then echo "$2"; else echo "$1"; fi; }
dialog() { osascript -e "button returned of (display dialog \"$1\" buttons {\"$2\", \"$3\"} default button 2 with title \"OpenCaptions\" with icon caution)" 2>/dev/null; }

node_ok() { [ -x "$1" ] && [ "$("$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 20 ]; }

# The official Node.js for this Mac's chip, checked against nodejs.org's published checksums.
# shortcut: always the newest Node 22; move to the next LTS line when package.json's engines does.
get_node() {
  local dist=https://nodejs.org/dist/latest-v22.x arch=x64 line name tmp
  [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = 1 ] && arch=arm64
  osascript -e "display notification \"$(say 'Downloading Node.js (about 50 MB, first time only)…' 'Descargando Node.js (unos 50 MB, solo la primera vez)…')\" with title \"OpenCaptions\"" 2>/dev/null
  line="$(curl -fsSL "$dist/SHASUMS256.txt" | grep " node-v[0-9.]*-darwin-$arch.tar.gz$")" || return 1
  name="${line##* }"
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/$name" "$dist/$name" \
    && [ "$(shasum -a 256 "$tmp/$name" | cut -d' ' -f1)" = "${line%% *}" ] \
    && tar -xzf "$tmp/$name" -C "$tmp" \
    && rm -rf "${SUPPORT:?}/node" && mkdir -p "$SUPPORT" && mv "$tmp/${name%.tar.gz}" "$SUPPORT/node"
  local ok=$?
  rm -rf "${tmp:?}"
  return $ok
}

# Node installed with nvm, fnm or volta is on the PATH only in the person's own shell: ask it too.
NODE="$(command -v node)"
node_ok "$NODE" || NODE="$("${SHELL:-/bin/zsh}" -ilc 'command -v node' 2>/dev/null | tail -1)"
node_ok "$NODE" || NODE="$SUPPORT/node/bin/node"
if ! node_ok "$NODE" && ! { get_node && node_ok "$NODE"; }; then
  answer=$(dialog "$(say "OpenCaptions couldn't download Node.js, a free program it needs. Check the internet connection and open OpenCaptions again, or install Node.js yourself (the LTS version)." 'OpenCaptions no pudo descargar Node.js, un programa gratuito que necesita. Revisá la conexión a internet y volvé a abrir OpenCaptions, o instalá Node.js vos (la versión LTS).')" "$(say Cancel Cancelar)" "$(say 'Get Node.js' 'Descargar Node.js')")
  [ -n "$answer" ] && [ "$answer" != "$(say Cancel Cancelar)" ] && open "https://nodejs.org/en/download"
  exit 1
fi

if [ ! -f "$SRC/package.json" ]; then
  osascript -e "display alert \"OpenCaptions\" message \"$(say 'This copy of OpenCaptions is incomplete. Download it again from github.com/carraroesteban/opencaptions.' 'Esta copia de OpenCaptions está incompleta. Descargala de nuevo de github.com/carraroesteban/opencaptions.')\" as critical" >/dev/null 2>&1
  exit 1
fi
VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$SRC/package.json" | head -1)"
DEST="$SUPPORT/app-$VERSION"
if [ ! -f "$DEST/.complete" ]; then
  rm -rf "$DEST"
  mkdir -p "$SUPPORT/data"
  ditto "$SRC" "$DEST" && touch "$DEST/.complete"
  # Older versions' files (not the data) are no longer needed.
  for old in "$SUPPORT"/app-*; do [ "$old" != "$DEST" ] && rm -rf "$old"; done
fi

# A Terminal window running the starter. The first time, macOS asks to let OpenCaptions control Terminal.
osascript - "$DEST" "$SUPPORT/data" "$(dirname "$NODE")" <<'APPLESCRIPT'
on run argv
  set appDir to item 1 of argv
  set dataDir to item 2 of argv
  set nodeBin to item 3 of argv
  set cmd to "export PATH=" & quoted form of nodeBin & ":\"$PATH\"; cd " & quoted form of appDir & " && clear && DATA_DIR=" & quoted form of dataDir & " LOCAL_DIR=" & quoted form of (dataDir & "/../local") & " GLOSSARY=" & quoted form of (dataDir & "/glossary.json") & " SCHEDULE=" & quoted form of (dataDir & "/schedule.json") & " node scripts/start.js; exit"
  tell application "Terminal"
    activate
    do script cmd
  end tell
end run
APPLESCRIPT
