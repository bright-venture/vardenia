import { getTranslations, setRequestLocale } from 'next-intl/server'
import { requireLocale } from '../../../../lib/require-locale'
import { PhotographyCredits } from '../../../../components/journey/PhotographyCredits'
type Props = { params: Promise<{ locale: string }> }
export async function generateMetadata({ params }: Props) {
  const locale = requireLocale((await params).locale)
  const t = await getTranslations({ locale, namespace: 'journey' })
  return { title: t('credits') }
}
export default async function CreditsPage({ params }: Props) {
  const locale = requireLocale((await params).locale)
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'journey' })
  return (
    <main className="vd-credits-page">
      <h1>{t('credits')}</h1>
      <PhotographyCredits locale={locale} />
    </main>
  )
}
