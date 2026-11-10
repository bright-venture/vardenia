import { MobileMenu } from './header/MobileMenu'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { Heart } from 'lucide-react'
import { SECTIONS } from '@vardenia/core'
import type { Locale } from '@vardenia/i18n'
import { Link } from '../i18n/routing'
import { LanguageSwitcher, LanguageSwitcherLinks } from './LanguageSwitcher'
import { AccountLink } from './AccountLink'
import { SavedNavLink } from './SavedNavLink'
import { HeaderBar } from './header/HeaderBar'
import { DropdownNav } from './header/DropdownNav'
import { MenuLink } from './header/MenuLink'
import { DiscoveryMenu } from './header/DiscoveryMenu'
import { BUSINESS_ICON, MAGAZINE_ICON, SEARCH_ICON, SECTION_ICONS } from './navIcons'
import { sectionName, sectionSummary } from '../lib/labels'
import { hiddenPages } from '../lib/hidden-pages'

/** Shared, locale-aware navigation; native disclosures also work without JavaScript. */
export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations()
  // Pages an admin has hidden (lib/hidden-pages) are left out of the menus.
  const hidden = await hiddenPages()
  const shown = (slug: (typeof hidden)[number]) => !hidden.includes(slug)
  const categoryPhotos: Record<string, number> = {
    stay: 1,
    'eat-and-drink': 0,
    experiences: 3,
    weddings: 5,
    lifestyle: 2,
    'getting-around': 4,
  }

  const sectionMenu = (
    <DiscoveryMenu
      title={t('homeFinish.browseTitle')}
      body={t('homeFinish.browseBody')}
      arabic={locale === 'ar'}
      footer={{ href: '/directory', label: t('home.wholeDirectory') }}
      items={SECTIONS.map((section) => ({
        href: `/${section.path}`,
        name: sectionName(section, locale),
        description: sectionSummary(section, locale),
        destination: categoryPhotos[section.path] ?? 0,
      }))}
    />
  )

  /*
   * Magazine and About open the same large panel as Discover (10 November
   * 2026): a headline, a line of intro, the links in the display face with a
   * line each, and a photograph. About borrows the journey's destinations, as
   * Discover does; the magazine shows its own open spread.
   */
  const magazineSpread = {
    src: '/journey/vardenia-magazine-open-v1.webp',
    alt: 'The Vardenia magazine, open on a spread',
  }
  const magazineMenu = (
    <DiscoveryMenu
      title={t('nav.magazineMenuTitle')}
      body={t('nav.magazineMenuBody')}
      arabic={locale === 'ar'}
      items={[
        {
          href: '/magazine',
          name: t('nav.magazine'),
          description: t('nav.magazineNote'),
          photo: magazineSpread,
        },
        {
          href: '/magazine/issues',
          name: t('footer.issues'),
          description: t('nav.issuesNote'),
          photo: magazineSpread,
        },
        {
          href: '/magazine/articles',
          name: t('footer.articles'),
          description: t('homeFinish.storiesBody'),
          photo: magazineSpread,
        },
      ]}
    />
  )
  // Destinations by index into components/journey/destinations: Byblos,
  // Beirut, Deir el Qamar, Tyre.
  const aboutItems = [
    shown('about')
      ? {
          href: '/about',
          name: t('nav.aboutVardenia'),
          description: t('nav.aboutVardeniaNote'),
          destination: 0,
        }
      : null,
    shown('add-your-business')
      ? {
          href: '/add-your-business',
          name: t('home.addBusiness'),
          description: t('nav.addBusinessNote'),
          destination: 2,
        }
      : null,
    shown('faq')
      ? {
          href: '/faq',
          name: t('nav.questions'),
          description: t('nav.questionsNote'),
          destination: 5,
        }
      : null,
    shown('contact')
      ? {
          href: '/contact',
          name: t('nav.contact'),
          description: t('nav.contactNote'),
          destination: 4,
        }
      : null,
  ].filter((item) => item !== null)
  const aboutMenu = (
    <DiscoveryMenu
      title={t('nav.aboutMenuTitle')}
      body={t('nav.aboutMenuBody')}
      arabic={locale === 'ar'}
      items={aboutItems}
    />
  )

  const language = (
    <Suspense fallback={<LanguageSwitcherLinks current={locale} search="" />}>
      <LanguageSwitcher current={locale} />
    </Suspense>
  )

  return (
    <HeaderBar>
      <div className="vd-header-inner">
        <div className="contents">
          {/* No prefetch: on the home page it fetched the page already open, a
              second copy of its data in the middle of the first load. */}
          <Link href="/" prefetch={false} className="vd-brand">
            Vardenia
          </Link>

          <nav
            aria-label={t('nav.directory')}
            className="vd-desktop-nav items-stretch self-stretch"
          >
            <DropdownNav label={t('nav.discover')} wide>
              {sectionMenu}
            </DropdownNav>
            <DropdownNav label={t('nav.magazine')} wide>
              {magazineMenu}
            </DropdownNav>
            {aboutItems.length > 0 ? (
              <DropdownNav label={t('nav.about')} wide>
                {aboutMenu}
              </DropdownNav>
            ) : null}
          </nav>
        </div>

        <div className="vd-header-tools">
          <Link
            href="/search"
            aria-label={t('nav.search')}
            className="text-ink-700 hover:text-ink-900 p-1.5 transition-colors"
          >
            <SEARCH_ICON className="size-4" strokeWidth={1.75} aria-hidden />
          </Link>
          {/* Shown only to a signed-in reader; see SavedNavLink. */}
          <SavedNavLink label={t('nav.saved')} />
          <span className="vd-account-link">
            <AccountLink />
          </span>
          {language}
        </div>

        {/* Narrow: one disclosure holding the same links. Both navigations are
            in the markup and one is `display: none` at any width, which keeps it
            out of the accessibility tree as well as off the screen. */}
        <MobileMenu label={t('nav.menu')}>
          <nav
            aria-label={t('nav.directory')}
            className="border-ink-100 bg-surface-base absolute end-0 z-50 mt-4 max-h-[80vh] w-[19rem] overflow-y-auto border p-2 shadow-xl"
          >
            <div className="vd-mobile-discovery-heading">
              <h2>{t('homeFinish.browseTitle')}</h2>
              <p>{t('homeFinish.browseBody')}</p>
            </div>
            {SECTIONS.map((section) => (
              <MenuLink
                key={section.path}
                href={`/${section.path}`}
                title={sectionName(section, locale)}
                description={sectionSummary(section, locale)}
                icon={SECTION_ICONS[section.category]}
              />
            ))}
            <MenuLink href="/directory" title={t('home.wholeDirectory')} icon={SEARCH_ICON} />

            <span className="border-ink-100 my-2 block border-t" />

            <MenuLink href="/magazine" title={t('nav.magazine')} icon={MAGAZINE_ICON} />
            <MenuLink href="/magazine/issues" title={t('footer.issues')} icon={MAGAZINE_ICON} />
            <MenuLink href="/magazine/articles" title={t('footer.articles')} icon={MAGAZINE_ICON} />
            <MenuLink href="/search" title={t('nav.search')} icon={SEARCH_ICON} />
            {/* Always listed here as a destination: on a phone the menu is the
                way around, and a signed-out tap lands on the sign-in prompt. */}
            <MenuLink href="/account/saved" title={t('nav.saved')} icon={Heart} />
            {shown('add-your-business') ? (
              <MenuLink
                href="/add-your-business"
                title={t('home.addBusiness')}
                icon={BUSINESS_ICON}
              />
            ) : null}

            <span className="border-ink-100 my-2 block border-t" />

            {/* The account and language links are inline text elsewhere, which
                on a phone gives a 24px target for something people press with a
                thumb. `[&_a]` pads every anchor inside this row up to a size a
                thumb can actually hit without enlarging them on desktop, where
                they sit in a tight bar and a pointer is precise. */}
            <div className="vd-mobile-actions flex items-center justify-between gap-3 p-2 [&_a]:px-2 [&_a]:py-2.5">
              <AccountLink />
              {language}
            </div>
          </nav>
        </MobileMenu>
      </div>
    </HeaderBar>
  )
}
