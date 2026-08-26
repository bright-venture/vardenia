import type { NextConfig } from 'next'
import { withPayload } from '@payloadcms/next/withPayload'
import createNextIntlPlugin from 'next-intl/plugin'
import { config as loadEnv } from 'dotenv'
import { securityHeaders } from './src/lib/security-headers'

// Next only reads .env from the app directory, but the canonical one lives at
// the monorepo root so web, seeds, and migrations all share a single file.
loadEnv({ path: '../../.env' })

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * Separate build directories for dev and production.
   *
   * # The bug this fixes
   *
   * `next dev` and `next build` both wrote to `.next`, and they do not write
   * the same thing. Running a build while a dev server was up left the dev
   * server holding a manifest that pointed at chunks the build had replaced,
   * which surfaces as `Cannot find module './vendor-chunks/<something>.js'` and
   * a page that stops updating until the server is restarted.
   *
   * It looked like a flaky dev server. It was two processes writing to one
   * directory, and it happened every single time a build ran alongside a dev
   * session - which, during any stretch of verification work, is constantly.
   *
   * Keyed off NODE_ENV rather than a flag because Next sets it per command:
   * `dev` is development, `build` and `start` are production. So the two can
   * never collide again without anybody remembering to do anything.
   *
   * # The NETLIFY guard is not paranoia
   *
   * `netlify.toml` publishes `apps/web/.next`, and @netlify/plugin-nextjs reads
   * this config to find the build output. If anything on that side evaluated it
   * without NODE_ENV set to production, this would resolve to `.next-dev`, the
   * plugin would look in a directory the build never wrote, and the deploy
   * would fail or ship an empty site. Netlify sets NETLIFY=true on every build,
   * so naming it here makes the deployed path unconditional.
   *
   * Keep `.next-dev` in the ignore rules alongside `.next`.
   */
  distDir: process.env.NODE_ENV === 'development' && !process.env.NETLIFY ? '.next-dev' : '.next',
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
  /**
   * Security headers, including the Content-Security-Policy.
   *
   * The list and the reasoning live in src/lib/security-headers so they can be
   * unit tested. A policy is the kind of thing that is either subtly wrong or
   * silently permissive, and neither shows up in a build.
   *
   * This file is TypeScript rather than .mjs for that reason alone: .mjs cannot
   * import the .ts module, and duplicating a security policy in two places is
   * how the two stop agreeing.
   */
  async headers() {
    return securityHeaders()
  },
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
