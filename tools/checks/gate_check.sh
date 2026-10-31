#!/usr/bin/env bash
# Build gate: passes only when brief.md and ADR-001 are both ACCEPTED.
# Usage: gate_check.sh <idea-name>   Exit codes: 0 pass, 1 defect (gate closed), 2 environment failure.
set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "gate_check: node not found" >&2
  exit 2
fi
exec node "$here/../idea.mjs" gate "$@"
