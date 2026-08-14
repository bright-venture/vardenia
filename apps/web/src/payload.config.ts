import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { buildConfig, type Config } from 'payload'
import sharp from 'sharp'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { LOCALES, DEFAULT_LOCALE } from '@vardenia/i18n'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Businesses } from './collections/Businesses'
import { Articles } from './collections/Articles'
import { Issues } from './collections/Issues'
import { Pages } from './collections/Pages'
import { QrCodes } from './collections/QrCodes'
import { ScanEvents } from './collections/ScanEvents'

const dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Load the root .env here, not only in next.config.mjs.
 *
 * The `payload` CLI (generate:types, generate:importmap, migrate) imports this
 * file directly and never touches Next's config, so without this it sees an
 * empty environment. That is not harmless: `useS3` below would read as false,
 * the storage plugin would not register, and `generate:importmap` would write an
 * import map with the S3 upload handler missing - silently breaking admin
 * uploads the next time someone deployed. It happened once already.
 *
 * dotenv never overwrites a variable that is already set, so a real environment
 * (CI, production) still wins.
 */
loadEnv({ path: path.resolve(dirname, '../../../.env') })

const useS3 = process.env.MEDIA_STORAGE_ADAPTER === 's3'

/**
 * Public base URL for uploaded files, used to build the `<img src>`.
 *
 * A bucket is reachable at two different addresses. `S3_ENDPOINT` is the
 * authenticated S3 API the upload SDK talks to; handing that path to a browser
 * returns an error. Reads need the anonymous public path.
 *
 * For Supabase the public path is normally
 * `https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<file>`,
 * which this derives from the endpoint. Supabase has more than one host shape
 * in circulation (`<ref>.supabase.co` and `<ref>.storage.supabase.co`), so
 * `S3_PUBLIC_BASE_URL` overrides the derivation when the guess is wrong. Set it
 * and this whole block is skipped.
 */
const publicStorageBase = (() => {
  const override = (process.env.S3_PUBLIC_BASE_URL ?? '').replace(/\/$/, '')
  if (override) return override

  const endpoint = (process.env.S3_ENDPOINT ?? '').replace(/\/$/, '')
  const bucket = process.env.S3_BUCKET ?? ''
  if (!endpoint || !bucket) return ''

  const base = endpoint.endsWith('/storage/v1/s3')
    ? endpoint.replace(/\/storage\/v1\/s3$/, '/storage/v1/object/public')
    : endpoint
  return `${base}/${bucket}`
})()

export default buildConfig({
  serverURL: process.env.NEXT_PUBLIC_SITE_URL,
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: ' - Vardenia',
    },
    // Custom admin components are referenced by path, resolved from here. Pinned
    // to src so those paths read as '/components/...' rather than '/src/...'.
    importMap: { baseDir: dirname },
  },

  collections: [Businesses, QrCodes, Articles, Issues, Pages, Media, Users, ScanEvents],

  /**
   * Content localization. Arabic falls back to English so a half-translated
   * listing renders sensibly instead of showing empty fields - critical while
   * the editorial team catches up on translations.
   */
  localization: {
    locales: LOCALES.map((code) => ({
      code,
      label: code === 'ar' ? 'العربية' : 'English',
    })),
    defaultLocale: DEFAULT_LOCALE,
    fallback: true,
  },

  editor: lexicalEditor(),

  db: postgresAdapter({
    /**
     * Connection pool, tuned for a pooled Supabase database on the far end of an
     * international link.
     *
     * The defaults left us maximally exposed to two things, and both showed up
     * as the same symptom: an occasional "Failed query" on an ordinary page
     * navigation, with nothing wrong in the page itself.
     *
     * The observed failure, once the wrapper around it was unpicked, was
     * `timeout exceeded when trying to connect` - a query waiting for a pool
     * slot and not getting one. Not a broken network: contention, amplified by
     * the round trip to Frankfurt. Establishing a connection costs a few hundred
     * milliseconds from here, so anything that throws warm connections away makes
     * the next burst worse.
     *
     * Hence the settings:
     *
     *  - `idleTimeoutMillis` is deliberately long. A first attempt used 30s, on
     *    the theory that expiring our connections before the pooler expires its
     *    own avoids handing out a dead socket. That was the wrong trade here: it
     *    recycled connections mid-browsing-session and every rebuild cost another
     *    half second. Two minutes keeps a session warm while still recycling well
     *    inside pgbouncer's ten-minute idle default.
     *  - `keepAlive` holds the TCP connection open, so a burst of navigation
     *    reuses one socket instead of repeatedly re-establishing - and
     *    re-resolving DNS, which is where an intermittent lookup failure gets in.
     *  - `max` stays at 10. Raising it invites the pooler's own per-project
     *    ceiling, which fails less legibly than waiting does.
     *  - `connectionTimeoutMillis` is the difference between a page that fails
     *    quickly and one that hangs until the reader leaves.
     *
     * None of this makes a genuinely broken link work, and a build rendering
     * every page at once will still contend. It removes the failures that were
     * ours rather than the network's.
     */
    pool: {
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 120_000,
      connectionTimeoutMillis: 15_000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
    },
    // Migrations are explicit in production. Auto-push everywhere else - note
    // this is `!== 'production'`, not `=== 'development'`: scripts run through
    // tsx (seeds, one-off tasks) leave NODE_ENV unset and still need a schema.
    // Schema drift against a live advertiser database is not a risk worth taking.
    push: process.env.NODE_ENV !== 'production',

    // Keep every Payload table out of `public`.
    //
    // Supabase auto-generates a public REST API (PostgREST) over the `public`
    // schema. Pointed at our tables it would serve the Commercial tab -
    // contract values, tier, sales owner, internal notes - to anyone holding
    // the anon key, which is published in the browser. Disabling that API is
    // the documented fix, but it is a dashboard setting a future teammate can
    // switch back on without understanding why it was off.
    //
    // Living in a non-exposed schema means the leak cannot happen even then.
    // Access control belongs in Payload (see src/access), not in a checkbox.
    schemaName: 'payload',
  }),

  plugins: useS3
    ? [
        s3Storage({
          collections: {
            media: {
              // Serve images straight from storage rather than proxying every
              // request through this server. Media is public anyway (see the
              // Media collection's `read: anyone`), and a luxury title is mostly
              // large photographs: routing them through Node would put our own
              // server on the critical path for every image on every page.
              disablePayloadAccessControl: true,
              generateFileURL: ({ filename, prefix }) =>
                [publicStorageBase, prefix, filename].filter(Boolean).join('/'),
            },
          },
          bucket: process.env.S3_BUCKET ?? '',
          config: {
            region: process.env.S3_REGION ?? 'auto',
            endpoint: process.env.S3_ENDPOINT,
            // Supabase Storage addresses buckets by path, not by subdomain.
            // Without this the SDK builds `https://<bucket>.<host>/...` and
            // every upload fails to resolve.
            forcePathStyle: true,
            credentials: {
              accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
            },
          },
        }),
      ]
    : [],

  secret: process.env.PAYLOAD_SECRET ?? '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  graphQL: {
    // The public surface is REST; GraphQL stays available for internal tooling.
    disablePlaygroundInProduction: true,
  },
  // Payload pins its own copy of sharp's types; the runtime object is the same.
  sharp: sharp as unknown as Config['sharp'],

  cors: [process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'].filter(Boolean),
  csrf: [process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'].filter(Boolean),
})
