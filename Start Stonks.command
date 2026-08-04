#!/bin/bash
#
# Double-click this file in Finder to start the app.
#
# It figures out what still needs doing — installing, building the database,
# opening the browser — and does it. Nothing to type. Closing the window that
# opens stops the app.

cd "$(dirname "$0")" || exit 1

# Node installed by the nodejs.org installer lands in /usr/local/bin, and
# Homebrew's is in /opt/homebrew/bin. Finder does not read your shell profile,
# so a double-click starts with a bare PATH and would not find either.
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

printf '\n  Stonks\n  ──────\n\n'

fail() {
  printf '\n  ✕  %s\n\n     %s\n\n' "$1" "$2"
  printf '  This window stays open so you can read it. Close it when done.\n\n'
  read -r _
  exit 1
}

if ! command -v node >/dev/null 2>&1; then
  open "https://nodejs.org"
  fail "Node is not installed on this Mac, and the app needs it to run." \
       "I opened nodejs.org in your browser. Download the macOS installer
     marked LTS — you want the file ending in .pkg, not .tar.gz. Run it,
     click through, then double-click this file again."
fi

MAJOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null)
if [ -z "$MAJOR" ] || [ "$MAJOR" -lt 20 ]; then
  open "https://nodejs.org"
  fail "Your Node is too old (version $MAJOR — the app needs 20 or newer)." \
       "I opened nodejs.org. Install the LTS version over the top of the old
     one, then double-click this file again."
fi

# Only runs the slow parts when they have not been done yet, so the second
# launch is instant.
if [ ! -d node_modules ] || [ ! -f .env.local ] || [ ! -f data/portfolio.db ]; then
  printf '  First run — setting things up. This takes a minute or two.\n\n'
  npm run setup || fail "Setup did not finish." \
    "The real error is in the text above. Copy the last 20 lines and send
     them to Claude — it will tell you what they mean."
fi

printf '\n  Starting. Your browser will open in a few seconds.\n'
printf '  Leave this window open while you use the app.\n'
printf '  To stop: close this window, or press Control-C.\n\n'

# The server needs a moment before the page exists; opening too early shows a
# connection error and looks like a failure.
( sleep 4; open "http://localhost:3000" ) &

npm run dev

printf '\n  Stopped. You can close this window.\n\n'
