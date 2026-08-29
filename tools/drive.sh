#!/usr/bin/env bash
# Click BrickLife by visible label. agent-browser reassigns refs on every
# snapshot and occasionally returns an empty one, so resolve-then-click with a
# short retry immediately before each interaction.
set -uo pipefail
export AGENT_BROWSER_SESSION="${AGENT_BROWSER_SESSION:-bricklife-bb4260a47f7c}"
SHOT_DIR="${SHOT_DIR:-/private/tmp/claude-501/-Users-bartek-Documents-GitHub-BRICKEDLIFE/8e1bca4e-02b8-4ca5-bd0a-b76da1868bb7/scratchpad}"

snap() {
  local out i
  for i in 1 2 3 4; do
    out=$(agent-browser snapshot -i -c 2>&1)
    [ -n "$out" ] && { printf '%s\n' "$out"; return 0; }
    perl -e 'select(undef,undef,undef,0.3)'
  done
  return 1
}
ref() { snap | grep -i -- "$1" | grep -v '\[level=' | sed -n 's/.*\[ref=\(e[0-9]*\)\].*/@\1/p' | tail -1; }
tap() {
  local r i
  for i in 1 2 3; do
    r=$(ref "$1")
    [ -n "$r" ] && { agent-browser click "$r" >/dev/null 2>&1 && { echo "  tap '$1' ($r)"; return 0; }; }
    perl -e 'select(undef,undef,undef,0.4)'
  done
  echo "  !! could not tap '$1'"; return 1
}
typeinto() { local r; r=$(ref "$1"); [ -n "$r" ] && agent-browser fill "$r" "$2" >/dev/null 2>&1 && echo "  fill '$2'"; }
shot() { agent-browser screenshot "$SHOT_DIR/$1" >/dev/null 2>&1 && echo "  shot $1"; }
pause() { perl -e "select(undef,undef,undef,$1)"; }
