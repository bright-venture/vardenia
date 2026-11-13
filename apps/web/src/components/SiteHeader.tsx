import { MobileMenu } from './header/MobileMenu'
import { HomepageLink } from './header/HomepageLink'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { ChevronDown, Heart } from 'lucide-react'
import { SECTIONS } from '@vardenia/core'
import type { Locale } from '@vardenia/i18n'
import { Link } from '../i18n/routing'
import { LinkArrow } from './LinkArrow'
import { LanguageSwitcher, LanguageSwitcherLinks } from './LanguageSwitcher'
import { AccountIconLink, AccountLink, AccountSheetLinks } from './AccountLink'
import { SavedNavLink } from './SavedNavLink'
import { SHOW_SAVING } from '../lib/feature-display'
import { HeaderBar } from './header/HeaderBar'
import { DropdownNav } from './header/DropdownNav'
import { DiscoveryMenu } from './header/DiscoveryMenu'
import { SEARCH_ICON } from './navIcons'
import { sectionName, sectionSummary } from '../lib/labels'
import { hiddenPages, withoutHidden } from '../lib/hidden-pages'
import { ISSUES_PAGE_PHOTO, MAGAZINE_PAGE_PHOTO, SECTION_PHOTOS } from '../lib/section-photos'
import {
  ABOUT_HERO,
  ABOUT_HERO_ALT,
  ADD_BUSINESS_PHOTO,
  ADD_BUSINESS_PHOTO_ALT,
} from './editorial/standingPagePhotos'

