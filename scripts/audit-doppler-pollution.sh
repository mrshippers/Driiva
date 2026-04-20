#!/usr/bin/env bash
# Audit Doppler config for trailing \n / \r pollution WITHOUT ever printing values.
# Outputs: KEY | length | polluted(yes/no). Values never touch stdout or logs.
#
# Usage: bash scripts/audit-doppler-pollution.sh <project> <config>
#   example: bash scripts/audit-doppler-pollution.sh driiva prd

set -euo pipefail

PROJ="${1:?project required (e.g. driiva)}"
CONF="${2:?config required (e.g. prd)}"

# Skip Doppler + Vercel auto-injected vars — they are not user-managed.
SKIP_RE='^(DOPPLER_|VERCEL_|NX_|TURBO_)'

POLLUTED=0
CLEAN=0
FIXES=()

# List keys only (no values)
while IFS= read -r key; do
  [[ -z "$key" || "$key" == "NAME" || "$key" =~ $SKIP_RE ]] && continue

  # Fetch raw value, never echo it
  val="$(doppler secrets get "$key" --project "$PROJ" --config "$CONF" --plain 2>/dev/null || true)"

  len=${#val}
  # Check trailing literal \n or \r (2-char escape) or actual newline
  pollute="no"
  case "$val" in
    *'\n' | *'\r' | *$'\n' | *$'\r') pollute="yes" ;;
  esac

  if [[ "$pollute" == "yes" ]]; then
    POLLUTED=$((POLLUTED + 1))
    FIXES+=("$key")
    printf "⚠  %-40s len=%-4d polluted\n" "$key" "$len"
  else
    CLEAN=$((CLEAN + 1))
    printf "✓  %-40s len=%-4d clean\n" "$key" "$len"
  fi
done < <(doppler secrets --project "$PROJ" --config "$CONF" --only-names --json 2>/dev/null \
  | python3 -c "import json,sys; [print(k) for k in json.load(sys.stdin).keys()]")

echo
echo "Summary: $POLLUTED polluted, $CLEAN clean, project=$PROJ config=$CONF"
if [[ ${#FIXES[@]} -gt 0 ]]; then
  echo "Polluted keys (rotate in Doppler dashboard OR re-run with --fix):"
  printf '  - %s\n' "${FIXES[@]}"
fi
