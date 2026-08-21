import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { SECTIONS } from '@vardenia/core'
import type { Locale } from '@vardenia/i18n'
import { Link } from '../i18n/routing'
import { LanguageSwitcher, LanguageSwitcherLinks } from './LanguageSwitcher'
import { AccountLink } from './AccountLink'
import { HeaderBar } from './header/HeaderBar'
import { DropdownNav } from './header/DropdownNav'
import { MenuLink } from './header/MenuLink'
import {
  BUSINESS_ICON,
  CONTACT_ICON,
  MAGAZINE_ICON,
  SEARCH_ICON,
  SECTION_ICONS,
} from './header/icons'

/**
 * The site header.
 *
 * # Two menus rather than eleven links
 *
 * The previous version listed all seven sections plus magazine, search and
 * account in one row. That is eleven things competing at the top of every page,
 * it wrapped on anything narrower than a laptop, and seven bare nouns tell a
 * first-time reader nothing: "Lifestyle" and "Experiences" could be anything.
 *
 * The seven now sit behind **Discover**, each with the icon the taxonomy has
 * carried since it was written and a line saying what is actually in it. The
 * standing pages sit behind **About**. Both are generated from the same sources
 * as before, so a category or a content page still cannot exist without a way to
 * reach it.
 *
 * # Almost none of this is a client component
 *
 * The dropdowns open on hover and on `focus-within`, which is CSS. The mobile
 * menu is a `<details>` element. Only the scrolled state needs the browser, and
 * it is isolated in HeaderBar. So the header stays server-rendered and every
 * prerendered page stays prerendered - the thing that makes these pages 6ms
 * rather than 350ms.
 *
 * # Ordering
 *
 * Discover first because it is what the site is. Sign up is the only solid
 * control, because opening an account is the one thing here we ask a reader to
 * do rather than offer.
 */
export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations('nav')
  const ar = locale === 'ar'

  const sectionMenu = (
    <div className="grid w-[34rem] grid-cols-2 gap-1">
      {SECTIONS.map((section) => (
        <MenuLink
          key={section.path}
          href={`/${section.path}`}
          title={ar ? section.ar : section.en}
          description={ar ? section.descriptionAr : section.descriptionEn}
          icon={SECTION_ICONS[section.category]}
        />
      ))}

      {/* The odd one out in a seven-item grid, and useful there: it is the way
          to see everything at once when none of the seven is quite it. */}
      <MenuLink
        href="/directory"
        title={ar ? 'الدليل كامل' : 'The whole directory'}
        description={ar ? 'كل الأماكن في مكان واحد' : 'Every listing, filtered how you like'}
        icon={SEARCH_ICON}
      />
    </div>
  )

  const aboutMenu = (
    <div className="grid w-[22rem] gap-1">
      <MenuLink
        href="/about"
        title={ar ? 'من نحن' : 'About Vardenia'}
        description={ar ? 'قصتنا وكيف نعمل' : 'Who we are and how the directory is made'}
        icon={MAGAZINE_ICON}
      />
      <MenuLink
        href="/add-your-business"
        title={ar ? 'أضف عملك' : 'Add your business'}
        description={ar ? 'كن جزءاً من الدليل' : 'Get listed in print and online'}
        icon={BUSINESS_ICON}
      />
      <MenuLink href="/faq" title={ar ? 'أسئلة شائعة' : 'Questions'} icon={CONTACT_ICON} />
      <MenuLink href="/contact" title={ar ? 'اتصل بنا' : 'Contact'} icon={CONTACT_ICON} />
    </div>
  )

  const language = (
    <Suspense fallback={<LanguageSwitcherLinks current={locale} search="" />}>
      <LanguageSwitcher current={locale} />
    </Suspense>
  )

  return (
    <HeaderBar>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-1">
          <Link href="/" className="font-display text-ink-900 shrink-0 pe-3 text-xl tracking-tight">
            Vardenia
          </Link>

          <nav aria-label={t('directory')} className="hidden items-center gap-1 lg:flex">
            <DropdownNav label={ar ? 'اكتشف' : 'Discover'}>{sectionMenu}</DropdownNav>
            <Link
              href="/magazine"
              className="text-ink-700 hover:text-ink-900 rounded-md px-2 py-1.5 text-sm transition-colors"
            >
              {t('magazine')}
            </Link>
            <DropdownNav label={ar ? 'عن فاردينيا' : 'About'}>{aboutMenu}</DropdownNav>
          </nav>
        </div>

        <div className="hidden items-center gap-4 lg:flex">
          <Link
            href="/search"
            aria-label={ar ? 'بحث' : 'Search'}
            className="text-ink-700 hover:text-ink-900 rounded-md p-1.5 transition-colors"
          >
            <SEARCH_ICON className="size-4" strokeWidth={1.75} aria-hidden />
          </Link>
          <AccountLink locale={locale} />
          {language}
        </div>

        {/* Narrow: one disclosure holding the same links. Both navigations are
            in the markup and one is `display: none` at any width, which keeps it
            out of the accessibility tree as well as off the screen. */}
        <details className="relative lg:hidden">
          <summary
            className="text-ink-700 flex cursor-pointer list-none items-center gap-2 text-sm"
            aria-label={ar ? 'القائمة' : 'Menu'}
          >
            <span className="flex flex-col gap-[3px]" aria-hidden>
              <span className="bg-ink-700 block h-[1.5px] w-5" />
              <span className="bg-ink-700 block h-[1.5px] w-5" />
              <span className="bg-ink-700 block h-[1.5px] w-5" />
            </span>
            {ar ? 'القائمة' : 'Menu'}
          </summary>

          <nav
            aria-label={t('directory')}
            className="border-ink-100 bg-surface-base absolute end-0 z-50 mt-4 max-h-[80vh] w-[19rem] overflow-y-auto rounded-lg border p-2 shadow-xl"
          >
            {SECTIONS.map((section) => (
              <MenuLink
                key={section.path}
                href={`/${section.path}`}
                title={ar ? section.ar : section.en}
                icon={SECTION_ICONS[section.category]}
              />
            ))}

            <span className="border-ink-100 my-2 block border-t" />

            <MenuLink href="/magazine" title={t('magazine')} icon={MAGAZINE_ICON} />
            <MenuLink href="/search" title={ar ? 'بحث' : 'Search'} icon={SEARCH_ICON} />
            <MenuLink
              href="/add-your-business"
              title={ar ? 'أضف عملك' : 'Add your business'}
              icon={BUSINESS_ICON}
            />

            <span className="border-ink-100 my-2 block border-t" />

            {/* The account and language links are inline text elsewhere, which
                on a phone gives a 24px target for something people press with a
                thumb. `[&_a]` pads every anchor inside this row up to a size a
                thumb can actually hit without enlarging them on desktop, where
                they sit in a tight bar and a pointer is precise. */}
            <div className="flex items-center justify-between gap-3 p-2 [&_a]:px-2 [&_a]:py-2.5">
              <AccountLink locale={locale} />
              {language}
            </div>
          </nav>
        </details>
      </div>
    </HeaderBar>
  )
}
