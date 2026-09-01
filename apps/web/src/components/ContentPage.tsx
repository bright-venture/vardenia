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

/**
 * No locale prop any more: lib/pages already returned the right language, and a
 * component that takes both the copy and the language it is in has two sources
 * of truth for one fact.
 */
export function ContentPageView({ page }: { page: ContentPage }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-ink-900 text-4xl">{page.title}</h1>

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
