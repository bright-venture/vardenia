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

export default buildConfig({
  serverURL: process.env.NEXT_PUBLIC_SITE_URL,
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: ' - Vardenia',
    },
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
          collections: { media: true },
          bucket: process.env.S3_BUCKET ?? '',
          config: {
            region: process.env.S3_REGION ?? 'auto',
            endpoint: process.env.S3_ENDPOINT,
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
