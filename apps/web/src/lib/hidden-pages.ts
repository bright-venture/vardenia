import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'
import config from '../payload.config'
import { notFound } from 'next/navigation'
import { cleanHiddenPages, type HideablePage } from './hideable-pages'

export { cleanHiddenPages, isHrefHidden, withoutHidden } from './hideable-pages'
export type { HideablePage } from './hideable-pages'

/**
 * Standing pages an admin has hidden from the Settings page (globals/Settings,
 * Pages tab).
 *
 * Added on 9 November 2026 so a page that is not ready, such as Advertise with
 * its open lines, can be taken off the site without a deploy. A hidden page
 * answers "not found", and every link to it goes: the header menu, the footer,
 * the sitemap and the buttons at the foot of the other standing pages. Since 11
 * November 2026 the magazine's pages, the six sections and the directory can
 * be hidden too (lib/hideable-pages); the legal pages always stay up.
 *
 * Kept for an hour and tagged, so the menu on every page does not cost a
 * database read. Saving the setting clears the tag and rebuilds the pages
 * (globals/Settings), so a change shows on the next view rather than an hour
 * later.
 */

export const HIDDEN_PAGES_TAG = 'hidden-pages'

async function read(): Promise<HideablePage[]> {
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
export async function hiddenPages(): Promise<HideablePage[]> {
  try {
    return await unstable_cache(read, ['hidden-pages'], {
      revalidate: 3600,
      tags: [HIDDEN_PAGES_TAG],
    })()
  } catch {
    return []
  }
}

/**
 * For a page's route: answers "not found" when the admin has hidden it. Read
 * through the same cached list, so it costs no database read per view.
 */
export async function notFoundIfHidden(page: HideablePage): Promise<void> {
  if ((await hiddenPages()).includes(page)) notFound()
}
