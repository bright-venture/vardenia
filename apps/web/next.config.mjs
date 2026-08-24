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
   * Keep `.next-dev` in the ignore rules alongside `.next`.
   */
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
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
   * Security headers.
   *
   * An audit found none of these were set. Each closes a distinct hole, and
   * none of them is a substitute for the access rules - they are the layer that
   * still helps when something else has already gone wrong.
   *
   * `X-Frame-Options` stops the site being framed. Without it a copy of
   * /account or /partner can be loaded invisibly on somebody else's page and a
   * reader tricked into clicking a control they cannot see. That matters here
   * because both of those pages cancel bookings.
   *
   * `X-Content-Type-Options` stops a browser guessing that an upload is
   * something more interesting than the type we served it as. The Media
   * collection accepts files from staff, and a guessed type is how an image
   * becomes a script.
   *
   * `Referrer-Policy` stops the full URL leaking to another origin. A password
   * reset link is a URL with a token in it, and the default policy would send
   * it in the Referer header of any outbound click from that page.
   *
   * `Permissions-Policy` turns off hardware nothing here uses. The site never
   * asks for a camera, a microphone or a location, so nothing embedded in it
   * should be able to either.
   *
   * `Strict-Transport-Security` is ignored over plain http, so it costs nothing
   * locally and pins https in production. Two years, with subdomains, which is
   * what the preload lists ask for.
   *
   * No Content-Security-Policy yet, deliberately. Payload's admin panel needs
   * inline styles and eval, so a policy strict enough to be worth having would
   * have to exempt /admin, and one loose enough to cover both would not stop
   * much. That is a careful separate pass rather than a line added in an audit.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ]
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
