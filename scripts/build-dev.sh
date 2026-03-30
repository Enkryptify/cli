#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"
DEST="$HOME/.local/bin/ek-dev"

mkdir -p "$HOME/.local/bin"
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
  echo "⚠ ~/.local/bin is not on your PATH. Add this to your shell profile:"
  echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
fi

DEFINES=""
if [ -f "$ENV_FILE" ]; then
  while IFS='=' read -r key value || [[ -n "$key" ]]; do
    # Skip empty lines and comments
    [[ -z "$key" || "$key" == \#* ]] && continue
    # Strip surrounding quotes from value
    value="${value%\"}" ; value="${value#\"}"
    value="${value%\'}" ; value="${value#\'}"
    DEFINES="$DEFINES --define process.env.${key}='\"${value}\"'"
  done < "$ENV_FILE"
else
  echo "⚠ No .env file found at $ENV_FILE (building with defaults)"
fi

eval bun build "$PROJECT_DIR/src/cli.ts" --compile --outfile "$DEST" $DEFINES
echo "✓ Installed ek-dev → $DEST"
