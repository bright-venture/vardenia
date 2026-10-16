import type { ContentPage, ContentPageSlug } from '../lib/pages'
import type { Locale } from '@vardenia/i18n'
import { getTranslations } from 'next-intl/server'
import Image from 'next/image'
import { PageHero } from './editorial/PageHero'
import { Link } from '../i18n/routing'
import { DESTINATIONS } from './journey/destinations'
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

function Line({ text, id }: { text: string; id: string }) {
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

  if (isList) {
    return <li className="text-ink-700 mt-2 leading-relaxed">{withEmphasis(body, id)}</li>
  }

  return <p className="text-ink-700 mt-4 leading-relaxed">{withEmphasis(body, id)}</p>
}

/**
 * No locale prop any more: lib/pages already returned the right language, and a
 * component that takes both the copy and the language it is in has two sources
 * of truth for one fact.
 */
export async function ContentPageView({
  page,
  slug = 'about',
  locale = 'en',
}: {
  page: ContentPage
  slug?: ContentPageSlug
  locale?: Locale
}) {
  const t = await getTranslations({ locale })
  const faq = slug === 'faq'
  const place = {
    about: 1,
    contact: 2,
    faq: 0,
    'add-your-business': 0,
    'partner-with-us': 5,
    advertise: 3,
  }[slug]
  const body = (section: ContentPage['sections'][number], sectionIndex: number) =>
    groupLines(section.body).map((group, groupIndex) => {
      const id = `${sectionIndex}-${groupIndex}`
      return group.kind === 'list' ? (
        <ul key={id} className="list-disc ps-6">
          {group.lines.map((item, itemIndex) => (
            <Line key={`${id}-${itemIndex}`} text={item} id={`${id}-${itemIndex}`} />
          ))}
        </ul>
      ) : (
        <Line key={id} text={group.lines[0]} id={id} />
      )
    })
  return (
    <main className={`vd-standing-page vd-standing-${slug}`}>
      <PageHero
        title={page.title}
        intro={page.intro}
        place={place}
        locale={locale}
        immersive={slug === 'about'}
      >
        <a href="#page-story" className={`vd-button ${slug === 'about' ? 'vd-button-paper' : ''}`}>
          {page.sections[0]?.heading} <span aria-hidden>↓</span>
        </a>
      </PageHero>
      <div className="vd-story-layout" id="page-story">
        <aside className="vd-story-index">
          <nav aria-label={page.title}>
            {page.sections.map((section, i) => (
              <a key={section.heading} href={`#story-${i}`}>
                {section.heading}
                <span aria-hidden>↗</span>
              </a>
            ))}
          </nav>
          <Link
            href={slug === 'about' || slug === 'contact' || faq ? '/directory' : '/contact'}
            className="vd-button"
          >
            {t(slug === 'about' || slug === 'contact' || faq ? 'nav.directory' : 'nav.contact')}{' '}
            <span aria-hidden>↗</span>
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
              <section className="vd-story-section" key={section.heading} id={`story-${i}`}>
                <h2>{section.heading}</h2>
                <div className="vd-story-body">{body(section, i)}</div>
                {slug === 'about' && i === 0 ? (
                  <figure className="vd-story-photograph" data-vd-reveal>
                    <Image
                      src="/journey/deir-el-qamar.webp"
                      alt={DESTINATIONS[5].alt}
                      width={1600}
                      height={1200}
                      sizes="(max-width:700px) 100vw, 60vw"
                    />
                    <figcaption>
                      {locale === 'ar' ? DESTINATIONS[5].ar : DESTINATIONS[5].name}
                    </figcaption>
                  </figure>
                ) : null}
              </section>
            ),
          )}
        </div>
      </div>
    </main>
  )
}
