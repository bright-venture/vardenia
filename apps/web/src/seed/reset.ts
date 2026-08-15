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
 * Order matters, and not only for foreign keys. Two hooks deliberately refuse
 * deletions:
 *
 *  - protectPrintedCodes refuses to delete a code that has been scanned or
 *    assigned to an issue.
 *  - protectBusinessWithPrintedCode refuses to delete a listing that owns one.
 *
 * Both are doing their job and neither is bypassed. The scan history and the
 * issue assignment come off the codes first, which is exactly what a person
 * would have to do through the admin.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { getPayload, type Payload } from 'payload'
import {
  MANIFEST_PATH,
  clearManifest,
  idsFor,
  loadManifest,
  type ManifestCollection,
} from './manifest'

loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') })

// Only the Payload config has to wait for dotenv.
const { default: config } = await import('../payload.config')

/** Same boundary cast as the seed uses; see the note in index.ts. */
const asData = <T>(data: Record<string, unknown>): T => data as T

async function deleteAll(
  payload: Payload,
  collection: ManifestCollection,
  ids: (number | string)[],
) {
  let removed = 0

  for (const id of ids) {
    try {
      await payload.delete({ collection, id })
      removed++
    } catch (error) {
      // Already gone is fine. Anything else is worth seeing, because it usually
      // means one of the delete guards is refusing for a reason.
      const message = error instanceof Error ? error.message : String(error)
      if (!/not found/i.test(message)) {
        payload.logger.warn(`Could not delete ${collection} ${id}: ${message}`)
      }
    }
  }

  if (removed > 0) payload.logger.info(`Removed ${removed} from ${collection}`)
  return removed
}

async function reset() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to reset a production database.')
  }

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

  // 1. Scan events, before the codes they point at.
  await deleteAll(payload, 'scan-events', idsFor(manifest, 'scan-events'))

  // 2. Clear what makes a code count as committed, then delete it. Undoing the
  //    seed's own writes rather than defeating the guard.
  const codeIds = idsFor(manifest, 'qr-codes')
  for (const id of codeIds) {
    try {
      await payload.update({
        collection: 'qr-codes',
        id,
        data: asData({ scanCount: 0, issue: null }),
      })
    } catch {
      // Gone already, or never created. deleteAll reports anything real.
    }
  }
  await deleteAll(payload, 'qr-codes', codeIds)

  // 3. Documents that reference media, before the media itself.
  await deleteAll(payload, 'articles', idsFor(manifest, 'articles'))
  await deleteAll(payload, 'businesses', idsFor(manifest, 'businesses'))
  await deleteAll(payload, 'issues', idsFor(manifest, 'issues'))
  await deleteAll(payload, 'pages', idsFor(manifest, 'pages'))

  // 4. Media last. blockMediaInUse refuses anything still referenced, so a
  //    warning here means something above did not get removed.
  await deleteAll(payload, 'media', idsFor(manifest, 'media'))

  // 5. Only users the seed recorded, which is the staff fixture and never the
  //    bootstrap admin. See the note in index.ts: locking someone out of their
  //    own admin panel is not cleanup.
  await deleteAll(payload, 'users', idsFor(manifest, 'users'))

  await clearManifest()

  payload.logger.info('Reset complete.')
}

reset()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
