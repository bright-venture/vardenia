import type { Locale } from '@vardenia/i18n'
import { PLACEHOLDER, LEGAL_LAST_UPDATED, type LegalDocument } from '../lib/legal'
import { withEmphasis } from './emphasis'

/**
 * Renders a legal document, and refuses to let an unfinished one look finished.
 *
 * Anything still marked `TO CONFIRM` is rendered as a bordered, coloured block
 * rather than as body text. That is the whole reason this component exists
 * rather than the pages just mapping over paragraphs: a draft clause set in the
 * same type as the rest reads as settled, and these documents will sit in front
 * of readers for months before a lawyer has been near them.
 *
 * A banner at the top says the same thing once, plainly, so nobody has to scroll
 * to discover it.
 *
 * # Not localized
 *
 * See lib/legal. The English text governs; the Arabic pages say so and link
 * here. Machine-translated legal wording reads as authoritative and is not.
 */

/** `lines` is never empty - groupLines always seeds a group with one line. */
type LineGroup = { kind: 'list' | 'single'; lines: [string, ...string[]] }

/**
 * Consecutive list items into one group, everything else on its own.
 *
 * The first attempt filtered the list items out of the body and rendered them
 * separately, which quietly dropped any list item that was also an unsettled
 * clause - the one kind of line that must never disappear. It was invisible in
 * the markup and showed up only as a count: seven placeholders in the source,
 * six on the page.
 *
 * An unsettled clause is always its own block, list item or not, so it can never
 * be swallowed by the grouping again.
 */
export function groupLines(body: string[]): LineGroup[] {
  const groups: LineGroup[] = []

  for (const line of body) {
    const isPlainListItem = line.startsWith('- ') && !line.includes(PLACEHOLDER)
    const previous = groups[groups.length - 1]

    if (isPlainListItem && previous?.kind === 'list') {
      previous.lines.push(line)
      continue
    }

    groups.push({ kind: isPlainListItem ? 'list' : 'single', lines: [line] })
  }

  return groups
}

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

export function LegalDocumentView({
  document,
  locale,
  unresolved,
}: {
  document: LegalDocument
  locale: Locale
  /** How many clauses are still marked TO CONFIRM. */
  unresolved: number
}) {
  const ar = locale === 'ar'

  return (
    /**
     * Laid out left to right on the Arabic page, because the document itself is
     * English. See ContentPage for the full reasoning: an English sentence in an
     * RTL paragraph has its full stop moved to the left edge, which reads as a
     * rendering fault rather than as an untranslated page.
     *
     * It matters more here than on the standing pages. These are the terms
     * somebody accepts, and a clause that looks garbled is a clause they cannot
     * be said to have read.
     */
    <main
      dir={ar ? 'ltr' : undefined}
      lang={ar ? 'en' : undefined}
      className="mx-auto max-w-2xl px-6 py-16"
    >
      <h1 className="font-display text-ink-900 text-4xl">{document.title}</h1>
      <p className="text-ink-500 mt-3 text-xs uppercase tracking-widest">
        Last updated {LEGAL_LAST_UPDATED}
      </p>

      {/* Said once, at the top, in plain words. A reader deciding whether to
          trust the site with an address deserves to know this is a draft. */}
      {unresolved > 0 ? (
        <p
          dir={ar ? 'rtl' : undefined}
          lang={ar ? 'ar' : undefined}
          className="border-state-warning bg-gold-100 text-ink-900 mt-8 rounded-md border px-4 py-3 text-sm"
        >
          {ar
            ? 'هذه مسودة قيد المراجعة القانونية. الفقرات المعلّمة أدناه لم تُحسم بعد.'
            : `This is a draft awaiting legal review. ${unresolved} point${unresolved === 1 ? '' : 's'} below ${unresolved === 1 ? 'is' : 'are'} not settled yet, and are marked where they appear.`}
        </p>
      ) : null}

      <p className="text-ink-700 mt-8 text-lg leading-relaxed">{document.intro}</p>

      {document.sections.map((section, sectionIndex) => (
        <section key={section.heading} className="mt-12">
          <h2 className="font-display text-ink-900 text-2xl">{section.heading}</h2>

          {groupLines(section.body).map((group, groupIndex) => {
            const id = `${sectionIndex}-${groupIndex}`

            /* Runs of list items share one <ul>, so a screen reader announces
               "list of four" rather than four stray paragraphs. */
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
