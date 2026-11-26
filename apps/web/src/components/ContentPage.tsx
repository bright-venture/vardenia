import { WebsitePhoto } from './editorial/WebsitePhoto'
import { StoryIndex } from './editorial/StoryIndex'
import { AskQuestionForm } from './AskQuestionForm'
import './editorial/standing-pages.css'
import { LinkArrow } from './LinkArrow'
import type { ContentPage, ContentPageSlug } from '../lib/pages'
import type { HideablePage } from '../lib/hideable-pages'
import type { Locale } from '@vardenia/i18n'
import { getTranslations } from 'next-intl/server'
import { PageHero } from './editorial/PageHero'
import { Link } from '../i18n/routing'
import { PLACEHOLDER } from '../lib/legal'
import { groupLines } from './LegalDocument'
import { withEmphasis } from './emphasis'

/**
 * The template behind About, Contact, FAQ and the three that sell a listing.
 *
 * Deliberately the same machinery as the legal documents: `groupLines` groups
 * runs of list items and always gives an unsettled clause a block of its own, so
 * a `TO CONFIRM` on a sales page cannot be mistaken for a settled promise. That
 * matters more here than it does in the terms - a made-up price on a page a
 * business is reading is a commitment we would have to honour or explain.
 *
 * No "awaiting legal review" banner, because these are not legal documents and
 * the marker on the individual clause says enough.
 *
 * # Translated, so nothing here overrides direction any more
 *
 * These pages used to be English served under an Arabic URL, with a notice
 * saying so and `dir="ltr"` forced on the whole page. The direction was not
 * cosmetic: the layout inherits `dir="rtl"`, and the bidirectional algorithm
 * puts neutral characters at the end of the paragraph direction, so an English
 * full stop or question mark jumped to the left edge. "Is Vardenia free to use?"
 * rendered as "?Is Vardenia free to use", which reads as broken rather than as
 * untranslated.
 *
 * lib/pages now returns Arabic for an Arabic reader, so both the notice and the
 * override are gone and the page simply inherits the layout's direction. The
 * `TO CONFIRM` marker keeps its own `dir="ltr"`: it is a deliberately
 * untranslated English signal to us, and left to inherit RTL it shows the same
 * displaced-punctuation fault the rest of this comment describes.
 *
 * The legal documents are still English in both editions and still carry the
 * override. See LegalDocument.
 */

function Line({
  text,
  id,
  businessLink = false,
}: {
  text: string
  id: string
  businessLink?: boolean
}) {
  const isList = text.startsWith('- ')
  const body = isList ? text.slice(2) : text

  if (body.includes(PLACEHOLDER)) {
    return (
      /**
       * The one block that stays English on an Arabic page, so the one that
       * still pins its direction. These describe a decision nobody has made
       * yet - a price, a print deadline - and they are notes to ourselves that
       * happen to be visible. Left to inherit RTL, their full stops would jump
       * to the left edge, which is the exact fault the rest of this file was
       * changed to remove.
       */
      <p
        dir="ltr"
        lang="en"
        className="border-state-warning bg-gold-100 text-ink-900 my-4 border-s-4 px-4 py-3 text-start text-sm"
      >
        <span className="text-state-warning me-2 text-sm font-semibold">Not settled</span>
        {body.replace(`${PLACEHOLDER} `, '')}
      </p>
    )
  }

  const business = body.match(/^(.*)\[([^\]]+)\]\(\/add-your-business\)(.*)$/u)
  if (business) {
    return (
      <p className="text-ink-700 mt-4 leading-relaxed">
        {business[1]}
        {businessLink ? (
          <Link className="vd-text-link" href="/add-your-business">
            {business[2]}
          </Link>
        ) : (
          <strong>{business[2]}</strong>
        )}
        {business[3]}
      </p>
    )
  }

  if (isList) {
    return <li className="text-ink-700 mt-2 leading-relaxed">{withEmphasis(body, id)}</li>
  }

  // A pull quote: a tagline or a line the owner set in italics (About).
  if (body.startsWith('> ')) {
    return <p className="vd-story-quote">{withEmphasis(body.slice(2), id)}</p>
  }

  // The closing signature: the wordmark over a last line (About).
  if (body.startsWith('~ ')) {
    return (
      <p className="vd-story-signoff">
        <span aria-hidden="true">VARDENIA</span>
        {body.slice(2)}
      </p>
    )
  }

  return <p className="text-ink-700 mt-4 leading-relaxed">{withEmphasis(body, id)}</p>
}

/** A list item that is nothing but a bold title: "- **Reliable Information**". */
const TITLE_ONLY = /^- \*\*([^*]+)\*\*$/

const DESKTOP_ENQUIRY_ACTIONS: Partial<Record<ContentPageSlug, string>> = {
  contact: 'Send a message',
  faq: 'Ask a question',
}

