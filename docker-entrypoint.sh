#!/bin/sh
set -e

# Ensure the database schema exists, then seed the initial admin user.
echo "[videoloop] Applying database schema..."
node node_modules/prisma/build/index.js db push --skip-generate

echo "[videoloop] Seeding initial data..."
node prisma/seed.mjs || echo "[videoloop] Seed step skipped/failed (continuing)."

echo "[videoloop] Starting server..."
exec "$@"
