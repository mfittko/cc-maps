#!/bin/bash

INPUT=$(cat)
FILE=$(printf '%s' "$INPUT" | jq -r '.toolInput.filePath // .tool_input.file_path // empty' 2>/dev/null)

if [[ -z "$FILE" ]]; then
  exit 0
fi

PROTECTED_PATTERNS=(
  ".env"
  "Secrets.swift"
  "GoogleService-Info.plist"
  ".git/"
)

for pattern in "${PROTECTED_PATTERNS[@]}"; do
  if [[ "$FILE" == *"$pattern"* ]]; then
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Protected file blocked: %s"}}\n' "$FILE"
    exit 0
  fi
done

exit 0