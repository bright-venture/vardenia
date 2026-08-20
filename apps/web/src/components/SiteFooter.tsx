import { getTranslations } from 'next-intl/server'
import type { Locale } from '@vardenia/i18n'
import { Link } from '../i18n/routing'

/**
 * The site footer.
 *
 * This used to also list standing pages - About, Advertise, Privacy, Terms -
 * read from a Pages collection so that publishing one made it appear here on its
 * own. That collection is gone, and with it the mechanism for publishing a
 * privacy policy or terms of service without a deploy.
 *
 * That is worth remembering rather than rediscovering. Customer accounts and
 * card payments are the two things that make those documents legally required,
 * and both are on the roadmap. When they land, the pages have to come back in
 * some form - either the collection again, or routes written in code and linked
 * from here deliberately.
 *
 * The year is computed at render. These pages are statically generated, so a
 * hardcoded one would quietly go stale and a hydration-mismatched client clock
 * would be worse.
 */
export async function SiteFooter({ locale }: { locale: Locale }) {
  const t = await getTranslations('nav')
  const ar = locale === 'ar'

  return (
    <footer className="border-ink-100 mt-24 border-t">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <p className="font-display text-ink-900 text-lg">Vardenia</p>
            <p className="text-ink-500 mt-2 max-w-xs text-sm">
              {ar
                ? 'دليل لبنان للسياحة ونمط الحياة، منسّق وموثّق.'
                : "Lebanon's tourism and lifestyle guide, curated and verified."}
            </p>
          </div>

          <nav aria-label={ar ? 'تذييل' : 'Footer'} className="flex flex-col gap-2 text-sm">
            <Link href="/directory" className="text-ink-700 hover:text-ink-900 transition-colors">
              {t('directory')}
            </Link>
            <Link href="/magazine" className="text-ink-700 hover:text-ink-900 transition-colors">
              {t('magazine')}
            </Link>
            <Link
              href="/magazine/issues"
              className="text-ink-700 hover:text-ink-900 transition-colors"
            >
              {ar ? 'الأعداد' : 'Issues'}
            </Link>

            {/* The one place the partner dashboard is linked from.
                Not the header: a "partner login" link on every page a reader
                sees is an invitation to a credential-stuffing script, and the
                people who need it are told the address during onboarding and
                again in the email that sets their password. The footer is where
                a business owner looks, and it is quiet enough. */}
            <Link
              href="/partner"
              className="text-ink-500 hover:text-ink-900 mt-2 transition-colors"
            >
              {ar ? 'للشركاء' : 'For partners'}
            </Link>
          </nav>

          {/* The footer is where people look for these, and where a regulator
              expects to find them. They arrived with customer accounts: holding
              names, addresses and booking histories is what makes them
              required rather than merely good manners. */}
          <nav aria-label={ar ? 'قانوني' : 'Legal'} className="flex flex-col gap-2 text-sm">
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

        <p className="text-ink-300 mt-10 text-xs">
          &copy; {new Date().getFullYear()} Vardenia.{' '}
          {ar ? 'كل الحقوق محفوظة.' : 'All rights reserved.'}
        </p>
      </div>
    </footer>
  )
}
