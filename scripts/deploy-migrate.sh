#!/usr/bin/env bash
#
# Apply pending Payload migrations to the production database on a Netlify
# production deploy, so the schema can never fall a step behind the code.
#
# This exists because it happened: a migration was committed but never applied
# to prod, and every write to the changed tables failed silently until someone
# ran migrate by hand. Wiring it into the deploy is what stops that recurring.
#
# Three things make it correct, and each has already bitten without it:
#
#   1. Production only. Preview and branch builds must never write to the
#      production database, so this is a no-op unless Netlify's CONTEXT is
#      "production".
#
#   2. The session pooler. Migrations need Supabase's session pooler (port 5432);
#      the app runs on the transaction pooler (6543), which fails on schema
#      changes with an error that does not explain itself. This swaps the port,
#      or uses MIGRATE_DATABASE_URL verbatim if you set one in the Netlify env
#      (the explicit, preferred option - the session pooler string from Supabase
#      > Connect).
#
#   3. No push. payload.config has `push: NODE_ENV !== 'production'`. NODE_ENV is
#      set to production here for the same reason generate:types does it in
#      netlify.toml: unset, initialising Payload would sync the schema by push
#      against the production database, which is exactly what migrations exist to
#      prevent.
#
# The prod database carries an old dev-push marker, so `payload migrate` prompts
# "data loss will occur" whenever a migration is pending; that warning is
# generic and `echo y` answers it. Migrations therefore apply automatically on
# deploy, so they must be reviewed like any other code - a destructive one would
# apply itself. Keep them additive, and snapshot before anything that is not.
set -euo pipefail

if [ "${CONTEXT:-}" != "production" ]; then
  echo "deploy-migrate: CONTEXT=${CONTEXT:-unset}, not a production deploy - skipping."
  exit 0
fi

if [ -z "${MIGRATE_DATABASE_URL:-}" ] && [ -z "${DATABASE_URL:-}" ]; then
  echo "deploy-migrate: neither MIGRATE_DATABASE_URL nor DATABASE_URL is set." >&2
  exit 1
fi

# Prefer an explicit session-pooler URL; otherwise derive it from DATABASE_URL
# by moving the transaction pooler port (6543) to the session pooler port (5432).
MIGRATE_URL="${MIGRATE_DATABASE_URL:-${DATABASE_URL/:6543/:5432}}"

echo "deploy-migrate: applying pending migrations to production via the session pooler..."
echo y | NODE_ENV=production DATABASE_URL="$MIGRATE_URL" pnpm --filter @vardenia/web migrate
echo "deploy-migrate: done."
