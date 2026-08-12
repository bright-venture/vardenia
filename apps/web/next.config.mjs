import { withPayload } from '@payloadcms/next/withPayload'
import createNextIntlPlugin from 'next-intl/plugin'
import { config as loadEnv } from 'dotenv'

// Next only reads .env from the app directory, but the canonical one lives at
// the monorepo root so web, seeds, and migrations all share a single file.
loadEnv({ path: '../../.env' })

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source, not build output - one less
  // build step, and the whole monorepo typechecks as a single graph.
  transpilePackages: [
    '@vardenia/core',
    '@vardenia/i18n',
    '@vardenia/tokens',
    '@vardenia/api-client',
  ],
  // Keep zod out of the server vendor-chunk split. Next's static-paths worker
  // loads route modules in a separate process and can reference a vendor chunk
  // webpack has not flushed yet, which fails dev with a phantom
  // "Cannot find module './vendor-chunks/zod@x.y.z.js'". Requiring it from
  // node_modules at runtime sidesteps the split entirely.
  serverExternalPackages: ['zod'],
  images: {
    formats: ['image/avif', 'image/webp'],
    // next/image refuses any host not listed here, so every storage backend we
    // might serve uploads from has to be named.
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co', pathname: '/storage/v1/object/public/**' },
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
    ],
  },
}

export default withPayload(withNextIntl(nextConfig))
