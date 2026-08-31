import type { Locale } from '@vardenia/i18n'
import type { ContentPage } from '../lib/pages'
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
 * # Not localized yet
 *
 * The Arabic pages are the English text for now. Unlike the legal documents,
 * where an unchecked translation would be actively dangerous, this is only
 * unfinished - so it degrades to English rather than refusing to render, and the
 * note at the top of an Arabic page says so.
 *
 * # Which is why the Arabic page is laid out left to right
 *
 * The layout inherits `dir="rtl"` from the html element, and English text in an
 * RTL paragraph is not merely right-aligned: the bidirectional algorithm puts
 * neutral characters at the *end* of the paragraph direction, so a full stop or
 * question mark jumps to the left edge. "Is Vardenia free to use?" rendered as
 * "?Is Vardenia free to use", which reads as broken rather than as untranslated.
 *
 * So the direction follows the language of the text rather than the language of
 * the page. The Arabic notice stays RTL because it is the one thing here that is
 * actually Arabic.
 */

function Line({ text, id }: { text: string; id: string }) {
  const isList = text.startsWith('- ')
  const body = isList ? text.slice(2) : text

  if (body.includes(PLACEHOLDER)) {
    return (
      <p className="border-state-warning bg-gold-100 text-ink-900 my-4 rounded-md border-s-4 px-4 py-3 text-sm">
        <span className="text-state-warning me-2 text-xs font-semibold uppercase tracking-wider">
          Not settled
        </span>
        {body.replace(`${PLACEHOLDER} `, '')}
      </p>
    )
  }

  if (isList) {
    return <li className="text-ink-700 mt-2 leading-relaxed">{withEmphasis(body, id)}</li>
  }

  return <p className="text-ink-700 mt-4 leading-relaxed">{withEmphasis(body, id)}</p>
}

export function ContentPageView({ page, locale }: { page: ContentPage; locale: Locale }) {
  return (
    <main
      dir={locale === 'ar' ? 'ltr' : undefined}
      className="mx-auto max-w-2xl px-6 py-16"
      lang={locale === 'ar' ? 'en' : undefined}
    >
      <h1 className="font-display text-ink-900 text-4xl">{page.title}</h1>

      {locale === 'ar' ? (
        <p
          dir="rtl"
          lang="ar"
          className="border-ink-100 bg-surface-raised text-ink-500 mt-6 rounded-md border px-4 py-3 text-sm"
        >
          هذه الصفحة متوفرة بالإنجليزية فقط في الوقت الحالي.
        </p>
      ) : null}

      <p className="text-ink-700 mt-8 text-lg leading-relaxed">{page.intro}</p>

      {page.sections.map((section, sectionIndex) => (
        <section key={section.heading} className="mt-12">
          <h2 className="font-display text-ink-900 text-2xl">{section.heading}</h2>

          {groupLines(section.body).map((group, groupIndex) => {
            const id = `${sectionIndex}-${groupIndex}`

            if (group.kind === 'list') {
              return (
                <ul key={id} className="mt-4 list-disc ps-6">
                  {group.lines.map((item, itemIndex) => (
                    <Line key={`${id}-${itemIndex}`} text={item} id={`${id}-${itemIndex}`} />
                  ))}
                </ul>
              )
            }

            return <Line key={id} text={group.lines[0]} id={id} />
          })}
        </section>
      ))}
    </main>
  )
}
