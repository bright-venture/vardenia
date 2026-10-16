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
import {
  BUSINESS_ICON,
  CONTACT_ICON,
  HELP_ICON,
  MAGAZINE_ICON,
  SEARCH_ICON,
  SECTION_ICONS,
} from './navIcons'
import { sectionName, sectionSummary } from '../lib/labels'

/** Shared, locale-aware navigation; native disclosures also work without JavaScript. */
export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations()
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
      directoryLabel={t('home.wholeDirectory')}
      items={SECTIONS.map((section) => ({
        path: section.path,
        name: sectionName(section, locale),
        description: sectionSummary(section, locale),
        destination: categoryPhotos[section.path] ?? 0,
      }))}
    />
  )

  const aboutMenu = (
    <div className="grid w-[22rem] gap-1">
      <MenuLink
        href="/about"
        title={t('nav.aboutVardenia')}
        description={t('nav.aboutVardeniaNote')}
        icon={MAGAZINE_ICON}
      />
      <MenuLink
        href="/add-your-business"
        title={t('home.addBusiness')}
        description={t('nav.addBusinessNote')}
        icon={BUSINESS_ICON}
      />
      {/* Each with its line, like the two above, and its own icon: both were
          envelopes with no description, so the menu read as two copies of Contact. */}
      <MenuLink
        href="/faq"
        title={t('nav.questions')}
        description={t('nav.questionsNote')}
        icon={HELP_ICON}
      />
      <MenuLink
        href="/contact"
        title={t('nav.contact')}
        description={t('nav.contactNote')}
        icon={CONTACT_ICON}
      />
    </div>
  )
  const magazineMenu = (
    <div className="grid w-[22rem] gap-1">
      <MenuLink href="/magazine" title={t('nav.magazine')} icon={MAGAZINE_ICON} />
      <MenuLink href="/magazine/issues" title={t('footer.issues')} icon={MAGAZINE_ICON} />
      <MenuLink
        href="/magazine/articles"
        title={t('footer.articles')}
        description={t('homeFinish.storiesBody')}
        icon={MAGAZINE_ICON}
      />
    </div>
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
          <Link href="/" className="vd-brand">
            Vardenia
          </Link>

          <nav aria-label={t('nav.directory')} className="vd-desktop-nav">
            <DropdownNav label={t('nav.discover')} wide>
              {sectionMenu}
            </DropdownNav>
            <DropdownNav label={t('nav.magazine')}>{magazineMenu}</DropdownNav>
            <DropdownNav label={t('nav.about')}>{aboutMenu}</DropdownNav>
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
            <MenuLink href="/magazine/articles" title={t('footer.articles')} icon={MAGAZINE_ICON} />
            <MenuLink href="/search" title={t('nav.search')} icon={SEARCH_ICON} />
            {/* Always listed here as a destination: on a phone the menu is the
                way around, and a signed-out tap lands on the sign-in prompt. */}
            <MenuLink href="/account/saved" title={t('nav.saved')} icon={Heart} />
            <MenuLink
              href="/add-your-business"
              title={t('home.addBusiness')}
              icon={BUSINESS_ICON}
            />

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
