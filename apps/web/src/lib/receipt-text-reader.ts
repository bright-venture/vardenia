import type { ReadingCurrency, ReadingPlace } from './receipt-reading'

/**
 * A free receipt reader for testing the pipeline: the text of a PDF receipt,
 * read with rules. Added 16 November 2026 so staging can exercise reading,
 * sealing and the team's checks without an Anthropic key.
 *
 * Switched on with RECEIPT_READER=text, and only when ANTHROPIC_API_KEY is
 * empty (lib/receipt-reading). It runs on our own server, so nothing leaves it.
 *
 * What it can and cannot do, plainly:
 *  - PDFs with real text (a till's or a booking system's receipt, or one
 *    printed to PDF) are read. A photo, or a scan saved as PDF, has no text and
 *    reads as nothing, so the guest types the total, exactly as with reading off.
 *  - The rules find a total line (Total, Grand total, Total à payer, المجموع,
 *    ...) and skip subtotals; prefer a dollar total when both currencies are
 *    printed; read the first day-first date; and take the number after a
 *    receipt or invoice label. They do not judge a business by its name: the
 *    place is "yes" when the booking's name is printed, otherwise "unclear".
 */

export interface TextReading {
  total: number | null
  currency: ReadingCurrency | null
  date: string | null
  place: ReadingPlace
  number: string | null
}

// ---------------------------------------------------------------------------
// Text out of a PDF
// ---------------------------------------------------------------------------

/**
 * The PDF's lines, top to bottom, its pages in order. Items are grouped into a
 * line by their baseline, and ordered left to right inside it.
 */
export async function pdfLines(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await loadPdfjs()
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
  }).promise
  const lines: string[] = []
  try {
    // A receipt is a page or two; the cap keeps a stray long PDF cheap.
    for (let n = 1; n <= Math.min(doc.numPages, 3); n++) {
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      const rows = new Map<number, [number, string][]>()
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue
        const y = Math.round(item.transform[5] as number)
        rows.set(y, [...(rows.get(y) ?? []), [item.transform[4] as number, item.str]])
      }
      for (const [, items] of [...rows.entries()].sort((a, b) => b[0] - a[0])) {
        lines.push(
          items
            .sort((a, b) => a[0] - b[0])
            .map(([, text]) => text)
            .join(' '),
        )
      }
    }
  } finally {
    await doc.destroy()
  }
  return lines
}

type Pdfjs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let pdfjsModule: Promise<Pdfjs> | null = null

/**
 * pdf.js for Node. Its worker is loaded onto the main thread first and handed
 * over as `globalThis.pdfjsWorker`, which pdf.js uses instead of looking for a
 * worker file next to itself: in a bundled server function that file is not
 * where pdf.js would look.
 */
function loadPdfjs(): Promise<Pdfjs> {
  pdfjsModule ??= (async () => {
    const g = globalThis as { pdfjsWorker?: unknown }
    g.pdfjsWorker ??= await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
    return import('pdfjs-dist/legacy/build/pdf.mjs')
  })()
  return pdfjsModule
}

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

/** Arabic-Indic and Persian digits, made Western. */
const EASTERN_DIGITS = /[٠-٩۰-۹]/g
const westernDigit = (d: string) => String((d.charCodeAt(0) & 0xf) % 10)

/**
 * One line made comparable: NFKC (which also turns Arabic presentation forms
 * back into letters), Western digits, lower case, single spaces.
 */
