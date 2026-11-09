import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'
import config from '../payload.config'
import { CONTENT_PAGE_SLUGS, type ContentPageSlug } from './pages'

/**
 * Standing pages an admin has hidden from the Settings page (globals/Settings,
 * Pages tab).
 *
 * Added on 9 November 2026 so a page that is not ready, such as Advertise with
 * its open lines, can be taken off the site without a deploy. A hidden page
 * answers "not found", and every link to it goes: the header menu, the footer,
 * the sitemap and the buttons at the foot of the other standing pages. Only the
 * six standing pages can be hidden; the legal pages always stay up.
 *
 * Kept for an hour and tagged, so the menu on every page does not cost a
 * database read. Saving the setting clears the tag and rebuilds the pages
 * (globals/Settings), so a change shows on the next view rather than an hour
 * later.
 */

export const HIDDEN_PAGES_TAG = 'hidden-pages'

/** Only real standing pages, whatever was stored. */
export function cleanHiddenPages(value: unknown): ContentPageSlug[] {
  if (!Array.isArray(value)) return []
  return value.filter((slug): slug is ContentPageSlug =>
    (CONTENT_PAGE_SLUGS as readonly unknown[]).includes(slug),
  )
}

async function read(): Promise<ContentPageSlug[]> {
  const payload = await getPayload({ config })
  const settings = (await payload.findGlobal({
    slug: 'settings',
    depth: 0,
    overrideAccess: true,
  })) as { hiddenPages?: unknown }
  return cleanHiddenPages(settings?.hiddenPages)
}

/**
 * The hidden standing pages. Empty when the setting cannot be read: a database
 * hiccup should not take pages down, and a page shown by mistake is the
 * smaller failure.
 */
export async function hiddenPages(): Promise<ContentPageSlug[]> {
  try {
    return await unstable_cache(read, ['hidden-pages'], {
      revalidate: 3600,
      tags: [HIDDEN_PAGES_TAG],
    })()
  } catch {
    return []
  }
}

/** Links with every hidden standing page taken out, for menus and footers. */
export function withoutHidden<T extends { href: string }>(
  links: T[],
  hidden: readonly ContentPageSlug[],
): T[] {
  const gone = new Set(hidden.map((slug) => `/${slug}`))
  return links.filter((link) => !gone.has(link.href))
}
