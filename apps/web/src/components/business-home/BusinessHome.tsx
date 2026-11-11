import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import type { Locale } from '@vardenia/i18n'
import { findIssues } from '../../lib/issues'
import { CONTACT } from '../../lib/contact'
import { BusinessCategories, CategoryProvider } from './BusinessCategories'
import { BusinessReader } from './BusinessReader'
import { EnquiryForm } from './EnquiryForm'

/**
 * Vardenia for Business: the homepage since 11 November 2026.
 *
 * Built from the designer's package (index.html, style.css, reference-theme.css)
 * and its copy, in the site's own header, footer, reader and languages. It
 * speaks to businesses: what the magazine is, the planned regional editions,
 * the All Lebanon preview, and an enquiry that opens an email draft (nothing is
 * stored). The journey homepage it replaced is components/home/JourneyHome.
 *
 * No prices, dates or terms: the designer's brief invents none, and prices
 * never go on the website.
 */
export async function BusinessHome({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'businessHome' })
  const issues = await findIssues(locale)
  // The newest issue that carries a PDF is the preview.
  const issue = issues.docs.find((doc) => {
    const pdf = doc.digitalEdition
    return pdf && typeof pdf === 'object' && pdf.url && pdf.mimeType === 'application/pdf'
  })
  const pdf = issue && typeof issue.digitalEdition === 'object' ? issue.digitalEdition : null

  const categories = (['Hotels', 'Restaurants', 'Destinations', 'Experiences'] as const).map(
    (key) => ({
      key,
      label: t(`category${key}`),
      body: t(`category${key}Body`),
      link: t(`category${key}Link`),
    }),
  )

  return (
    <main className="vd-biz" id="main-content">
      <CategoryProvider initial="Hotels">
        <section className="vd-biz-hero" aria-labelledby="biz-hero-title">
          <div className="vd-biz-hero-copy">
            <h1 id="biz-hero-title">
              {t('heroA')}
              <br /> {t.rich('heroLine', { em: (chunks) => <em>{chunks}</em> })}
            </h1>
            <p className="vd-biz-lead">{t('heroLead')}</p>
            <div className="vd-biz-actions">
              <a className="vd-biz-button" href="#contact">
                {t('becomePartner')} <span aria-hidden="true">↗</span>
              </a>
              <a className="vd-biz-link" href="#magazine-viewer">
                {t('readMagazine')}
              </a>
            </div>
            <p className="vd-biz-hero-note">
              {t('heroNoteA')}
              <br /> {t('heroNoteB')}
            </p>
          </div>
          <figure className="vd-biz-hero-art">
            <Image
              src="/business/hero-magazines.webp"
              width={1536}
              height={1024}
              alt={t('heroAlt')}
              sizes="(max-width:700px) 100vw, 50vw"
              priority
            />
            <figcaption>{t('heroCaption')}</figcaption>
          </figure>
        </section>

        <div className="vd-biz-themes" aria-label={t('themesLabel')}>
          <span>{t('themeCulture')}</span>
          <span>{t('themeHospitality')}</span>
          <span>{t('themeFood')}</span>
          <span>{t('themeGetaways')}</span>
          <span>{t('themeDiscovery')}</span>
        </div>

        <section className="vd-biz-section vd-biz-axis vd-biz-about" aria-labelledby="biz-about">
          <div>
            <h2 id="biz-about" data-vd-reveal>
              {t('aboutA')}
              <br /> {t('aboutB')}
            </h2>
          </div>
          <div>
            <p className="vd-biz-statement" data-vd-reveal>
              {t('aboutStatement')}
            </p>
            <p>{t('aboutBody')}</p>
            <div className="vd-biz-pair">
              <article>
                <h3 data-vd-reveal>{t('aboutLocalsTitle')}</h3>
                <p>{t('aboutLocalsBody')}</p>
              </article>
              <article>
                <h3 data-vd-reveal>{t('aboutStayTitle')}</h3>
                <p>{t('aboutStayBody')}</p>
              </article>
            </div>
            <a className="vd-biz-link" href="#contact">
              {t('talkToTeam')}
            </a>
          </div>
        </section>

        <section className="vd-biz-section vd-biz-axis vd-biz-dark" aria-labelledby="biz-regions">
          <div>
            <h2 id="biz-regions" data-vd-reveal>
              {t('regionsA')}
              <br /> {t('regionsB')}
            </h2>
            <p className="vd-biz-regions-body">{t('regionsBody')}</p>
          </div>
          <div className="vd-biz-columns">
            <article>
              <h3 data-vd-reveal>{t('advertisingTitle')}</h3>
              <p>{t('advertisingBody')}</p>
            </article>
            <article>
              <h3 data-vd-reveal>{t('visibilityTitle')}</h3>
              <p>{t('visibilityBody')}</p>
            </article>
            <article>
              <h3 data-vd-reveal>{t('digitalTitle')}</h3>
              <p>{t('digitalBody')}</p>
            </article>
          </div>
        </section>

        <section
          className="vd-biz-section vd-biz-reader"
          id="magazine-viewer"
          aria-labelledby="biz-reader"
        >
          <div className="vd-biz-top">
            <h2 id="biz-reader" data-vd-reveal>
              {t('readerTitle')}
            </h2>
            <div>
              <p>{t('readerBody')}</p>
              {pdf?.url ? (
                <a className="vd-biz-link" href={pdf.url} target="_blank" rel="noopener noreferrer">
                  {t('openPdf')} <span aria-hidden="true">↗</span>
                </a>
              ) : null}
            </div>
          </div>
          {issue && pdf?.url ? (
            <BusinessReader
              src={`/read/issue/${encodeURIComponent(issue.slug ?? '')}`}
              originalSrc={pdf.url}
              title={issue.title}
              heading={[issue.title, issue.season].filter(Boolean).join(', ')}
              locale={locale}
              copy={{
                coverAlt: t('coverAlt'),
                invitation: t('readerInvitation'),
                open: t('openMagazine'),
                hintA: t('readerHintA'),
                hintB: t('readerHintB'),
                ready: t('readerReady'),
              }}
            />
          ) : null}
        </section>

        <section className="vd-biz-section vd-biz-audience" aria-labelledby="biz-business">
          <div className="vd-biz-top">
            <h2 id="biz-business" data-vd-reveal>
              {t('businessA')}
              <br /> {t('businessB')}
            </h2>
            <p>{t('businessBody')}</p>
          </div>
          <div className="vd-biz-audience-grid">
            <Image
              src="/business/beirut-clocktower.webp"
              width={1400}
              height={945}
              alt={t('beirutAlt')}
              sizes="(max-width:700px) 100vw, 40vw"
              data-vd-reveal
            />
            <BusinessCategories label={t('categoriesLabel')} categories={categories} />
          </div>
        </section>

        <section className="vd-biz-section vd-biz-beyond" aria-labelledby="biz-beyond">
          <div className="vd-biz-axis">
            <div className="vd-biz-beyond-art">
              <Image
                src="/business/open-spread.webp"
                width={1467}
                height={957}
                alt={t('spreadAlt')}
                sizes="(max-width:700px) 100vw, 45vw"
              />
              <a className="vd-biz-link" href="#magazine-viewer">
                {t('browsePreview')}
              </a>
            </div>
            <div>
              <h2 id="biz-beyond" data-vd-reveal>
                {t('beyondA')}
                <br /> {t('beyondB')}
              </h2>
              <p className="vd-biz-beyond-statement">{t('beyondStatement')}</p>
              <p>{t('beyondBody')}</p>
              <ol className="vd-biz-steps">
                <li>
                  <h3 data-vd-reveal>{t('stepPrintTitle')}</h3>
                  <p>{t('stepPrintBody')}</p>
                </li>
                <li>
                  <h3 data-vd-reveal>{t('stepScanTitle')}</h3>
                  <p>{t('stepScanBody')}</p>
                </li>
                <li>
                  <h3 data-vd-reveal>{t('stepOnlineTitle')}</h3>
                  <p>{t('stepOnlineBody')}</p>
                </li>
              </ol>
              <p className="vd-biz-small">{t('beyondNote')}</p>
            </div>
          </div>
        </section>

        <section className="vd-biz-section vd-biz-axis vd-biz-story" aria-labelledby="biz-story">
          <div>
            <Image
              src="/journey/bsharri.webp"
              width={1600}
              height={1200}
              alt={t('bsharriAlt')}
              sizes="(max-width:700px) 100vw, 40vw"
              data-vd-reveal
            />
          </div>
          <div>
            <h2 id="biz-story" data-vd-reveal>
              {t('storyA')}
              <br /> {t('storyB')}
            </h2>
            <p className="vd-biz-statement">{t('storyStatement')}</p>
            <p>{t('storyBody')}</p>
            <div className="vd-biz-pair vd-biz-notes">
              <article>
                <h3 data-vd-reveal>{t('cultureTitle')}</h3>
                <p>{t('cultureBody')}</p>
              </article>
              <article>
                <h3 data-vd-reveal>{t('foodTitle')}</h3>
                <p>{t('foodBody')}</p>
              </article>
              <article>
                <h3 data-vd-reveal>{t('getawaysTitle')}</h3>
                <p>{t('getawaysBody')}</p>
              </article>
            </div>
            <a className="vd-biz-link" href="#contact">
              {t('discussPlace')}
            </a>
          </div>
        </section>

        <section className="vd-biz-section vd-biz-axis vd-biz-dark" aria-labelledby="biz-join">
          <h2 id="biz-join" data-vd-reveal>
            {t('joinA')}
            <br /> {t('joinB')}
          </h2>
          <div className="vd-biz-pair vd-biz-join">
            {(['Introduce', 'Region', 'Formats', 'Releases'] as const).map((key) => (
              <article key={key} data-vd-reveal>
                <h3>{t(`join${key}Title`)}</h3>
                <p>{t(`join${key}Body`)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="vd-biz-section vd-biz-axis" aria-labelledby="biz-questions">
          <h2 id="biz-questions" data-vd-reveal>
            {t('questionsA')}
            <br /> {t('questionsB')}
          </h2>
          <div className="vd-biz-answers">
            {([1, 2, 3, 4, 5, 6] as const).map((n) => (
              <p key={n}>
                <strong>{t(`q${n}`)}</strong> {t(`a${n}`)}
              </p>
            ))}
          </div>
        </section>

        <section
          className="vd-biz-section vd-biz-contact"
          id="contact"
          aria-labelledby="biz-contact"
        >
          <div>
            <h2 id="biz-contact" data-vd-reveal>
              {t('contactA')}
              <br /> {t('contactB')}
            </h2>
            <p>{t('contactBody')}</p>
            <div className="vd-biz-reach">
              {CONTACT.email ? (
                <a className="vd-biz-mail" href={`mailto:${CONTACT.email}`}>
                  {CONTACT.email}
                </a>
              ) : null}
              {CONTACT.phone ? (
                <a
                  className="vd-biz-mail"
                  href={`tel:${CONTACT.phone.replace(/\s/g, '')}`}
                  dir="ltr"
                >
                  {CONTACT.phone}
                </a>
              ) : null}
            </div>
          </div>
          <EnquiryForm
            email={CONTACT.email}
            categories={categories.map(({ key, label }) => ({ key, label }))}
            copy={{
              business: t('fieldBusiness'),
              businessHint: t('fieldBusinessHint'),
              name: t('fieldName'),
              nameHint: t('fieldNameHint'),
              email: t('fieldEmail'),
              emailHint: t('fieldEmailHint'),
              location: t('fieldLocation'),
              locationHint: t('fieldLocationHint'),
              category: t('fieldCategory'),
              message: t('fieldMessage'),
              messageHint: t('fieldMessageHint'),
              submit: t('prepareEnquiry'),
              note: t('formNote'),
              ready: t('enquiryReady'),
              openDraft: t('openDraft'),
              readyAfter: t('enquiryReadyAfter'),
              subject: t.raw('mailSubject') as string,
              greeting: t('mailGreeting'),
              intro: t('mailIntro'),
              mailBusiness: t('mailBusiness'),
              mailName: t('mailName'),
              mailEmail: t('mailEmail'),
              mailLocation: t('mailLocation'),
              mailCategory: t('mailCategory'),
              closing: t('mailClosing'),
              thanks: t('mailThanks'),
            }}
          />
        </section>
      </CategoryProvider>
    </main>
  )
}
