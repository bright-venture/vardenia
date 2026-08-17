/**
 * Removes exactly what the seed created, and nothing else.
 *
 * Driven by .seed-manifest.json, which the seed writes with the id of every
 * document it inserted. An earlier version matched on slug instead, and that is
 * wrong in a way that only appears on a database somebody has already worked in:
 * the seed found an existing `summer-2026` issue, skipped creating its own, and
 * reset would then have deleted a real issue because the slug matched.
 *
 * If the manifest is missing this refuses rather than guessing. Deleting nothing
 * is recoverable; deleting the wrong thing is not.
 *
 * The deletion order, and why the delete guards are respected rather than
 * bypassed, is documented in run.ts alongside resetSeed.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { getPayload } from 'payload'
import { assertSeedTarget } from './guard'
import { MANIFEST_PATH, clearManifest, loadManifest } from './manifest'
import { resetSeed } from './run'

loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') })

const { default: config } = await import('../payload.config')

async function main() {
  // Checked before the manifest, and before getPayload. The manifest guard
  // below assumes the ids in it refer to documents here; that assumption is
  // only true once the database has been confirmed as the right one.
  const target = assertSeedTarget(process.env, 'reset')
  console.log(`Resetting ${target}`)

  const manifest = await loadManifest()

  if (!manifest) {
    console.error(
      `No seed manifest at ${MANIFEST_PATH}.\n\n` +
        'Reset only removes documents the seed recorded creating. Without that\n' +
        'record it cannot tell fixture data apart from real work, and guessing by\n' +
        'slug would risk deleting a genuine issue or page.\n\n' +
        'If you seeded from a different machine or checkout, remove the fixtures\n' +
        'by hand in the admin.',
    )
    process.exit(1)
  }

  const payload = await getPayload({ config })

  await resetSeed(payload, manifest)
  await clearManifest()

  payload.logger.info('Reset complete.')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
