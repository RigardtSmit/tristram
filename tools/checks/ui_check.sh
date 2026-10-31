#!/usr/bin/env bash
# Adria's check: the UI builds, its mocks come from the frozen contract, and no mock reaches production.
# Usage: ui_check.sh <idea-name>   Exit codes: 0 pass, 1 defect, 2 environment failure.
set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "ui_check: node not found" >&2
  exit 2
fi
exec node --no-warnings "$here/ui_check.mjs" "$@"
