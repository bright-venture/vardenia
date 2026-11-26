import {
  quoteRooms,
  quoteStay,
  splitParty,
  stayPriceQuote,
  type PriceQuote,
  type PriceSnapshot,
  type QuoteRefusal,
  type StayConfig,
} from '@vardenia/core'
import type { Locale } from '@vardenia/i18n'
import { unavailableMessage, type UnavailableReason } from './availability'
import { optionLabel, type RoomLine, type RoomTypeInventory } from './room-availability'

/**
 * The price of a booking at a hotel or a guest house, from what the server
 * has loaded (Task 7, 20 November 2026). The page's quote (/booking/rooms,
 * /booking/availability) and the snapshot the booking service stores both go
 * through these functions with the same inputs, so they cannot disagree.
 * Restaurants are never priced. See core/price-quote.
 */

/**
 * A hotel quote: each line's room type and option as loaded now (the option
 * named, or the type's first option, as the booking service stores it). An
 * unknown room or option is 'invalid-input'; one unpriced option is
 * 'no-price' for the whole booking.
 */
export function roomQuote(
  types: readonly RoomTypeInventory[],
  lines: readonly RoomLine[],
  nights: number,
): PriceQuote {
  const priced = []
  for (const line of lines) {
    const type = types.find((candidate) => candidate.id === line.roomType)
    if (!type) return { ok: false, reason: 'invalid-input' }
    const option = line.option
      ? type.options.find((candidate) => candidate.id === line.option)
      : type.options[0]
    if (!option) return { ok: false, reason: 'invalid-input' }
    priced.push({
      roomName: type.name ?? '',
      optionLabel: optionLabel(option),
      price: option.price,
      count: line.count,
    })
  }
  return quoteRooms({ nights, lines: priced })
}

/** A guest house quote, the party split as the booking service splits it. */
export function stayQuote({
  stay,
  nights,
  partySize,
  children,
  packageId,
}: {
  stay: StayConfig | null | undefined
  nights: number
  partySize: number
  children?: number | null
  packageId?: string | null
}): PriceQuote {
  const party = splitParty(partySize, children)
  return stayPriceQuote(
    quoteStay({
      nights,
      adults: party.adults,
      children: party.children,
      stay,
      packageId: packageId ?? undefined,
    }),
    stay,
  )
}

/** The `price` group of a booking: a plain copy of the quote, and when. */
export function priceSnapshotData(
  quote: PriceSnapshot,
  quotedAt: Date,
): PriceSnapshot & { quotedAt: string } {
  return {
    total: quote.total,
    currency: 'USD',
    nights: quote.nights,
    lines: quote.lines.map((line) => ({ label: line.label, amount: line.amount })),
    quotedAt: quotedAt.toISOString(),
  }
}

/** The refusal message a guest reads. Above the cap reads as "too many people". */
const REFUSAL_WORDING: Record<QuoteRefusal, UnavailableReason> = {
  'invalid-input': 'invalid-input',
  'below-min-nights': 'below-min-nights',
  'above-max-guests': 'party-too-large',
  'unknown-package': 'unknown-package',
  'inactive-package': 'inactive-package',
  'no-price': 'no-price',
}

export const quoteRefusalMessage = (reason: QuoteRefusal, locale: Locale = 'en'): string =>
  unavailableMessage(REFUSAL_WORDING[reason], locale)

export type QuoteJson =
  ({ ok: true } & PriceSnapshot) | { ok: false; reason: QuoteRefusal; message: string }

/** A quote as the routes return it: the price, or the reason and its wording. */
export function quoteJson(quote: PriceQuote, locale: Locale = 'en'): QuoteJson {
  if (!quote.ok) {
    return { ok: false, reason: quote.reason, message: quoteRefusalMessage(quote.reason, locale) }
  }
  return {
    ok: true,
    total: quote.total,
    currency: quote.currency,
    nights: quote.nights,
    lines: quote.lines.map((line) => ({ label: line.label, amount: line.amount })),
  }
}

const MAX_LINES = 10
const MAX_COUNT = 10

/**
 * A room selection in a query string, "type:count[:option]" comma separated
 * ("3:2:ab12,4:1"), with the same bounds as a booking request. Null when
 * absent or malformed: the route then quotes nothing.
 */
export function parseRoomsParam(raw: string | null | undefined): RoomLine[] | null {
  if (!raw) return null
  const parts = raw.split(',')
  if (parts.length === 0 || parts.length > MAX_LINES) return null
  const lines: RoomLine[] = []
  for (const part of parts) {
    const [typeRaw, countRaw, option, ...rest] = part.split(':')
    if (rest.length > 0) return null
    const roomType = Number(typeRaw)
    const count = Number(countRaw)
    if (!Number.isInteger(roomType) || roomType < 1) return null
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) return null
    const opt = (option ?? '').trim()
    if (opt.length > 64) return null
    lines.push(opt ? { roomType, count, option: opt } : { roomType, count })
  }
  return lines
}
