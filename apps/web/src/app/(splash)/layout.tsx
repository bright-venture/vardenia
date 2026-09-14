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

export const metadata: Metadata = {
  title: 'Vardenia',
  // The splash is served in place of every page while the gate is on, so it must
  // never be the thing a crawler indexes for the site.
  robots: { index: false, follow: false },
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
