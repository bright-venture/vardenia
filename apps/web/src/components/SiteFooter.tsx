import { MotionControl } from './editorial/MotionControl'
import { getTranslations } from 'next-intl/server'
import { SECTIONS } from '@vardenia/core'
import type { LucideIcon } from 'lucide-react'
import type { Locale } from '@vardenia/i18n'
import { Link } from '../i18n/routing'
import { sectionName } from '../lib/labels'
import {
  ABOUT_ICON,
  ADVERTISE_ICON,
  ARTICLE_ICON,
  BUSINESS_ICON,
  CONTACT_ICON,
  HELP_ICON,
  ISSUE_ICON,
  MAGAZINE_ICON,
  PARTNER_ICON,
  SECTION_ICONS,
  SIGN_IN_ICON,
} from './navIcons'

/**
 * The site footer.
 *
 * # The bug this fixes
 *
 * "For partners" used to hang off the bottom of the column holding Directory,
 * Magazine and Issues, separated by a margin. It was put there because the
 * footer was the right *place* for it, and then never given a heading - so it
 * read as an orphan under a list of editorial links it has nothing to do with.
 *
 * It belongs with the other business-facing links, and now sits at the end of
 * that column: somebody who has already been made a partner is looking for the
 * way in, and somebody who has not is looking at the three links above it.
 *
 * # Why the partner sign-in is here and not in the header
 *
 * A "partner login" link on every page a reader sees is an invitation to a
 * credential-stuffing script. The people who need it are told the address during
 * onboarding and again in the email that sets their password. The footer is
 * where a business owner looks, and it is quiet enough.
 *
 * # What used to be here
 *
 * These pages once came from a Pages collection, so publishing one made it
 * appear on its own. That collection is gone and the pages are routes in code
 * now - see lib/pages - which is why this list is written out rather than
 * fetched. The sections are still generated, so a category cannot exist in the
 * database with no way to reach it.
 *
 * The year is computed at render. These pages are statically generated, so a
 * hardcoded one would quietly go stale and a hydration-mismatched client clock
 * would be worse.
 */

interface FooterLink {
  href: string
  label: string
  icon: LucideIcon
}

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div className="vd-footer-column">
      <h3 className="text-ink-900 text-xs font-semibold uppercase tracking-wider">{title}</h3>
      <ul className="mt-4 space-y-2.5">
        {links.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="vd-footer-link text-ink-500 hover:text-ink-900 group inline-flex items-center gap-2 text-sm transition-colors"
            >
              {/* Decorative. The label is the content; an icon announced as
                  "bed double" next to the word "Stay" is noise. */}
              <Icon
                aria-hidden
                className="text-ink-300 group-hover:text-gold-700 size-3.5 shrink-0 transition-colors"
                strokeWidth={1.75}
              />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export async function SiteFooter({ locale }: { locale: Locale }) {
  const t = await getTranslations()
  const j = await getTranslations('journey')

  const discover: FooterLink[] = SECTIONS.map((section) => ({
    href: `/${section.path}`,
    label: sectionName(section, locale),
    icon: SECTION_ICONS[section.category],
  }))

  const read: FooterLink[] = [
    { href: '/magazine', label: t('nav.magazine'), icon: MAGAZINE_ICON },
    { href: '/magazine/issues', label: t('footer.issues'), icon: ISSUE_ICON },
    { href: '/magazine/articles', label: t('footer.articles'), icon: ARTICLE_ICON },
    { href: '/directory', label: t('footer.directory'), icon: BUSINESS_ICON },
  ]

  const company: FooterLink[] = [
    { href: '/about', label: t('footer.about'), icon: ABOUT_ICON },
    { href: '/faq', label: t('footer.questions'), icon: HELP_ICON },
    { href: '/contact', label: t('footer.contact'), icon: CONTACT_ICON },
  ]

  const business: FooterLink[] = [
    {
      href: '/add-your-business',
      label: t('footer.addBusiness'),
      icon: BUSINESS_ICON,
    },
    { href: '/partner-with-us', label: t('footer.partnerWithUs'), icon: PARTNER_ICON },
    { href: '/advertise', label: t('footer.advertise'), icon: ADVERTISE_ICON },
    // Last, and in this column rather than orphaned under the editorial links.
    { href: '/partner', label: t('footer.partnerSignIn'), icon: SIGN_IN_ICON },
  ]

  return (
    <footer className="vd-footer">
      <div className="vd-footer-top">
        <h2>
          {j('footerA')}
          <br />
          {j('footerB')}
        </h2>
        <Link className="vd-button vd-button-light" href="/directory">
          {j('footerLink')} ↗
        </Link>
      </div>
      <nav className="vd-footer-links" aria-label={t('footer.discover')}>
        <FooterColumn title={t('footer.discover')} links={discover} />
        <FooterColumn title={t('footer.read')} links={read} />
        <FooterColumn title={t('footer.company')} links={company} />
        <FooterColumn title={t('footer.business')} links={business} />
      </nav>
      <p className="vd-footer-word">Vardenia</p>
      <div className="vd-footer-bottom">
        <p>
          © {new Date().getFullYear()} Vardenia. {t('footer.rights')}
        </p>
        <nav aria-label={t('footer.legal')}>
          <Link href="/legal/privacy">{t('footer.privacy')}</Link>
          <Link href="/legal/terms">{t('footer.terms')}</Link>
          <Link href="/credits">{j('credits')}</Link>
        </nav>
      </div>
      <div className="vd-footer-settings">
        <MotionControl />
      </div>
    </footer>
  )
}
