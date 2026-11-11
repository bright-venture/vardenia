import { CONTENT_PAGE_SLUGS, type ContentPageSlug } from './pages'

/**
 * The pages an admin can hide from the Settings page (globals/Settings, Pages
 * tab), and how to tell whether a link points at one.
 *
 * Kept free of Payload so the Settings global can import it (lib/hidden-pages
 * reads the setting through the Payload config, which imports Settings).
 *
 * Until 11 November 2026 only the six standing pages could be hidden. Now every
 * page the footer links to can be: the magazine's three, the six sections and
 * the directory. Partner sign in is the exception: hiding it takes the footer
 * link away but the page stays up, because partners sign in there.
 *
 * Sign in (the same afternoon) works the same way for readers: hiding it takes
 * the header's sign-in and account links away, on a computer and in the phone
 * menu, and the sign-in page stays up for anyone who has its address.
 *
 * Privacy, Terms and Credits (the same day) are footer links only too: hiding
 * one takes it out of the footer's small print, and the page stays up. Privacy
 * and Terms must stay reachable (the sign-up form links to both).
 */

/** The six sections' paths, as in @vardenia/core SECTIONS (a test keeps them in step). */
export const SECTION_PAGES = [
  'stay',
  'eat-and-drink',
  'experiences',
  'weddings',
  'lifestyle',
  'getting-around',
] as const

export const MAGAZINE_PAGES = ['magazine', 'magazine-issues', 'magazine-articles'] as const

/** Stored values. New ones are added to the database enum by a migration. */
export const HIDEABLE_PAGES = [
  ...CONTENT_PAGE_SLUGS,
  ...MAGAZINE_PAGES,
  ...SECTION_PAGES,
  'directory',
  'partner-sign-in',
  'sign-in',
  'privacy',
  'terms',
  'credits',
] as const

export type HideablePage =
  | ContentPageSlug
  | (typeof MAGAZINE_PAGES)[number]
  | (typeof SECTION_PAGES)[number]
  | 'directory'
  | 'partner-sign-in'
  | 'sign-in'
  | 'privacy'
  | 'terms'
  | 'credits'

/** Where each one lives. */
export const HIDEABLE_PATH: Record<HideablePage, string> = {
  about: '/about',
  contact: '/contact',
  faq: '/faq',
  'partner-with-us': '/partner-with-us',
  advertise: '/advertise',
  'add-your-business': '/add-your-business',
  magazine: '/magazine',
  'magazine-issues': '/magazine/issues',
  'magazine-articles': '/magazine/articles',
  stay: '/stay',
  'eat-and-drink': '/eat-and-drink',
  experiences: '/experiences',
  weddings: '/weddings',
  lifestyle: '/lifestyle',
  'getting-around': '/getting-around',
  directory: '/directory',
  'partner-sign-in': '/partner',
  'sign-in': '/account/login',
  privacy: '/legal/privacy',
  terms: '/legal/terms',
  credits: '/credits',
}

/**
 * Pages whose children go with them: hiding Issues hides each issue's page,
 * and Articles each article. The directory is deliberately not here: the
 * listings live under /directory/ and stay up when the index is hidden.
 */
const WITH_CHILDREN: readonly HideablePage[] = ['magazine-issues', 'magazine-articles']

/** How the admin names them. */
export const HIDEABLE_LABELS: Record<HideablePage, string> = {
  about: 'About',
  contact: 'Contact',
  faq: 'Questions',
  'partner-with-us': 'Partner with us',
  advertise: 'Advertise with us',
  'add-your-business': 'Add your business',
  magazine: 'Magazine',
  'magazine-issues': 'Magazine: Issues (and each issue)',
  'magazine-articles': 'Magazine: Articles (and each article)',
  stay: 'Section: Stay',
  'eat-and-drink': 'Section: Eat & Drink',
  experiences: 'Section: Experiences',
  weddings: 'Section: Weddings',
  lifestyle: 'Section: Lifestyle',
  'getting-around': 'Section: Getting Around',
  directory: 'Directory (its listings stay up)',
  'partner-sign-in': 'Partner sign in (footer link only)',
  'sign-in': 'Sign in (header link only)',
  privacy: 'Privacy (footer link only)',
  terms: 'Terms (footer link only)',
  credits: 'Credits (footer link only)',
}

/** Only real hideable pages, whatever was stored. */
export function cleanHiddenPages(value: unknown): HideablePage[] {
  if (!Array.isArray(value)) return []
  return value.filter((slug): slug is HideablePage =>
    (HIDEABLE_PAGES as readonly unknown[]).includes(slug),
  )
}

/** The path of a link, without its locale prefix, query or hash. */
function pathOf(href: string): string {
  const bare = href.split(/[?#]/)[0] || '/'
  const trimmed = bare.length > 1 ? bare.replace(/\/+$/, '') : bare
  // A locale prefix (/ar/magazine) is not part of the page.
  return trimmed.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/'
}

/** Whether a link leads to a hidden page. */
export function isHrefHidden(href: string, hidden: readonly HideablePage[]): boolean {
  if (hidden.length === 0) return false
  const path = pathOf(href)
  return hidden.some((page) => {
    const target = HIDEABLE_PATH[page]
    if (path === target) return true
    return WITH_CHILDREN.includes(page) && path.startsWith(`${target}/`)
  })
}

/** Links with every hidden page taken out, for menus and footers. */
export function withoutHidden<T extends { href: string }>(
  links: T[],
  hidden: readonly HideablePage[],
): T[] {
  return links.filter((link) => !isHrefHidden(link.href, hidden))
}