export function normaliseLine(line: string): string {
  return line
    .normalize('NFKC')
    .replace(EASTERN_DIGITS, westernDigit)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Arabic letters only, with the spaces PDFs put between them taken out. */
const arabicLetters = (line: string) => line.replace(/[^؀-ۿ]/g, '')
const reversed = (s: string) => [...s].reverse().join('')

/**
 * Whether a line carries an Arabic word. PDFs often store Arabic in visual
 * order, one letter at a time, so the word is looked for both ways round.
 */
const hasArabic = (line: string, word: string) => {
  const letters = arabicLetters(line)
  return letters.includes(word) || letters.includes(reversed(word))
}

const TOTAL_STRONG =
  /(grand total|total to pay|total due|amount due|total à payer|total a payer|net à payer|net a payer|total ttc|montant total|total general|total général)/
const TOTAL_PLAIN = /(^|[^a-z])(total|montant|amount)([^a-z]|$)/
const SUBTOTAL = /(sub[- ]?total|sous[- ]?total|subtotal)/
const ARABIC_TOTAL_STRONG = ['الإجمالي', 'الاجمالي', 'المجموعالكلي', 'المطلوب']
const ARABIC_TOTAL = ['المجموع', 'المبلغ', 'الإجمالي', 'الاجمالي']
const ARABIC_SUBTOTAL = ['المجموعالفرعي', 'فرعي']

const USD = /(\$|\busd\b|us\$|dollar)/
const LBP = /(l\.l|\bll\b|\blbp\b|l\.b\.p|livre|lira)/
const ARABIC_LBP = ['لل', 'ليرة']

function currencyOf(line: string): ReadingCurrency | null {
  const usd = USD.test(line)
  const lbp = LBP.test(line) || ARABIC_LBP.some((w) => arabicLetters(line).includes(w))
  if (usd && !lbp) return 'USD'
  if (lbp && !usd) return 'LBP'
  return null
}

/**
 * A printed amount as a number. "1,234.50" and "1.234,50" are both 1234.5;
 * "12.977.500" and "1,350,000" are thousands; "145,00" is 145.
 */
export function parseAmount(raw: string): number | null {
  const s = raw.replace(/\s/g, '')
  if (!/\d/.test(s)) return null
  const lastComma = s.lastIndexOf(','),
    lastDot = s.lastIndexOf('.')
  let normal: string
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? ',' : '.'
    normal = s
      .split(decimal === ',' ? '.' : ',')
      .join('')
      .replace(decimal, '.')
  } else if (lastComma >= 0) {
    normal = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (lastDot >= 0) {
    normal = /^\d{1,3}(\.\d{3}){2,}$/.test(s) ? s.replace(/\./g, '') : s
  } else normal = s
  const value = Number(normal)
  return Number.isFinite(value) ? value : null
}

/** The amounts on a line, as printed, leaving out percentages. */
function amountsOn(line: string): number[] {
  const out: number[] = []
  for (const m of line.matchAll(/\d[\d.,\s]*\d|\d/g)) {
    const after = line.slice((m.index ?? 0) + m[0].length).trimStart()
    if (after.startsWith('%')) continue
    // A run that is really two numbers ("2 x 18.00") keeps its last part.
    const parts = m[0].trim().split(/\s+/)
    const value = parseAmount(parts.length > 1 ? parts.at(-1)! : m[0])
    if (value !== null) out.push(value)
  }
  return out
}

interface Candidate {
  value: number
  currency: ReadingCurrency | null
  strong: boolean
  index: number
}

function totals(lines: string[]): Candidate[] {
  const out: Candidate[] = []
  lines.forEach((line, index) => {
    if (SUBTOTAL.test(line) || ARABIC_SUBTOTAL.some((w) => hasArabic(line, w))) return
    const strong = TOTAL_STRONG.test(line) || ARABIC_TOTAL_STRONG.some((w) => hasArabic(line, w))
    const plain = strong || TOTAL_PLAIN.test(line) || ARABIC_TOTAL.some((w) => hasArabic(line, w))
    if (!plain) return
    const amounts = amountsOn(line)
    if (amounts.length === 0) return
    out.push({ value: amounts.at(-1)!, currency: currencyOf(line), strong, index })
  })
  return out
}

/** The receipt's main currency, for a total line that prints none. */
function mainCurrency(lines: string[]): ReadingCurrency | null {
  let usd = 0,
    lbp = 0
  for (const line of lines) {
    const c = currencyOf(line)
    if (c === 'USD') usd++
    if (c === 'LBP') lbp++
  }
  return usd === 0 && lbp === 0 ? null : usd >= lbp ? 'USD' : 'LBP'
}

/** The first date printed, day first (Lebanese receipts), as YYYY-MM-DD. */
function dateOf(lines: string[]): string | null {
  for (const line of lines) {
    const iso = line.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/)
    const dmy = line.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/)
    const [y, m, d] = iso
      ? [iso[1], iso[2], iso[3]]
      : dmy
        ? [dmy[3]!.length === 2 ? `20${dmy[3]}` : dmy[3], dmy[2], dmy[1]]
        : []
    if (!y || !m || !d) continue
    const value = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    const parsed = new Date(`${value}T12:00:00Z`)
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value) return value
  }
  return null
}

const NUMBER_LABEL =
  /(receipt|invoice|bill|facture|ticket|reçu|recu|order)\s*(no\.?|n°|nº|#|number|num\.?)?\s*[:.]?\s*([a-z0-9][a-z0-9\-/]*\d[a-z0-9\-/]*)/
const ARABIC_NUMBER = ['رقمالفاتورة', 'رقمالإيصال', 'رقمالايصال', 'فاتورةرقم', 'رقم']

/** The receipt or invoice number after its label; not a table or a phone. */
function numberOf(lines: string[]): string | null {
  for (const line of lines) {
    if (/\b(table|tel|phone|server|cashier|mof|vat)\b/.test(line)) continue
    const m = line.match(NUMBER_LABEL)
    if (m?.[3]) return m[3]
    if (ARABIC_NUMBER.some((w) => hasArabic(line, w))) {
      const digits = line.match(/\d[\d\-/]*\d|\d/)
      if (digits) return digits[0]
    }
  }
  return null
}

/** "yes" when the booking's name is printed, word for word; otherwise unclear. */
function placeOf(lines: string[], place: string): ReadingPlace {
  const words = normaliseLine(place)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3)
  if (words.length === 0) return 'unclear'
  const text = lines.join(' ')
  return words.every((w) => text.includes(w)) ? 'yes' : 'unclear'
}

/** What the rules read from a receipt's lines. */
export function readReceiptText(rawLines: string[], place: string): TextReading {
  const lines = rawLines.map(normaliseLine).filter(Boolean)
  const found = totals(lines)
  const fallback = mainCurrency(lines)
  const withCurrency = found.map((c) => ({ ...c, currency: c.currency ?? fallback }))
  // A dollar total over a pounds one (as the Claude reader is told), then a
  // "total to pay" over a plain "total", then the last one printed.
  const best = [...withCurrency].sort(
    (a, b) =>
      Number(b.currency === 'USD') - Number(a.currency === 'USD') ||
      Number(b.strong) - Number(a.strong) ||
      b.index - a.index,
  )[0]
  return {
    total: best && best.currency ? best.value : null,
    currency: best?.currency ?? null,
    date: dateOf(lines),
    place: placeOf(lines, place),
    number: numberOf(lines),
  }
}
