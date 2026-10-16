'use client'
import Image from 'next/image'
import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useJourneyMotion } from '../journey/browser-state'
import { usePrintScan } from './usePrintScan'

interface Target {
  title: string
  image: { src: string; alt: string } | null
  href: string
  liveCode: boolean
}
/** A real QR and a page preview. Scroll never navigates or performs a booking. */
export function PrintConnection({ qr, target }: { qr: string; target: Target }) {
  const t = useTranslations('homeFinish')
  const original = useTranslations('home')
  const steps = original.raw('codeSteps') as { title: string; sub: string }[]
  const [motion] = useJourneyMotion()
  const root = useRef<HTMLElement>(null)
  const { phase, replay, reveal } = usePrintScan(root, motion)
  return (
    <section
      ref={root}
      className={`vd-print-connection vd-scan-process ${motion ? '' : 'vd-print-still'}`}
      data-scan-phase={phase}
      onFocusCapture={(event) => {
        if (!event.target.closest('.vd-scan-replay') && event.target.matches(':focus-visible'))
          reveal()
      }}
      id="paper-to-place"
      aria-labelledby="vd-print-title"
    >
      <div className="vd-print-sticky">
        <div className="vd-print-copy">
          <h2 id="vd-print-title" data-vd-reveal>
            {t('printTitle')}
          </h2>
          <p data-vd-reveal>{t('printBody')}</p>
          <ol className="vd-print-steps">
            {steps.map((step, index) => (
              <li
                key={step.title}
                aria-current={
                  (phase === 0 ? 0 : phase === 3 ? 2 : 1) === index ? 'step' : undefined
                }
              >
                <h3>{step.title}</h3>
                <p>{step.sub}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="vd-print-stage">
          <figure className="vd-print-card">
            <span className="vd-print-wordmark">Vardenia</span>
            <p>{target.liveCode ? t('printLive') : t('printExample')}</p>
            <div className="vd-print-symbol">
              <Image
                src={qr}
                alt={t('qrAlt', { title: target.title })}
                width={180}
                height={180}
                unoptimized
              />
            </div>
            <figcaption dir="auto">{target.title}</figcaption>
            <a className="vd-button vd-button-navy" href={target.href}>
              {t('scanAction')} <span aria-hidden>↗</span>
            </a>
          </figure>
          <div className="vd-print-phone" id="vd-print-page">
            <Image
              className="vd-phone-hardware"
              src="/journey/phone-mockup-v1.webp"
              alt=""
              width={866}
              height={1817}
              sizes="(max-width:480px) 280px, (max-width:1050px) 40vw, 25vw"
              aria-hidden
            />
            <div className="vd-phone-screen" data-ui="phone-preview">
              <div className="vd-phone-status" aria-hidden>
                <span>9:41</span>
                <span>▰</span>
              </div>
              <div className="vd-scan-camera-view" aria-hidden="true">
                <div className="vd-scan-camera-label">{t('cameraLabel')}</div>
                <div className="vd-scan-camera-paper">
                  <span>Vardenia</span>
                  <Image src={qr} alt="" width={180} height={180} unoptimized />
                  <span>{target.title}</span>
                </div>
                <div className="vd-scan-viewfinder">
                  <i />
                  <i />
                  <i />
                  <i />
                  <span />
                </div>
                <div className="vd-scan-detected">
                  <span className="vd-scan-check">
                    <svg
                      viewBox="0 0 24 24"
                      width="22"
                      height="22"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m5 12 4 4 10-10" />
                    </svg>
                  </span>
                  <span>
                    {t('scanFound')}
                    <small>{t('scanOpening')}</small>
                  </span>
                </div>
                <div className="vd-scan-camera-caption">
                  {phase === 0 ? t('scanAim') : phase === 1 ? t('scanReading') : t('scanFound')}
                </div>
                <div className="vd-scan-shutter">
                  <span />
                </div>
              </div>
              <div className="vd-scan-live-page" inert={phase !== 3} aria-hidden={phase !== 3}>
                <div className="vd-print-phone-top" aria-hidden>
                  Vardenia
                </div>
                {target.image ? (
                  <Image
                    data-vd-photo={target.liveCode || undefined}
                    src={target.image.src}
                    alt={target.image.alt}
                    width={420}
                    height={360}
                    sizes="(max-width:700px) 40vw, 25vw"
                  />
                ) : (
                  <div className="vd-print-phone-paper" aria-hidden>
                    Vardenia
                  </div>
                )}
                <div className="vd-print-phone-copy">
                  <p>{t('onlineLabel')}</p>
                  <h3 dir="auto">{target.title}</h3>
                  <a className="vd-text-link" href={target.href}>
                    {t('openPage')} <span aria-hidden>↗</span>
                  </a>
                </div>
              </div>
            </div>
            <Image
              className="vd-phone-camera"
              src="/journey/phone-mockup-v1.webp"
              alt=""
              width={866}
              height={1817}
              sizes="(max-width:480px) 280px, 25vw"
              aria-hidden
            />
          </div>
          <div className="vd-scan-actions">
            <p className="vd-print-hint">{t('printHint')}</p>
            {motion && (
              <button
                type="button"
                className="vd-text-link vd-scan-replay"
                onClick={(event) => {
                  replay()
                  root.current?.querySelector('#vd-print-page')?.scrollIntoView({
                    block: 'center',
                    behavior: event.detail > 0 ? 'smooth' : 'auto',
                  })
                }}
              >
                {t('scanReplay')} <span aria-hidden>↻</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
