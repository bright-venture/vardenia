/**
 * Throwaway: flip booking.enabled on one dev listing so the form can be
 * exercised over HTTP, then flip it back. NODE_ENV=production so Payload's
 * schema push stays off - this only touches a row.
 */
import path from 'node:path'
import { config as loadEnv } from 'dotenv'
import { getPayload } from 'payload'

loadEnv({ path: path.resolve('C:/Users/david/Desktop/Bright/vardenia/.env') })

const { default: config } = await import(
  './src/payload.config'
)

const slug = process.argv[2]
const enabled = process.argv[3] === 'on'

const payload = await getPayload({ config })

const found = await payload.find({
  collection: 'businesses',
  where: { slug: { equals: slug } },
  limit: 1,
  depth: 0,
  overrideAccess: true,
})

const doc = found.docs[0]
if (!doc) throw new Error(`no listing ${slug}`)

const updated = await payload.update({
  collection: 'businesses',
  id: doc.id,
  data: {
    booking: {
      ...(doc as { booking?: object }).booking,
      enabled,
      autoConfirm: false,
      capacity: 2,
      minPartySize: 1,
      maxPartySize: 8,
      leadTimeMinutes: 60,
      maxAdvanceDays: 180,
      minDurationMinutes: 60,
      maxDurationMinutes: 240,
    },
  },
  overrideAccess: true,
})

console.log(doc.id, slug, '->', JSON.stringify((updated as { booking?: object }).booking))
process.exit(0)