/** Shared, locale-aware navigation; native disclosures also work without JavaScript. */
export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations()
  // Pages an admin has hidden (lib/hidden-pages) are left out of the menus.
  const hidden = await hiddenPages()
  // The header's sign-in and account links, which Settings can hide.
  const showAccount = !hidden.includes('sign-in')
  const shown = (slug: (typeof hidden)[number]) => !hidden.includes(slug)

  // The six sections and the directory, without the ones an admin has hidden.
  const sectionItems = withoutHidden(
    SECTIONS.map((section) => ({
      href: `/${section.path}`,
      name: sectionName(section, locale),
      description: sectionSummary(section, locale),
      // The section's own photograph, as on its page (lib/section-photos).
      photo: SECTION_PHOTOS[section.path],
    })),
    hidden,
  )
  const directoryShown = shown('directory')
  const sectionMenu = (
    <DiscoveryMenu
      title={t('homeFinish.browseTitle')}
      body={t('homeFinish.browseBody')}
      plain
      footer={directoryShown ? { href: '/directory', label: t('home.wholeDirectory') } : undefined}
      items={sectionItems}
    />
  )

  /*
   * Magazine and About open the same large panel as Discover (10 November
   * 2026): a headline, a line of intro, the links in the display face with a
   * line each, and a photograph. About borrows the journey's destinations, as
   * Discover does; the magazine shows its own open spread.
   */
  const magazineSpread = {
    src: '/journey/all-lebanon-box.webp',
    alt: t('nav.magazineMenuPhotoAlt'),
  }
  const magazineItems = withoutHidden(
    [
      {
        href: '/magazine',
        name: t('nav.magazine'),
        description: t('nav.magazineNote'),
        // The same picture as the page it opens (lib/section-photos).
        photo: { src: MAGAZINE_PAGE_PHOTO.src, alt: t('nav.magazineMenuPhotoAlt') },
      },
      {
        href: '/magazine/issues',
        name: t('footer.issues'),
        description: t('nav.issuesNote'),
        photo: { src: ISSUES_PAGE_PHOTO.src, alt: ISSUES_PAGE_PHOTO.alt },
      },
      {
        href: '/magazine/articles',
        name: t('footer.articles'),
        description: t('homeFinish.storiesBody'),
        photo: magazineSpread,
      },
    ],
    hidden,
  )
  const magazineMenu = <DiscoveryMenu title={t('nav.magazineMenuTitle')} items={magazineItems} />
  // About and Add your business show their pages' own photographs; the others
  // a destination by index into components/journey/destinations.
  const aboutItems = [
    shown('about')
      ? {
          href: '/about',
          name: t('nav.aboutVardenia'),
          description: t('nav.aboutVardeniaNote'),
          // The About page's own header picture (editorial/standingPagePhotos).
          photo: { src: ABOUT_HERO.src, alt: ABOUT_HERO_ALT[locale] },
        }
      : null,
    shown('add-your-business')
      ? {
          href: '/add-your-business',
          name: t('home.addBusiness'),
          description: t('nav.addBusinessNote'),
          // The page's own photograph (editorial/standingPagePhotos).
          photo: { src: ADD_BUSINESS_PHOTO.src, alt: ADD_BUSINESS_PHOTO_ALT[locale] },
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
      items={aboutItems}
    />
  )

  const language = (
    <Suspense fallback={<LanguageSwitcherLinks current={locale} search="" />}>
      <LanguageSwitcher current={locale} />
    </Suspense>
  )
  const languageSheet = (
    <Suspense fallback={<LanguageSwitcherLinks current={locale} search="" variant="sheet" />}>
      <LanguageSwitcher current={locale} variant="sheet" />
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
            {/* Set exactly like the Discover, Magazine and About buttons beside it
                (header/DropdownNav), without the chevron. */}
            <HomepageLink
              label={t('nav.homepage')}
              className="vd-homepage-link text-ink-700 hover:text-ink-900 flex h-full items-center px-2 py-1.5 text-sm transition-colors"
            />
            {/* A menu whose every page is hidden goes too (lib/hidden-pages). */}
            {sectionItems.length > 0 ? (
              <DropdownNav label={t('nav.discover')} wide>
                {sectionMenu}
              </DropdownNav>
            ) : null}
            {magazineItems.length > 0 ? (
              <DropdownNav label={t('nav.magazine')} wide>
                {magazineMenu}
              </DropdownNav>
            ) : null}
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
          {SHOW_SAVING ? <SavedNavLink label={t('nav.saved')} /> : null}
          {/* Not while the admin has Sign in hidden (lib/hidden-pages). */}
          {showAccount ? (
            <span className="vd-account-link">
              <AccountLink />
            </span>
          ) : null}
          {language}
        </div>

        {/* Narrow: one disclosure holding the same links. Both navigations are
            in the markup and one is `display: none` at any width, which keeps it
            out of the accessibility tree as well as off the screen. */}
        {/* Phone only: the account button beside the menu (home-finish.css). */}
        {showAccount ? <AccountIconLink /> : null}
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
            <HomepageLink label={t('nav.homepage')} className="vd-mobile-homepage-link" />

            {sectionItems.length > 0 || directoryShown ? (
              <section
                className="vd-mobile-group vd-mobile-group-plain"
                aria-labelledby="vd-mobile-discover"
              >
                <h2 id="vd-mobile-discover" className="vd-mobile-eyebrow">
                  {t('nav.discover')}
                </h2>
                {sectionItems.length > 0 ? (
                  <ul className="vd-mobile-list">
                    {sectionItems.map((item) => (
                      <li key={item.href}>
                        <Link href={item.href} className="vd-mobile-link">
                          <span>
                            <strong>{item.name}</strong>
                            <span>{item.description}</span>
                          </span>
                          <LinkArrow />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {directoryShown ? (
                  <Link href="/directory" className="vd-mobile-all">
                    {t('home.wholeDirectory')} <LinkArrow />
                  </Link>
                ) : null}
              </section>
            ) : null}

            {magazineItems.length > 0 ? (
              <details className="vd-mobile-fold">
                <summary>
                  {t('nav.magazine')}
                  <ChevronDown aria-hidden className="vd-mobile-chevron" strokeWidth={1.5} />
                </summary>
                <ul className="vd-mobile-list">
                  {magazineItems.map((item) => (
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

            {/* The utilities together at the foot: Saved places and Language
                as matching full-width rows, then the account. Saved is always
                listed: on a phone the menu is the way around, and a signed-out
                tap lands on the sign-in prompt. */}
            <div className="vd-mobile-foot">
              {SHOW_SAVING ? (
                <Link href="/account/saved" className="vd-sheet-row">
                  <Heart aria-hidden className="size-[18px] shrink-0" strokeWidth={1.5} />
                  <span className="vd-sheet-row-label">{t('nav.saved')}</span>
                  <LinkArrow />
                </Link>
              ) : null}
              {languageSheet}
              {showAccount ? <AccountSheetLinks /> : null}
            </div>
          </nav>
        </MobileMenu>
      </div>
    </HeaderBar>
  )
}
