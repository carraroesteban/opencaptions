#!/bin/bash
# Double-click to start OpenCaptions on a Mac. It opens the dashboard in your browser; keep this window open.
# The first time, macOS may say it can't verify the file: see "Start without the terminal" in README.md.
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  OpenCaptions needs Node.js, a free program. Opening its download page..."
  echo "  Install the LTS version, then double-click \"Start OpenCaptions\" again."
  echo
  open "https://nodejs.org/en/download"
  read -r -p "  Press Enter to close this window."
  exit 1
fi
node scripts/start.js "$@"
status=$?
[ $status -ne 0 ] && read -r -p "  Press Enter to close this window."
exit $status
