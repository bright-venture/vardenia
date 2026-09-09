/**
 * One-off repair: set the empty `business` backlink on the codes for an import
 * batch. The import writes that backlink in a step after the listing is created,
 * and a batch imported while a migration was missing had that step fail, leaving
 * the codes active but pointing at no listing - so `/g/<code>` cannot resolve.
 *
 * The forward link (`business.qrCode`) is intact, so this reads the code id from
 * each listing and writes the listing id back onto the code. Idempotent: a code
 * that already has a business is left alone, so re-running is safe.
 *
 *   pnpm exec payload run backfill-code-business.ts [batch-name]
 */
import { getPayload } from 'payload'
import config from './src/payload.config'

const batch = process.argv[2] || 'import-2026-09-09'
const payload = await getPayload({ config })

const biz = await payload.find({
  collection: 'businesses',
  where: { importBatch: { equals: batch } },
  limit: 2000,
  depth: 0,
  overrideAccess: true,
})

let fixed = 0
let alreadyLinked = 0
let noCode = 0

for (const business of biz.docs) {
  const qrCode = (business as { qrCode?: number | string | null }).qrCode
  if (!qrCode) {
    noCode += 1
    continue
  }

  const code = await payload
    .findByID({ collection: 'qr-codes', id: qrCode, depth: 0, overrideAccess: true })
    .catch(() => null)

  if (!code) {
    noCode += 1
    continue
  }
  if ((code as { business?: unknown }).business) {
    alreadyLinked += 1
    continue
  }

  await payload.update({
    collection: 'qr-codes',
    id: qrCode,
    data: { business: business.id },
    depth: 0,
    overrideAccess: true,
  })
  fixed += 1
}

console.log(
  JSON.stringify({ batch, businesses: biz.docs.length, fixed, alreadyLinked, noCode }, null, 2),
)
process.exit(0)
