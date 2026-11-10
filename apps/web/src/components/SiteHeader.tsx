import { MobileMenu } from './header/MobileMenu'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { ChevronDown, Heart } from 'lucide-react'
import { SECTIONS } from '@vardenia/core'
import type { Locale } from '@vardenia/i18n'
import { Link } from '../i18n/routing'
import { LinkArrow } from './LinkArrow'
import { LanguageSwitcher, LanguageSwitcherLinks } from './LanguageSwitcher'
import { AccountIconLink, AccountLink } from './AccountLink'
import { SavedNavLink } from './SavedNavLink'
import { HeaderBar } from './header/HeaderBar'
import { DropdownNav } from './header/DropdownNav'
import { DiscoveryMenu } from './header/DiscoveryMenu'
import { SEARCH_ICON } from './navIcons'
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
    whole: true,
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
        {/* Phone only: the account button beside the menu (home-finish.css). */}
        <AccountIconLink />
        <MobileMenu label={t('nav.menu')}>
          {/*
           * The phone menu, rebuilt on 10 November 2026 after the pattern the
           * editorial and luxury travel sites share: a full-screen sheet, the
           * search first, the places as large serif names with a line each, the
           * magazine and the company folded away until asked for, and the small
           * utilities (saved, account, language) together at the foot. It used
           * to be one long list of icon tiles, a different language from the
           * desktop panels.
           */}
          <nav aria-label={t('nav.directory')} className="vd-mobile-sheet">
            <Link href="/search" className="vd-mobile-search">
              <SEARCH_ICON aria-hidden className="size-4 shrink-0" strokeWidth={1.5} />
              <span>{t('home.searchPlaceholder')}</span>
            </Link>

            <section className="vd-mobile-group" aria-labelledby="vd-mobile-discover">
              <h2 id="vd-mobile-discover" className="vd-mobile-eyebrow">
                {t('nav.discover')}
              </h2>
              <ul className="vd-mobile-list">
                {SECTIONS.map((section) => (
                  <li key={section.path}>
                    <Link href={`/${section.path}`} className="vd-mobile-link">
                      <span>
                        <strong>{sectionName(section, locale)}</strong>
                        <span>{sectionSummary(section, locale)}</span>
                      </span>
                      <LinkArrow />
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/directory" className="vd-mobile-all">
                {t('home.wholeDirectory')} <LinkArrow />
              </Link>
            </section>

            <details className="vd-mobile-fold">
              <summary>
                {t('nav.magazine')}
                <ChevronDown aria-hidden className="vd-mobile-chevron" strokeWidth={1.5} />
              </summary>
              <ul className="vd-mobile-list">
                {[
                  ['/magazine', t('nav.magazine'), t('nav.magazineNote')],
                  ['/magazine/issues', t('footer.issues'), t('nav.issuesNote')],
                  ['/magazine/articles', t('footer.articles'), t('homeFinish.storiesBody')],
                ].map(([href, name, note]) => (
                  <li key={href}>
                    <Link href={href!} className="vd-mobile-link vd-mobile-link-small">
                      <span>
                        <strong>{name}</strong>
                        <span>{note}</span>
                      </span>
                      <LinkArrow />
                    </Link>
                  </li>
                ))}
              </ul>
            </details>

            {aboutItems.length > 0 ? (
              <details className="vd-mobile-fold">
                <summary>
                  {t('nav.about')}
                  <ChevronDown aria-hidden className="vd-mobile-chevron" strokeWidth={1.5} />
                </summary>
                <ul className="vd-mobile-list">
                  {aboutItems.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className="vd-mobile-link vd-mobile-link-small">
                        <span>
                          <strong>{item.name}</strong>
                          <span>{item.description}</span>
                        </span>
                        <LinkArrow />
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            {/* The utilities together at the foot. Saved is always listed: on a
                phone the menu is the way around, and a signed-out tap lands on
                the sign-in prompt. Every link is padded to a thumb's size. */}
            <div className="vd-mobile-foot">
              <Link href="/account/saved" className="vd-mobile-saved">
                <Heart aria-hidden className="size-4" strokeWidth={1.5} />
                {t('nav.saved')}
              </Link>
              <div className="vd-mobile-actions flex items-center justify-between gap-3 [&_a]:py-2.5">
                <AccountLink />
                {language}
              </div>
            </div>
          </nav>
        </MobileMenu>
      </div>
    </HeaderBar>
  )
}
