import { getTranslations } from 'next-intl/server'
import { Link } from '../i18n/routing'
import { hiddenPages, withoutHidden } from '../lib/hidden-pages'

/**
 * The site footer: the designer's compact footer, on every page since 11
 * November 2026 (Vardenia-Compact-Footer.html, option 1).
 *
 * Two rows on dark green. The wordmark and four links, then a hairline, the
 * copyright and the small print. It replaced "Where to next?", four columns of
 * links and the giant wordmark; the sections, issues and business pages are
 * all reachable from the header menus.
 *
 * Partner with us goes to the homepage enquiry form, where a business gets in
 * touch. The partner sign-in keeps a quiet link in the small print: it is not
 * in the header on purpose (a sign-in link on every page invites credential
 * stuffing), so this is where partners who were told about it look for it.
 * Credits stays there too.
 *
 * The motion switch that sat here went with the old footer, at the owner's
 * request. Motion still follows the reader's system setting
 * (journey/browser-state).
 *
 * The year is computed at render. These pages are statically generated, so a
 * hardcoded one would quietly go stale.
 */
export async function SiteFooter() {
  const t = await getTranslations()
  const hidden = await hiddenPages()

  // Without the pages an admin has hidden (lib/hidden-pages).
  const links = withoutHidden(
    [
      { href: '/about', label: t('footer.about') },
      { href: '/magazine', label: t('nav.magazine') },
      { href: '/#contact', label: t('footer.partnerWithUs') },
      { href: '/contact', label: t('footer.contact') },
    ],
    hidden,
  )

  return (
    <footer className="vd-footer">
      <div className="vd-footer-top">
        <Link href="/" className="vd-footer-brand">
          Vardenia
        </Link>
        {links.length > 0 ? (
          <nav className="vd-footer-nav" aria-label={t('footer.company')}>
            {links.map(({ href, label }) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
      <div className="vd-footer-bottom">
        <p>
          © {new Date().getFullYear()} Vardenia. {t('footer.rights')}
        </p>
        <nav className="vd-footer-legal" aria-label={t('footer.legal')}>
          <Link href="/legal/privacy">{t('footer.privacy')}</Link>
          <Link href="/legal/terms">{t('footer.terms')}</Link>
          <Link href="/credits">{t('journey.creditsShort')}</Link>
          <Link href="/partner">{t('footer.partnerSignIn')}</Link>
        </nav>
      </div>
    </footer>
  )
}
