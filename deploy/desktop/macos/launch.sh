#!/bin/bash
# OpenCaptions.app (macOS). The app files travel inside the bundle (Contents/Resources/app). The first time each
# version runs, they're copied to ~/Library/Application Support/OpenCaptions/app-<version>: macOS may run a
# downloaded app from a read-only place ("App Translocation"), and the app needs to install its libraries. Settings,
# passwords and transcripts live in .../OpenCaptions/data, and the free local AI's downloads in .../OpenCaptions/local,
# so they survive updates. Then it runs OpenCaptions (scripts/start.js), which opens the dashboard. No Node.js on this
# Mac (or one without the October 2026 security fixes, see src/node-version.js): the official one is downloaded into
# .../OpenCaptions/node, and downloaded again when that copy is too old.
# Run by the app's program (OpenCaptions.swift), whose window shows what this prints; both are put in the app by
# scripts/package-desktop.js.
CONTENTS="$(cd "$(dirname "$0")/.." && pwd)" # OpenCaptions.app/Contents
SRC="$CONTENTS/Resources/app"
SUPPORT="$HOME/Library/Application Support/OpenCaptions"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

case "$(defaults read -g AppleLocale 2>/dev/null)" in es*) ES=1 ;; *) ES= ;; esac
say() { if [ -n "$ES" ]; then echo "$2"; else echo "$1"; fi; }
dialog() { osascript -e "button returned of (display dialog \"$1\" buttons {\"$2\", \"$3\"} default button 2 with title \"OpenCaptions\" with icon caution)" 2>/dev/null; }

# src/node-version.js prints "ok" for a Node.js with the security fixes OpenCaptions requires.
node_ok() { [ -x "$1" ] && [ "$("$1" "$SRC/src/node-version.js" 2>/dev/null)" = ok ]; }

# The official Node.js for this Mac's chip, checked against nodejs.org's published checksums.
# shortcut: always the newest Node 22 (22.23.4 or later has the fixes); move to the next LTS line before 22's end of life.
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

if [ ! -f "$SRC/package.json" ]; then
  osascript -e "display alert \"OpenCaptions\" message \"$(say 'This copy of OpenCaptions is incomplete. Download it again from github.com/carraroesteban/opencaptions.' 'Esta copia de OpenCaptions está incompleta. Descargala de nuevo de github.com/carraroesteban/opencaptions.')\" as critical" >/dev/null 2>&1
  exit 1
fi

# Node installed with nvm, fnm or volta is on the PATH only in the person's own shell: ask it too.
NODE="$(command -v node)"
node_ok "$NODE" || NODE="$("${SHELL:-/bin/zsh}" -ilc 'command -v node' 2>/dev/null | tail -1)"
node_ok "$NODE" || NODE="$SUPPORT/node/bin/node"
if ! node_ok "$NODE" && ! { get_node && node_ok "$NODE"; }; then
  answer=$(dialog "$(say "OpenCaptions couldn't download Node.js, a free program it needs. Check the internet connection and open OpenCaptions again, or install Node.js yourself (the LTS version)." 'OpenCaptions no pudo descargar Node.js, un programa gratuito que necesita. Revisá la conexión a internet y volvé a abrir OpenCaptions, o instalá Node.js vos (la versión LTS).')" "$(say Cancel Cancelar)" "$(say 'Get Node.js' 'Descargar Node.js')")
  [ -n "$answer" ] && [ "$answer" != "$(say Cancel Cancelar)" ] && open "https://nodejs.org/en/download"
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

# OpenCaptions itself. The app's window (OpenCaptions.swift) shows this output and stops it when the person quits.
cd "$DEST" || exit 1
export PATH="$(dirname "$NODE"):$PATH" DATA_DIR="$SUPPORT/data" LOCAL_DIR="$SUPPORT/local" GLOSSARY="$SUPPORT/data/glossary.json" SCHEDULE="$SUPPORT/data/schedule.json"
exec node scripts/start.js
