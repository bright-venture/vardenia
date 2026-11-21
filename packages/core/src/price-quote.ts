import { roundMoney, type StayConfig, type StayQuote, type StayRefusal } from './stay'

/**
 * The price a booking is quoted, and the snapshot stored on it (Task 7,
 * 20 November 2026).
 *
 * One pure function per kind of place, used by the page's quote
 * (/booking/availability, /booking/rooms) and by the booking service that
 * stores it, so the total shown before booking is the total stored for the
 * same inputs. The server always recomputes it; a client never sends one.
 *
 *  - Hotel: per room line, nights x the chosen option's price x rooms. Any
 *    line without a price means no quote at all ('no-price'): never a partial
 *    total, never a zero for a missing price. A price of 0 is a real price.
 *  - Guest house: the quoteStay result (core/stay), with labels.
 *  - Restaurants: never priced.
 *
 * A unit price is rounded to cents once (the label shows that price and the
 * amount uses it), each line is rounded half away from zero to cents and the
 * total is the sum of the rounded lines. Labels are English, like the option
 * wording copied on a booking line: the venue reads them, and they do not
 * change afterwards.
 */

export interface PriceLine {
  label: string
  amount: number
}

export interface PriceSnapshot {
  total: number
  currency: 'USD'
  nights: number
  lines: PriceLine[]
}

/** Why a price cannot be quoted. The same reasons as a stay quote. */
export type QuoteRefusal = StayRefusal

export type PriceQuote = ({ ok: true } & PriceSnapshot) | { ok: false; reason: QuoteRefusal }

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const wholeAtLeastOne = (value: unknown): boolean =>
  finite(value) && Number.isInteger(value) && value >= 1

/** "$70", "$180.50", "$1,234.56": USD as the site and the emails show it. */
export function formatUsd(value: number): string {
  const amount = roundMoney(value)
  const cents = !Number.isInteger(amount)
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export interface RoomQuoteLine {
  roomName?: string | null
  /** The option's wording, as copied on the booking line. */
  optionLabel?: string | null
  /** USD per room per night, as the option says at booking time. */
  price: number | null | undefined
  count: number
}

/** A hotel stay: nights x option price x rooms, summed over the lines. */
export function quoteRooms({
  nights,
  lines,
}: {
  nights: number
  lines: readonly RoomQuoteLine[]
}): PriceQuote {
  if (!wholeAtLeastOne(nights) || lines.length === 0) return { ok: false, reason: 'invalid-input' }
  if (lines.some((line) => !wholeAtLeastOne(line.count))) {
    return { ok: false, reason: 'invalid-input' }
  }
  // Every line priced, or no quote: a partial total would understate the stay.
  if (lines.some((line) => !finite(line.price) || line.price < 0)) {
    return { ok: false, reason: 'no-price' }
  }
  const priced = lines.map((line) => {
    // Rounded once, so the label and the amount use the same unit price
    // (a legacy 33.335 is $33.34 in both).
    const price = roundMoney(line.price as number)
    const name = line.roomName || 'Room'
    const option = line.optionLabel ? ` (${line.optionLabel})` : ''
    return {
      label: `${line.count} x ${name}${option}, ${plural(nights, 'night', 'nights')} at ${formatUsd(price)}`,
      amount: roundMoney(price * line.count * nights),
    }
  })
  const total = roundMoney(priced.reduce((sum, line) => sum + line.amount, 0))
  return { ok: true, total, currency: 'USD', nights, lines: priced }
}

/** A label stored as a string, or as a localized object read at depth 0. */
function packageLabel(stay: StayConfig | null | undefined, id: string | undefined): string {
  const row = (stay?.packages ?? []).find((candidate) => candidate && String(candidate.id) === id)
  const label = row?.label
  if (typeof label === 'string' && label.trim()) return label.trim()
  if (label && typeof label === 'object') {
    const en = (label as Record<string, unknown>).en
    if (typeof en === 'string' && en.trim()) return en.trim()
    const first = Object.values(label as Record<string, unknown>).find(
      (value) => typeof value === 'string' && value.trim(),
    )
    if (typeof first === 'string') return first.trim()
  }
  return 'Package'
}

/** A guest house quote (core quoteStay) as a price with labelled lines. */
export function stayPriceQuote(quote: StayQuote, stay: StayConfig | null | undefined): PriceQuote {
  if (!quote.ok) return { ok: false, reason: quote.reason }
  const lines = quote.lines.map((line): PriceLine => {
    const at = `at ${formatUsd(line.unitPrice)}`
    if (line.kind === 'nightly') {
      return {
        label: `Nightly price, ${plural(line.quantity, 'night', 'nights')} ${at}`,
        amount: line.amount,
      }
    }
    if (line.kind === 'extra-guests') {
      return {
        label: `Extra guests, ${plural(quote.extraGuests, 'guest', 'guests')} x ${plural(quote.nights, 'night', 'nights')} ${at}`,
        amount: line.amount,
      }
    }
    const name = packageLabel(stay, line.packageId)
    const label =
      line.unit === 'per-stay'
        ? `${name}, per stay`
        : line.unit === 'per-person-per-night'
          ? `${name}, ${plural(quote.guests, 'guest', 'guests')} x ${plural(quote.nights, 'night', 'nights')} ${at}`
          : `${name}, ${plural(line.quantity, 'night', 'nights')} ${at}`
    return { label, amount: line.amount }
  })
  return { ok: true, total: quote.total, currency: 'USD', nights: quote.nights, lines }
}
