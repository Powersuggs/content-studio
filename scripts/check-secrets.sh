#!/usr/bin/env bash
# Run this before your first commit (and honestly, before every commit):
#   ./scripts/check-secrets.sh
#
# It does two things:
#   1. Confirms .env / .env.local are actually git-ignored, not just
#      listed in .gitignore (a file already tracked before the ignore
#      rule was added would still get committed -- this catches that).
#   2. Greps the STAGED diff (git diff --cached) for anything
#      secret-shaped: common key/token/password patterns, and the
#      specific prefixes Anthropic and Meta/Instagram tokens use.
#
# This is a heuristic safety net, not a substitute for actually reading
# your diff before committing.

set -euo pipefail

fail=0

echo "== Checking .env is git-ignored =="
for f in .env .env.local; do
  if [ -f "$f" ]; then
    if git check-ignore -q "$f"; then
      echo "  ok: $f is ignored"
    else
      echo "  FAIL: $f exists and is NOT ignored by git"
      fail=1
    fi
    if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
      echo "  FAIL: $f is already tracked by git (was committed before it was ignored)"
      echo "        run: git rm --cached $f"
      fail=1
    fi
  fi
done

echo
echo "== Scanning staged diff for secret-shaped strings =="
staged="$(git diff --cached)"

if [ -z "$staged" ]; then
  echo "  (nothing staged)"
else
  # Each pattern is deliberately broad -- false positives here just mean
  # a second look, false negatives mean a leaked key in the repo history.
  patterns=(
    'sk-ant-[A-Za-z0-9_-]{20,}'   # Anthropic API keys
    'EA[A-Za-z0-9]{50,}'          # Meta/Facebook long-lived access tokens
    'IGQ[A-Za-z0-9_-]{20,}'       # Instagram Graph API tokens
    '(?i)(api[_-]?key|secret|password|token)[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9_\-]{16,}'
    'postgres(ql)?://[^[:space:]]+:[^[:space:]@]+@'  # DB connection strings with an inline password
  )

  hit=0
  for pattern in "${patterns[@]}"; do
    if echo "$staged" | grep -EnP "$pattern" > /tmp/secret-hits.$$; then
      hit=1
      echo "  possible match for pattern: $pattern"
      sed 's/^/    /' /tmp/secret-hits.$$
    fi
    rm -f /tmp/secret-hits.$$
  done

  if [ "$hit" -eq 1 ]; then
    fail=1
  else
    echo "  no obvious matches"
  fi
fi

echo
if [ "$fail" -eq 1 ]; then
  echo "FAILED -- review the findings above before committing."
  exit 1
fi
echo "OK -- looks clean, but give the diff an actual read too."
