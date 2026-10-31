#!/usr/bin/env bash
# Registry consistency check. Exit codes: 0 pass, 1 defect, 2 environment failure.
set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "registry_check: node not found" >&2
  exit 2
fi
exec node "$here/registry_check.mjs" "$@"
