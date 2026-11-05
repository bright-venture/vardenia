import type { MetadataRoute } from 'next'
import { colors } from '@vardenia/tokens'

/**
 * What a phone shows when the site is added to the home screen: the V from the
 * logo on the ivory paper ground, and the name.
 *
 * The icons sit beside the browser ones (app/icon.svg, app/favicon.ico,
 * app/apple-icon.png), all drawn from the V in the brand logo file. The tiles
 * leave room around the V, because Android crops a home screen icon to its own
 * shape ("maskable").
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Vardenia',
    short_name: 'Vardenia',
    description: 'Discover Lebanon',
    start_url: '/',
    display: 'browser',
    background_color: colors.surface.base,
    theme_color: colors.surface.base,
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
