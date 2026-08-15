import { getPayload, type Payload } from 'payload'
import config from '../payload.config'
import { emptyManifest, type Manifest } from '../seed/manifest'
import { runSeed, resetSeed } from '../seed/run'

/**
 * Shared setup for the integration suite.
 *
 * These need a real Postgres. In CI that is the PostGIS service already declared
 * in the workflow, created empty on every run and destroyed with the machine
 * afterwards - so nothing here ever touches a database holding real work.
 *
 * That last part is not a formality. The suite seeds and then deletes, and the
 * manifest keeps the deletion surgical, but a bug in teardown lands on whatever
 * database DATABASE_URL points at. Do not point this at Supabase.
 */

let cached: { payload: Payload; manifest: Manifest } | null = null

/**
 * Refuse to run against anything that is not a local, disposable database.
 *
 * A comment saying "do not point this at Supabase" is not a control. This suite
 * writes a few hundred rows and then deletes them, and a mistake in the
 * connection string is all it would take for that to happen to real data - which
 * has already gone wrong once in this project, when the seed touched a live QR
 * code it did not create.
 *
 * Local hosts only. Set INTEGRATION_ALLOW_REMOTE_DB=yes to override, which is
 * deliberately awkward to type by accident.
 */
function assertDisposableDatabase() {
  if (process.env.INTEGRATION_ALLOW_REMOTE_DB === 'yes') return

  const url = process.env.DATABASE_URL ?? ''
  if (!url) throw new Error('DATABASE_URL is not set. The integration suite needs a database.')

  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    throw new Error('DATABASE_URL is not a valid connection string.')
  }

  const local = ['localhost', '127.0.0.1', '::1', 'postgres', 'db']
  if (local.includes(host)) return

  throw new Error(
    `The integration suite refuses to run against ${host}.\n\n` +
      'It seeds and deletes hundreds of rows. That is safe on a throwaway\n' +
      'database (the CI service, or a local container) and is not safe on\n' +
      'anything holding real work.\n\n' +
      'Point DATABASE_URL at a local database, or set\n' +
      'INTEGRATION_ALLOW_REMOTE_DB=yes if you are certain.',
  )
}

export async function setupDatabase() {
  if (cached) return cached

  assertDisposableDatabase()

  const payload = await getPayload({ config })
  const manifest = await runSeed(payload, emptyManifest())

  cached = { payload, manifest }
  return cached
}

export async function teardownDatabase() {
  if (!cached) return
  await resetSeed(cached.payload, cached.manifest)
  cached = null
}

interface RestResponse {
  status: number
  body: Record<string, unknown>
}

/** `/api/businesses?limit=10` -> the slug segments Next would pass the handler. */
function slugFor(url: URL): string[] {
  return url.pathname
    .replace(/^\/api\//, '')
    .split('/')
    .filter(Boolean)
}

/**
 * Call a Payload REST route the way Next would.
 *
 * Deliberately not the local API. `payload.find({ overrideAccess: false })`
 * would exercise access control, but it skips the layer this suite exists to
 * check: the REST handler's own serialisation, which is what an anonymous
 * caller on the internet actually receives. Importing the route handler runs
 * that whole path with no network and no running server.
 */
export async function restGet(
  path: string,
  init: { headers?: Record<string, string> } = {},
): Promise<RestResponse> {
  const { REST_GET } = await import('@payloadcms/next/routes')
  const handler = REST_GET(config)

  const url = new URL(path, 'http://localhost:3000')
  const response = await handler(new Request(url, { headers: init.headers }), {
    params: Promise.resolve({ slug: slugFor(url) }),
  })

  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

export async function restPost(
  path: string,
  body: unknown,
  init: { headers?: Record<string, string> } = {},
): Promise<RestResponse> {
  const { REST_POST } = await import('@payloadcms/next/routes')
  const handler = REST_POST(config)

  const url = new URL(path, 'http://localhost:3000')
  const response = await handler(
    new Request(url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...init.headers },
    }),
    { params: Promise.resolve({ slug: slugFor(url) }) },
  )

  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

/** Log in as the staff fixture, so a request can be made as a real signed-in user. */
export async function staffToken(payload: Payload): Promise<string> {
  const email = process.env.SEED_STAFF_EMAIL ?? 'staff@vardenia.local'
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!'

  const result = await payload.login({ collection: 'users', data: { email, password } })

  if (!result.token) throw new Error('Could not log in as the staff fixture user')
  return result.token
}

/** Every Commercial tab field that must never reach an anonymous caller. */
export const PRIVATE_BUSINESS_FIELDS = [
  'contractStartsAt',
  'contractEndsAt',
  'salesOwner',
  'internalNotes',
] as const
