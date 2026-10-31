#!/usr/bin/env bash
# Griswold's check: the API contract follows the API standard and the backend builds and passes its tests.
# Usage: api_check.sh <idea-name>   Exit codes: 0 pass, 1 defect, 2 environment failure.
set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "api_check: node not found" >&2
  exit 2
fi
exec node --no-warnings "$here/api_check.mjs" "$@"
