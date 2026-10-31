#!/usr/bin/env bash
# Wirt's check: migrations apply and roll back on a throwaway SQLite database; database standard holds.
# Usage: db_check.sh <idea-name>   Exit codes: 0 pass, 1 defect, 2 environment failure.
set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "db_check: node not found" >&2
  exit 2
fi
exec node --no-warnings "$here/db_check.mjs" "$@"
