/**
 * Development seed, command line entry point.
 *
 * Before this, a fresh clone produced an admin user and an otherwise empty
 * site: no listing to open, no article to read, no scan to report on. Every
 * developer built their own throwaway data by hand, and the two things we most
 * want to test end to end - that the public API withholds the Commercial tab,
 * and that the scan report aggregates correctly - had nothing to run against.
 *
 * The work itself is in run.ts, so the integration tests can build the same
 * fixtures without shelling out to this script.
 *
 * Safe to re-run: every step skips what already exists. Never run against
 * production; guarded below. `pnpm seed:reset` removes exactly what this
 * creates and nothing else.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { getPayload } from 'payload'
import { emptyManifest, saveManifest } from './manifest'
import { runSeed } from './run'

// The canonical .env is at the monorepo root, not in apps/web. Load it before
// importing the Payload config, which reads process.env at module scope.
loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') })

const { default: config } = await import('../payload.config')

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database.')
  }

  const payload = await getPayload({ config })
  const manifest = emptyManifest()

  try {
    await runSeed(payload, manifest)
  } finally {
    // Written even if a step throws. A half-finished run still created rows,
    // and reset needs to know about them more than a successful run does.
    const file = await saveManifest(manifest)
    const total = Object.values(manifest.created).reduce((sum, ids) => sum + ids.length, 0)
    payload.logger.info(`Recorded ${total} created documents in ${file}`)
  }

  payload.logger.info('Seed complete. Remove it again with: pnpm seed:reset')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
