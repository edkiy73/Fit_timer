#!/usr/bin/env bash
# Runs every scenario file one after another (the production rate limit is shared) and prints a summary.
# Usage (from apps/feture, with a local preview running):
#   FE_ADMIN_KEY=… E2E_LANE=<lane> APP=http://localhost:<port> e2e/run-all.sh [area-or-path-filter]
# Files: e2e/scenarios/<area>/*.mjs plus any e2e/scenarios/*.mjs (helpers.mjs excepted), in a stable order.
set -u
cd "$(dirname "$0")/.." || exit 2
: "${FE_ADMIN_KEY:?FE_ADMIN_KEY is required}"; : "${E2E_LANE:?E2E_LANE (your lane) is required}"; : "${APP:?APP (local preview URL) is required}"
filter="${1:-}"
files=$(find e2e/scenarios -name '*.mjs' ! -name 'helpers.mjs' | sort)
mkdir -p e2e/out
summary=e2e/out/run-all-summary.txt; : > "$summary"
fail=0; total=0
for f in $files; do
  [[ -n "$filter" && "$f" != *"$filter"* ]] && continue
  total=$((total + 1))
  echo "=== $f"
  log="e2e/out/run-all-$(echo "$f" | tr '/' '_').log"
  node e2e/run.mjs "$f" 2>&1 | tee "$log"
  status=${PIPESTATUS[0]}
  line=$(grep -E '^[0-9]+/[0-9]+ passed' "$log" | tail -1)
  if [[ $status -eq 0 ]]; then echo "PASS  $f  ${line:-}" >> "$summary"
  else fail=$((fail + 1)); { echo "FAIL  $f  ${line:-(runner error)}"; grep -E '^FAIL ' "$log" | sed 's/^/        /'; } >> "$summary"; fi
done
echo; echo "──── summary ($E2E_LANE) ────"; cat "$summary"
echo "$((total - fail))/$total files passed"
exit $([[ $fail -eq 0 ]] && echo 0 || echo 1)
