#!/usr/bin/env bash
# Farnham's check: tests run, every acceptance criterion has a test, every test traces to one.
# Usage: test_check.sh <idea-name>   Exit codes: 0 pass, 1 defect, 2 environment failure.
set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "test_check: node not found" >&2
  exit 2
fi
exec node --no-warnings "$here/test_check.mjs" "$@"
