import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { amiri, fraunces, manrope, plexMono } from '../fonts'

/**
 * A third root layout, for the pre-launch splash alone.
 *
 * The app already has two root layouts - `(frontend)` for the public site and
 * `(payload)` for the admin panel - because they cannot share a document shell.
 * The splash cannot share either: it is reached by a middleware rewrite from any
 * URL, carries none of the site's chrome, and must stand up its own `<html>`.
 * A route group with its own root layout is Next's answer to exactly that, the
 * same shape `global-not-found` already uses.
 *
 * Only the three brand faces the splash actually sets type in are loaded here,
 * self-hosted by next/font, so the page looks like Vardenia without pulling the
 * whole ten-script font stack the localized site needs.
 */

const description =
  'Curated hotels, restaurants and experiences across Lebanon, in print and online.'

export const metadata: Metadata = {
  // Absolute base for the social image path below; the splash has no layout above
  // it to inherit one from. Falls back to localhost for a dev build.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'Vardenia',
  description,
  // The splash is served in place of every page while the gate is on, so it must
  // never be the thing a crawler indexes for the site.
  robots: { index: false, follow: false },
  /**
   * The pre-launch link is the one thing being shared right now, so it gets the
   * same branded card the rest of the site uses. noindex keeps it out of search
   * while still letting a chat or a post unfurl a proper preview.
   */
  openGraph: {
    type: 'website',
    siteName: 'Vardenia',
    title: 'Vardenia',
    description,
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Vardenia' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vardenia',
    description,
    images: ['/og-default.png'],
  },
}

export default function SplashLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${manrope.variable} ${amiri.variable} ${plexMono.variable}`}
    >
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  )
}