export async function ContentPageView({
  page,
  slug = 'about',
  locale = 'en',
  hidden = [],
}: {
  page: ContentPage
  slug?: ContentPageSlug
  locale?: Locale
  /** Pages hidden from the admin (lib/hidden-pages): never linked to. */
  hidden?: readonly HideablePage[]
}) {
  const t = await getTranslations({ locale })
  const faq = slug === 'faq'
  const levelsIndex = page.sections.findIndex(
    ({ heading }) => heading === 'What Each Level Includes',
  )
  const enquiryAction = locale === 'en' ? DESKTOP_ENQUIRY_ACTIONS[slug] : undefined
  // The buttons at the foot point at the directory when Contact is hidden, and
  // the second link is left out when the page it names is hidden. With the
  // directory hidden as well, the first goes home.
  const toDirectory = slug === 'about' || slug === 'contact' || faq || hidden.includes('contact')
  const directoryShown = !hidden.includes('directory')
  const next =
    toDirectory && !directoryShown
      ? { href: '/', label: t('common.homepage') }
      : {
          href: toDirectory ? '/directory' : '/contact',
          label: t(toDirectory ? 'nav.directory' : 'nav.contact'),
        }
  const other: ContentPageSlug = faq ? 'about' : 'faq'
  const showOther = !hidden.includes(other)
  const place = {
    about: 1,
    contact: 2,
    faq: 0,
    'add-your-business': 0,
  }[slug]
  const body = (section: { body: string[] }, sectionIndex: number) =>
    groupLines(section.body).map((group, groupIndex) => {
      const id = `${sectionIndex}-${groupIndex}`
      // A list whose items are only bold titles: numbered, between hairlines
      // (About's Our Commitment, the owner's text of 11 November 2026).
      if (group.kind === 'list' && group.lines.every((line) => TITLE_ONLY.test(line))) {
        return (
          <ol key={id} className="vd-story-titles">
            {group.lines.map((line, itemIndex) => (
              <li key={`${id}-${itemIndex}`}>{line.replace(TITLE_ONLY, '$1')}</li>
            ))}
          </ol>
        )
      }
      return group.kind === 'list' ? (
        <ul key={id} className="list-disc ps-6">
          {group.lines.map((item, itemIndex) => (
            <Line key={`${id}-${itemIndex}`} text={item} id={`${id}-${itemIndex}`} />
          ))}
        </ul>
      ) : (
        <Line
          key={id}
          text={group.lines[0]}
          id={id}
          businessLink={!hidden.includes('add-your-business')}
        />
      )
    })
  return (
    <main className={`vd-standing-page vd-standing-${slug}`}>
      <PageHero
        title={page.title}
        intro={page.intro}
        place={place}
        photo={slug === 'contact' ? undefined : slug}
        locale={locale}
        immersive={slug === 'about'}
      >
        {locale === 'en' && slug === 'add-your-business' && (
          <nav hidden className="vd-business-chapters" aria-label={page.title}>
            <Link href="/magazine-places" className="vd-button">
              Request a place <LinkArrow />
            </Link>
            {levelsIndex >= 0 && (
              <a href={`#story-${levelsIndex}`} className="vd-text-link">
                Compare listing levels
              </a>
            )}
          </nav>
        )}
        {enquiryAction && (
          <a hidden className="vd-desktop-enquiry-link" href="#enquiry">
            {enquiryAction}
          </a>
        )}
        <a href="#page-story" className={`vd-button ${slug === 'about' ? 'vd-button-paper' : ''}`}>
          {page.sections[0]?.heading} <span aria-hidden>↓</span>
        </a>
      </PageHero>
      <div className="vd-story-layout" id="page-story">
        <aside className="vd-story-index">
          {faq && locale === 'en' && (
            <a hidden className="vd-faq-enquiry vd-text-link" href="#enquiry">
              Ask a question
            </a>
          )}
          <StoryIndex
            title={page.title}
            sections={page.sections.map((section, i) => ({
              id: `story-${i}`,
              heading: section.heading,
            }))}
          />
          <Link href={next.href} className="vd-button">
            {next.label}{' '}
            <span aria-hidden>
              <LinkArrow />
            </span>
          </Link>
        </aside>
        <div className="vd-content-sections">
          {page.sections.map((section, i) =>
            faq ? (
              <details
                className="vd-question"
                key={section.heading}
                id={`story-${i}`}
                open={i === 0}
              >
                <summary>
                  <h2>{section.heading}</h2>
                  <span className="vd-question-sign" aria-hidden>
                    +
                  </span>
                </summary>
                <div className="vd-story-body">{body(section, i)}</div>
              </details>
            ) : (
              <section
                className="vd-story-section"
                key={section.heading}
                id={`story-${i}`}
                tabIndex={-1}
              >
                <span className="vd-section-number" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h2>{section.heading}</h2>
                <div className="vd-story-body">{body(section, i)}</div>
                {/* Smaller headed parts under the section's own paragraphs. */}
                {section.subsections?.map((part, partIndex) => (
                  <div className="vd-story-subsection" key={part.heading}>
                    <h3>{part.heading}</h3>
                    <div className="vd-story-body">{body(part, i * 100 + partIndex + 1)}</div>
                  </div>
                ))}
                {/* After the subsections, so it closes the section. */}
                {slug === 'about' && i === 0 ? (
                  <WebsitePhoto photo="more" locale={locale} className="vd-story-photograph" />
                ) : null}
              </section>
            ),
          )}
          {/* A question the list did not answer (18 November 2026). */}
          {(faq || (locale === 'en' && slug === 'contact')) && (
            <AskQuestionForm locale={locale} topic={slug === 'contact' ? 'contact' : 'faq'} />
          )}
          <nav className="vd-story-next" aria-label={page.title}>
            {/* Add your business ends on the sign-up form (25 November 2026):
                the one main button, with Contact and Questions beside it. */}
            {slug === 'add-your-business' ? (
              <Link href="/magazine-places" className="vd-button">
                {t('nav.applyMagazine')}
                <LinkArrow />
              </Link>
            ) : null}
            <Link
              href={next.href}
              className={slug === 'add-your-business' ? 'vd-text-link' : 'vd-button'}
            >
              {next.label}
              <LinkArrow />
            </Link>
            {showOther ? (
              <Link href={`/${other}`} className="vd-text-link">
                {t(faq ? 'nav.about' : 'nav.questions')}
                <LinkArrow />
              </Link>
            ) : null}
          </nav>
        </div>
      </div>
    </main>
  )
}
