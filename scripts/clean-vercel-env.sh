#!/usr/bin/env bash
# Strips trailing "\n" literal from every Vercel env var on the driiva project.
#
# Background: paste-pollution left every production env var with a 2-char "\n"
# escape glued to the end of its value, which broke Firebase Installations
# (INVALID_ARGUMENT), CORS matching, WebAuthn RP ID matching, etc.
#
# Usage: bash scripts/clean-vercel-env.sh <environment>
#   where <environment> is one of: production | preview | development
#
# Requires: logged-in `vercel` CLI pointing at prj_9gZV7nWkWvtts3C6Tjvab7sZ4EoL

set -euo pipefail

ENV="${1:-production}"
TMPFILE=".env.vercel.clean.$$"
trap 'rm -f "$TMPFILE"' EXIT

echo "Pulling $ENV env from Vercel..."
vercel env pull "$TMPFILE" --environment="$ENV" --yes >/dev/null

POLLUTED=0
CLEAN=0
FIXED=()

while IFS= read -r line; do
  [[ -z "$line" || "$line" =~ ^# ]] && continue
  key="${line%%=*}"
  raw="${line#*=}"
  # Strip surrounding double quotes
  [[ "$raw" == \"*\" ]] && raw="${raw:1:-1}"
  # Check for literal \n or \r escape at end
  if [[ "$raw" == *'\n' || "$raw" == *'\r' ]]; then
    clean="${raw%\\n}"
    clean="${clean%\\r}"
    echo "  ⚠ $key — stripping trailing escape (len $((${#raw})) → ${#clean})"
    # Remove + re-add
    vercel env rm "$key" "$ENV" --yes >/dev/null 2>&1 || true
    printf "%s" "$clean" | vercel env add "$key" "$ENV" >/dev/null 2>&1
    FIXED+=("$key")
    POLLUTED=$((POLLUTED + 1))
  else
    CLEAN=$((CLEAN + 1))
  fi
done < "$TMPFILE"

echo
echo "Result: $POLLUTED polluted, $CLEAN already clean"
if [[ ${#FIXED[@]} -gt 0 ]]; then
  echo "Fixed keys:"
  printf '  - %s\n' "${FIXED[@]}"
fi
echo
echo "Next: push any commit to main to trigger a fresh Vercel deploy with cleaned env."
