import { getTranslations } from 'next-intl/server'
import { Tier } from '../ui'

export async function HomeTrust() {
  const h = await getTranslations('home')
  const t = await getTranslations('homeFinish')
  const steps = h.raw('verifiedSteps') as { title: string; sub: string }[]
  return (
    <section className="vd-home-trust" aria-labelledby="vd-trust-title">
      <div>
        <h2 id="vd-trust-title" data-vd-reveal>
          {t('trustTitle')}
        </h2>
        <p data-vd-reveal>{h('verifiedNote')}</p>
        <div className="vd-trust-mark" data-ui>
          <Tier kind="verified" />
        </div>
      </div>
      <div className="vd-trust-answers">
        {steps.map((step, index) => (
          <details key={step.title} open={index === 0}>
            <summary>
              {step.title}
              <span aria-hidden>+</span>
            </summary>
            <p>{step.sub}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
