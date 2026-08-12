import path from 'node:path'
import { fileURLToPath } from 'node:url'
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
import { Offers } from './collections/Offers'
import { Pages } from './collections/Pages'
import { QrCodes } from './collections/QrCodes'
import { ScanEvents } from './collections/ScanEvents'

const dirname = path.dirname(fileURLToPath(import.meta.url))

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

  collections: [Businesses, QrCodes, Offers, Articles, Issues, Pages, Media, Users, ScanEvents],

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
    pool: { connectionString: process.env.DATABASE_URL },
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
