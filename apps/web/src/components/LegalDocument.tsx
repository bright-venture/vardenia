import { dirFor, type Locale } from '@vardenia/i18n'
import { PLACEHOLDER, LEGAL_LAST_UPDATED, type LegalDocument } from '../lib/legal'
import { withEmphasis } from './emphasis'

/**
 * The draft warning, in the reader's own language even though the document is
 * English: it is the one sentence on the page they most need to understand.
 *
 * Arabic had it; the eight languages added later showed the English sentence.
 * Like the Arabic, these leave out the count the English gives, which would need
 * a plural rule per language for a number that reaches nought and disappears.
 */
const DRAFT_NOTICE: Record<Exclude<Locale, 'en'>, string> = {
  ar: 'هذه مسودة قيد المراجعة القانونية. الفقرات المعلّمة أدناه لم تُحسم بعد.',
  fr: 'Ce document est un projet en attente de relecture juridique. Les points signalés ci-dessous ne sont pas encore arrêtés.',
  es: 'Este documento es un borrador pendiente de revisión legal. Los puntos marcados más abajo aún no están cerrados.',
  pt: 'Este documento é um rascunho aguardando revisão jurídica. Os pontos marcados abaixo ainda não foram definidos.',
  ru: 'Это черновик, ожидающий юридической проверки. Отмеченные ниже пункты ещё не согласованы.',
  zh: '本文件为待法律审核的草稿。下方标注的条款尚未最终确定。',
  hi: 'यह क़ानूनी समीक्षा की प्रतीक्षा में एक मसौदा है। नीचे चिह्नित बिंदु अभी तय नहीं हुए हैं।',
  bn: 'এটি আইনি পর্যালোচনার অপেক্ষায় থাকা একটি খসড়া। নিচে চিহ্নিত বিষয়গুলো এখনো চূড়ান্ত হয়নি।',
  ur: 'یہ قانونی جائزے کا منتظر ایک مسودہ ہے۔ نیچے نشان زد نکات ابھی طے نہیں ہوئے۔',
}

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
      <p className="border-state-warning bg-gold-100 text-ink-900 my-4 border-s-4 px-4 py-3 text-sm">
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
  /*
   * Every language but English, not just Arabic. The document is English in all
   * of them, so on each it is marked as English and laid out left to right. It
   * was keyed on `=== 'ar'`, which left Urdu - also right to left - rendering the
   * terms with every full stop on the wrong edge, and told a French screen reader
   * to read English in a French voice.
   */
  const foreign = locale !== 'en'

  return (
    /**
     * Laid out left to right on every page but the English one, because the
     * document itself is English. See ContentPage for the full reasoning: an
     * English sentence in an RTL paragraph has its full stop moved to the left
     * edge, which reads as a rendering fault rather than as an untranslated page.
     *
     * It matters more here than on the standing pages. These are the terms
     * somebody accepts, and a clause that looks garbled is a clause they cannot
     * be said to have read.
     */
    <main
      dir={foreign ? 'ltr' : undefined}
      lang={foreign ? 'en' : undefined}
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
          dir={foreign ? dirFor(locale) : undefined}
          lang={foreign ? locale : undefined}
          className="border-state-warning bg-gold-100 text-ink-900 mt-8 border px-4 py-3 text-sm"
        >
          {locale !== 'en'
            ? DRAFT_NOTICE[locale]
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
