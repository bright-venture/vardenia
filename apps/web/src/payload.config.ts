import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { buildConfig, type Config } from 'payload'
import sharp from 'sharp'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { LOCALES, DEFAULT_LOCALE } from '@vardenia/i18n'

import { DB_SCHEMA, assertDatabaseInternals } from './lib/db'
import { Users } from './collections/Users'
import { BusinessUsers } from './collections/BusinessUsers'
import { Customers } from './collections/Customers'
import { Bookings } from './collections/Bookings'
import { Media } from './collections/Media'
import { Businesses } from './collections/Businesses'
import { Articles } from './collections/Articles'
import { Issues } from './collections/Issues'
import { QrCodes } from './collections/QrCodes'
import { ScanEvents } from './collections/ScanEvents'
import { allowedOrigins } from './lib/origins'

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
 * How many database connections this process may hold open.
 *
 * The number below used to be a flat 10, which was correct for the only shape
 * this app had ever run in: one long-lived server, where the pool is a shared
 * resource and 10 is the whole application's budget.
 *
 * On a serverless host it is not a budget, it is a multiplier. Every concurrent
 * function instance builds its own pool, so 10 is 10 *each* - twenty instances
 * on a busy evening is two hundred connections against a pooler that has a
 * ceiling of its own. Worse, the symptom is not slow pages: it is the pooler
 * refusing new clients, which surfaces as errors on requests that did nothing
 * wrong. A single instance never needs 10 anyway; it serves a request or two at
 * a time, and the pooler on the far end is already doing the multiplexing that
 * a large local pool would otherwise be for.
 *
 * The build is the exception and has to be carved back out. `next build`
 * prerenders every page in one process, which is exactly the burst the large
 * pool was tuned for, and it runs on the same serverless platform - so
 * detecting the platform alone would quietly halve build throughput.
 *
 * NEXT_PHASE is a Next internal rather than a documented contract. If it ever
 * changes, this falls back to the small pool during builds: slower, never
 * broken. That is the right direction for a guess to fail in.
 */
const isServerlessHost = Boolean(
  process.env.VERCEL ?? process.env.NETLIFY ?? process.env.AWS_LAMBDA_FUNCTION_NAME,
)
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build'
const POOL_MAX = isServerlessHost && !isBuildPhase ? 3 : 10

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

    // The scan report and the QR print sheet are file downloads served by
    // routes, not collections, so Payload has no nav entry to generate for
    // them. Without this they sit at URLs nobody would guess.
    components: {
      afterNavLinks: ['/components/admin/ReportsNavLink#ReportsNavLink'],

      // Payload's own dashboard lists the collections and nothing else. This
      // sits above it with the numbers and the work queue - see the component
      // for what earns a place there.
      beforeDashboard: ['/components/admin/DashboardOverview#DashboardOverview'],
    },
  },

  collections: [
    Businesses,
    QrCodes,
    Articles,
    Issues,
    Media,
    Users,
    BusinessUsers,
    Customers,
    Bookings,
    ScanEvents,
  ],

  /**
   * Fail at boot rather than at the first scan.
   *
   * The QR redirect and the scan report both run raw SQL through internals that
   * Payload does not treat as public API. If an upgrade moves them, the useful
   * moment to find out is now, on a machine with a developer in front of it, not
   * three weeks later when an advertiser asks why their number stopped moving.
   */
  onInit: assertDatabaseInternals,

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
     *  - `max` is 10 on a long-lived server. Raising it invites the pooler's own
     *    per-project ceiling, which fails less legibly than waiting does. On a
     *    serverless host it drops to 3, because there the number is per instance
     *    rather than per application - see POOL_MAX above.
     *  - `connectionTimeoutMillis` is the difference between a page that fails
     *    quickly and one that hangs until the reader leaves.
     *
     * None of this makes a genuinely broken link work, and a build rendering
     * every page at once will still contend. It removes the failures that were
     * ours rather than the network's.
     */
    pool: {
      connectionString: process.env.DATABASE_URL,
      max: POOL_MAX,
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
    //
    // The constant is shared with src/lib/db.ts, which runs raw SQL against this
    // schema and verifies the adapter still reports it. Changing the schema in
    // one place and not the other is the failure that check exists to prevent.
    schemaName: DB_SCHEMA,
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
  /**
   * How deep a single request may follow relationships.
   *
   * Payload's default ceiling is 10. Nothing here needs more than two: the
   * deepest real query is a listing with its hero image and gallery, which is
   * depth 2. Every level above that multiplies the work a single request can
   * ask for, and `?depth=10` was accepted from anonymous callers.
   *
   * Three rather than two, to leave one level of headroom for a screen that
   * does not exist yet without leaving room for amplification.
   */
  maxDepth: 3,

  graphQL: {
    // The public surface is REST; GraphQL stays available for internal tooling.
    disablePlaygroundInProduction: true,

    /**
     * GraphQL is the other way to ask for too much at once, and `maxDepth`
     * does not bound it - a query can nest fields far beyond what any screen
     * needs and cost the database dearly for one small-looking request.
     *
     * 1000 is generous for the queries this project actually issues, which are
     * a listing and its immediate relations. It exists to stop a query that
     * nobody would write by hand.
     */
    maxComplexity: 1000,
  },
  // Payload pins its own copy of sharp's types; the runtime object is the same.
  sharp: sharp as unknown as Config['sharp'],

  /**
   * Who may talk to this instance. Built in lib/origins - see the note there on
   * why exact matching makes a trailing slash a real outage.
   *
   * Both lists were previously the single value of NEXT_PUBLIC_SITE_URL, which
   * was right while the only account was a staff login on one hostname. It is
   * not right now: `www` was missing, and `csrf` decides which pages may make a
   * request carrying a customer's or an owner's auth cookie.
   *
   * The `.filter(Boolean)` that used to be here never removed anything - the
   * `??` before it guaranteed a value - which is the kind of guard that reads as
   * protection while doing nothing.
   */
  cors: allowedOrigins(),
  csrf: allowedOrigins(),
})
