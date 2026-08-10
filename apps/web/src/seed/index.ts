/**
 * Development seed: creates the first admin user so `pnpm dev` lands on a
 * usable admin panel instead of a signup wall.
 *
 * Safe to re-run - it is a no-op once a user exists. Never run against
 * production; guarded below.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { getPayload } from 'payload'

// The canonical .env is at the monorepo root, not in apps/web. Load it before
// importing the Payload config, which reads process.env at module scope.
loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') })

const { default: config } = await import('../payload.config')

const EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@vardenia.local'
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!'

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database.')
  }

  const payload = await getPayload({ config })

  const existing = await payload.find({ collection: 'users', limit: 1, depth: 0 })
  if (existing.totalDocs > 0) {
    payload.logger.info('Users already exist - nothing to seed.')
    return
  }

  await payload.create({
    collection: 'users',
    data: {
      name: 'Vardenia Admin',
      email: EMAIL,
      password: PASSWORD,
      roles: ['admin'],
    },
  })

  payload.logger.info(`Seeded admin user: ${EMAIL}`)
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
