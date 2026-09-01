import { getTranslations } from 'next-intl/server'
import { SECTIONS } from '@vardenia/core'
import type { LucideIcon } from 'lucide-react'
import type { Locale } from '@vardenia/i18n'
import { Link } from '../i18n/routing'
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
    <div>
      <h3 className="text-ink-900 text-xs font-semibold uppercase tracking-wider">{title}</h3>
      <ul className="mt-4 space-y-2.5">
        {links.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="text-ink-500 hover:text-ink-900 group inline-flex items-center gap-2 text-sm transition-colors"
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
  const t = await getTranslations('nav')
  const ar = locale === 'ar'

  const discover: FooterLink[] = SECTIONS.map((section) => ({
    href: `/${section.path}`,
    label: ar ? section.ar : section.en,
    icon: SECTION_ICONS[section.category],
  }))

  const read: FooterLink[] = [
    { href: '/magazine', label: t('magazine'), icon: MAGAZINE_ICON },
    { href: '/magazine/issues', label: ar ? 'الأعداد' : 'Issues', icon: ISSUE_ICON },
    { href: '/magazine/articles', label: ar ? 'مقالات' : 'Articles', icon: ARTICLE_ICON },
    { href: '/directory', label: ar ? 'الدليل' : 'Directory', icon: BUSINESS_ICON },
  ]

  const company: FooterLink[] = [
    { href: '/about', label: ar ? 'من نحن' : 'About', icon: ABOUT_ICON },
    { href: '/faq', label: ar ? 'أسئلة شائعة' : 'Questions', icon: HELP_ICON },
    { href: '/contact', label: ar ? 'اتصل بنا' : 'Contact', icon: CONTACT_ICON },
  ]

  const business: FooterLink[] = [
    {
      href: '/add-your-business',
      label: ar ? 'أضف عملك' : 'Add your business',
      icon: BUSINESS_ICON,
    },
    { href: '/partner-with-us', label: ar ? 'كن شريكاً' : 'Partner with us', icon: PARTNER_ICON },
    { href: '/advertise', label: ar ? 'أعلن معنا' : 'Advertise', icon: ADVERTISE_ICON },
    // Last, and in this column rather than orphaned under the editorial links.
    { href: '/partner', label: ar ? 'دخول الشركاء' : 'Partner sign in', icon: SIGN_IN_ICON },
  ]

  return (
    <footer className="border-ink-100 bg-surface-raised mt-24 border-t">
      <div className="mx-auto max-w-6xl px-6 pb-10 pt-16">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-4">
            <p className="font-display text-ink-900 text-xl">Vardenia</p>
            <p className="text-ink-500 mt-3 max-w-xs text-sm leading-relaxed">
              {ar
                ? 'دليل لبنان للسياحة ونمط الحياة، منسّق وموثّق.'
                : "Lebanon's tourism and lifestyle guide, curated and verified."}
            </p>
            {/* Social accounts go here when they exist. Left out rather than
                pointed at invented handles, for the same reason the contact
                address is a marked gap rather than a plausible mailbox. */}
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:col-span-8">
            <FooterColumn title={ar ? 'اكتشف' : 'Discover'} links={discover} />
            <FooterColumn title={ar ? 'اقرأ' : 'Read'} links={read} />
            <FooterColumn title={ar ? 'الشركة' : 'Company'} links={company} />
            <FooterColumn title={ar ? 'للأعمال' : 'For business'} links={business} />
          </div>
        </div>

        {/* Legal sits beside the copyright rather than in a column of its own.
            Two links do not make a category, and this is where a reader looks
            for them. */}
        <div className="border-ink-100 mt-16 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
          <p className="text-ink-500 text-xs">
            &copy; {new Date().getFullYear()} Vardenia.{' '}
            {ar ? 'كل الحقوق محفوظة.' : 'All rights reserved.'}
          </p>

          <nav aria-label={ar ? 'قانوني' : 'Legal'} className="flex items-center gap-5 text-xs">
            <Link
              href="/legal/privacy"
              className="text-ink-500 hover:text-ink-900 transition-colors"
            >
              {ar ? 'سياسة الخصوصية' : 'Privacy'}
            </Link>
            <Link href="/legal/terms" className="text-ink-500 hover:text-ink-900 transition-colors">
              {ar ? 'شروط الاستخدام' : 'Terms'}
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}
