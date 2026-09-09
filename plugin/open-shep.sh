#!/bin/sh
set -eu
release='https://github.com/ArtMoreno/shep/releases'
case "${1:-}" in
  macos)
    if [ "${2:-}" = '--check' ]; then command -v open >/dev/null; exit; fi
    open -a Shep 2>/dev/null || open "$release"
    ;;
  linux)
    if command -v shep >/dev/null 2>&1; then
      if [ "${2:-}" = '--check' ]; then printf '%s\n' installed; exit; fi
      nohup shep >/dev/null 2>&1 </dev/null &
    else
      command -v xdg-open >/dev/null
      if [ "${2:-}" = '--check' ]; then printf '%s\n' downloads; exit; fi
      xdg-open "$release"
    fi
    ;;
  *) printf '%s\n' 'Expected macos or linux.' >&2; exit 2 ;;
esac
