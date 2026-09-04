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
   * The site's 404 is a global-not-found, and it has to be.
   *
   * There is no root `app/layout.tsx` here on purpose: `(frontend)` and
   * `(payload)` are two separate root layouts, because the public site and
   * Payload's admin panel cannot share a document shell. Next calls that
   * "multiple root layouts", and its consequence is that a plain
   * `app/not-found.tsx` has no single root layout to render inside - the build
   * fails with "not-found.tsx doesn't have a root layout".
   *
   * `global-not-found` is Next's answer to exactly that: one 404 that supplies
   * its own `<html>` and `<body>` and stands outside every layout - which is how
   * src/app/global-not-found.tsx was already written. The flag is still
   * experimental in 15.4, so it is named here rather than assumed.
   *
   * Without both halves - this flag and the `global-not-found` filename - the app
   * does not build. It only appeared to work on an older Next that tolerated a
   * self-contained root `not-found.tsx`; the versions Payload 3.87 supports
   * (>= 15.4.11) do not.
   */
  experimental: {
    globalNotFound: true,
  },

  /**
   * Stop announcing the stack on every response.
   *
   * The live site was returning `x-powered-by: Next.js, Payload`, which tells
   * anyone looking exactly what to look up advisories for and that a Payload
   * admin panel exists to find. It is not a vulnerability and removing it is
   * not a defence - `/admin` is discoverable anyway - but there is no reason to
   * put it in the response.
   */
  poweredByHeader: false,

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
    /**
     * WebP only, because AVIF is what the host actually serves anyway.
     *
     * This list said `['image/avif', 'image/webp']`, and the assumption behind
     * removing it was that AVIF encoding - roughly an order of magnitude more
     * CPU than WebP - was part of the Netlify compute bill. Measured against
     * production instead of assumed: four widths of the same photograph, all
     * requested with `Accept: image/avif,image/webp`, all came back
     * `content-type: image/webp`. Netlify's image optimiser does not produce
     * AVIF for this site, so nothing was ever encoding it.
     *
     * So this saves nothing. It stays because the config should not advertise a
     * format the host will not emit - the next person to read it would draw the
     * same wrong conclusion. This pointed at `minimumCacheTTL` below as the real
     * saving, which turned out to be inert here for the same reason: Netlify
     * serves these images, not Next. The saving lives in netlify.toml.
     */
    formats: ['image/webp'],

    /**
     * A year, against a Next default of sixty seconds.
     *
     * The default means every optimised variant expires a minute after it is
     * made, so the second view of any page re-runs the optimiser on every image
     * on it. For a site whose images almost never change, that is a function
     * invocation per image per minute of traffic, forever.
     *
     * A year is safe for uploads specifically because their URLs are immutable:
     * hooks/unguessableFilename gives every file 96 bits of randomness in its
     * name, so replacing an image produces a new URL rather than new bytes at
     * the old one.
     *
     * # It does nothing in production, and this used to claim otherwise
     *
     * `@netlify/plugin-nextjs` rewrites `/_next/image` onto Netlify's own Image
     * CDN, which applies its own policy and never reads this value. Measured on
     * the live site, months after this was set:
     *
     *   /_next/image    Cache-Control: max-age=14400      (4 hours)
     *   /_next/static   Cache-Control: max-age=31536000, immutable
     *
     * The `netlify-vary` header on those responses is what gives it away. So
     * the "real saving" claimed above was never collected, and the note that
     * said so has been corrected rather than deleted - believing a setting is
     * working is worse than knowing it is not.
     *
     * The header that actually applies is in netlify.toml. This stays because
     * it is still correct for `next start`, for local development and for any
     * host that does not replace the optimiser.
     */
    minimumCacheTTL: 60 * 60 * 24 * 365,

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
