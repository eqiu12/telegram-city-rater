#!/bin/sh
set -e

# Ensure env is loaded if .env is provided (compose will typically pass env)
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs) || true
fi

# Run DB migrations (no-op if none or already applied)
echo "Running migrations..."
node -r dotenv/config scripts/migrate.js || true

echo "Starting server..."
exec "$@"


