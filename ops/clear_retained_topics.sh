#!/usr/bin/env bash
#
# Clear retained MQTT messages under flow_monitors/ that belong to the old
# per-site-number layout (flow_monitors/<site_number>/...), while leaving
# the current layout (flow_monitors/prod/... and
# flow_monitors/data_channel_types/...) untouched.
#
# Usage:
#   ./clear_retained_topics.sh
#   ./clear_retained_topics.sh -h broker.host -p 1883 -u user -P pass
#   ./clear_retained_topics.sh --dry-run -h broker.host -u user -P pass
#
# Requires: mosquitto-clients (mosquitto_sub, mosquitto_pub)

set -euo pipefail

DRY_RUN=0
ARGS=()
for a in "$@"; do
  if [ "$a" = "--dry-run" ]; then
    DRY_RUN=1
  else
    ARGS+=("$a")
  fi
done

# Subtrees to keep - never touched, even if they'd otherwise match.
KEEP_PREFIXES=("flow_monitors/prod/" "flow_monitors/data_channel_types/")

echo "Scanning retained messages under: flow_monitors/#"
[ "$DRY_RUN" -eq 1 ] && echo "(dry run - nothing will be cleared)"

TMPFILE="$(mktemp)"
trap 'rm -f "$TMPFILE"' EXIT

if mosquitto_sub --help 2>&1 | grep -q -- '--retained-only'; then
  mosquitto_sub -t 'flow_monitors/#' -v --retained-only "${ARGS[@]}" > "$TMPFILE"
else
  # Fallback for older mosquitto_sub: collect for a fixed window then stop.
  timeout 5s mosquitto_sub -t 'flow_monitors/#' -v "${ARGS[@]}" > "$TMPFILE" || true
fi

if [ ! -s "$TMPFILE" ]; then
  echo "No retained messages found under flow_monitors/#"
  exit 0
fi

CLEAR_COUNT=0
KEEP_COUNT=0
while IFS= read -r line; do
  TOPIC="${line%% *}"
  [ -z "$TOPIC" ] && continue

  KEEP=0
  for prefix in "${KEEP_PREFIXES[@]}"; do
    if [[ "$TOPIC" == "$prefix"* ]]; then
      KEEP=1
      break
    fi
  done

  if [ "$KEEP" -eq 1 ]; then
    KEEP_COUNT=$((KEEP_COUNT + 1))
    continue
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "Would clear: $TOPIC"
  else
    echo "Clearing: $TOPIC"
    mosquitto_pub -t "$TOPIC" -n -r "${ARGS[@]}"
  fi
  CLEAR_COUNT=$((CLEAR_COUNT + 1))
done < "$TMPFILE"

echo "----"
echo "Cleared (or would clear): $CLEAR_COUNT"
echo "Kept (under prod/ or data_channel_types/): $KEEP_COUNT"
