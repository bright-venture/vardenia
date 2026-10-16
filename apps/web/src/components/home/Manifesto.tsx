import { getLocale, getTranslations } from 'next-intl/server'
import { KineticType } from './KineticType'

/** The original scroll-driven statement, before the printed-code chapter. */
export async function Manifesto() {
  const t = await getTranslations('home')
  const finish = await getTranslations('homeFinish')
  const locale = await getLocale()
  return (
    <section className="vd-manifesto" id="promise" aria-labelledby="vd-promise-title">
      <KineticType
        text={t('manifesto')}
        accent={t('manifestoAccent')}
        locale={locale}
        headingId="vd-promise-title"
      />
      <p>{finish('promiseBody')}</p>
    </section>
  )
}
