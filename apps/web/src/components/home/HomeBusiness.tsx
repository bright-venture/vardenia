import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import { Link } from '../../i18n/routing'

export async function HomeBusiness() {
  const t = await getTranslations('homeFinish')
  const h = await getTranslations('home')
  const j = await getTranslations('journey')
  return (
    <section className="vd-home-business" aria-labelledby="vd-business-title">
      <figure data-vd-reveal>
        <Image
          src="/journey/deir-el-qamar.webp"
          alt={t('businessImageAlt')}
          fill
          sizes="(max-width:700px) 100vw, 40vw"
        />
        <figcaption>{t('businessPlace')}</figcaption>
      </figure>
      <div>
        <h2 id="vd-business-title" data-vd-reveal>
          {t('businessA')}
          <br />
          {t('businessB')}
        </h2>
        <p data-vd-reveal>{h('businessBody')}</p>
        <div className="vd-business-actions">
          <Link href="/add-your-business" className="vd-button vd-button-navy">
            {h('addBusiness')} ↗
          </Link>
          <Link href="/about" className="vd-text-link">
            {j('aboutLink')} ↗
          </Link>
        </div>
      </div>
    </section>
  )
}
