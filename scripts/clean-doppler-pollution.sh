#!/usr/bin/env bash
# Strip trailing \n / \r / real-newline pollution from Doppler secret values.
# Never prints secret values to stdout. Reads into a bash variable, strips in
# memory, writes back via `doppler secrets set`.
#
# Usage: bash scripts/clean-doppler-pollution.sh <project> <config>

set -euo pipefail

PROJ="${1:?project required}"
CONF="${2:?config required}"

SKIP_RE='^(DOPPLER_|VERCEL_|NX_|TURBO_)'
FIXED=0
SKIPPED=0

while IFS= read -r key; do
  [[ -z "$key" || "$key" =~ $SKIP_RE ]] && continue

  val="$(doppler secrets get "$key" --project "$PROJ" --config "$CONF" --plain 2>/dev/null || true)"
  [[ -z "$val" ]] && continue
  orig_len=${#val}

  # Strip trailing pollution up to 5 times in case of repeats
  for _ in 1 2 3 4 5; do
    val="${val%$'\n'}"
    val="${val%$'\r'}"
    val="${val%\\n}"
    val="${val%\\r}"
  done

  new_len=${#val}
  if [[ "$new_len" -eq "$orig_len" ]]; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Push cleaned value back. Redirect stdout/stderr to avoid echoing.
  doppler secrets set "$key=$val" --project "$PROJ" --config "$CONF" --silent --no-interactive >/dev/null 2>&1
  printf "✓ %-40s %d → %d\n" "$key" "$orig_len" "$new_len"
  FIXED=$((FIXED + 1))

  # Wipe from memory before next iteration
  unset val
done < <(doppler secrets --project "$PROJ" --config "$CONF" --only-names --json 2>/dev/null \
  | python3 -c "import json,sys; [print(k) for k in json.load(sys.stdin).keys()]")

echo
echo "Summary: $FIXED fixed, $SKIPPED already-clean, project=$PROJ config=$CONF"
echo "Doppler → Vercel sync should propagate within ~30s."
echo "Trigger Vercel redeploy (push a commit or 'vercel --prod') to rebuild with clean env."
