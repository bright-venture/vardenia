import type { Payload, PayloadRequest } from 'payload'

/**
 * The "Magazine places" settings (globals/Settings, tab Magazine places), with
 * the defaults filled in. Read by the start and finish services of the
 * Magazine Places form.
 */
export interface PlaceSettings {
  pricePerYear: number
  currency: string
  termMonths: number
  paymentDeadlineDays: number
  holdMinutes: number
  /** Company number for Whish and WhatsApp, international format. */
  whishNumber: string
  termsVersion: string
}

export const DEFAULT_PLACE_SETTINGS: PlaceSettings = {
  pricePerYear: 20,
  currency: 'USD',
  termMonths: 12,
  paymentDeadlineDays: 7,
  holdMinutes: 30,
  whishNumber: '+96179300350',
  termsVersion: '2026-11',
}

const positiveInt = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback

const text = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback

/** Pure: turns whatever the global holds (or null) into complete settings. */
export function placeSettingsFrom(raw: unknown): PlaceSettings {
  const g = ((raw as { magazinePlaces?: Record<string, unknown> } | null)?.magazinePlaces ??
    {}) as Record<string, unknown>
  const d = DEFAULT_PLACE_SETTINGS
  return {
    pricePerYear:
      typeof g.pricePerYear === 'number' && Number.isFinite(g.pricePerYear) && g.pricePerYear >= 0
        ? g.pricePerYear
        : d.pricePerYear,
    currency: text(g.currency, d.currency).toUpperCase(),
    termMonths: positiveInt(g.termMonths, d.termMonths),
    paymentDeadlineDays: positiveInt(g.paymentDeadlineDays, d.paymentDeadlineDays),
    holdMinutes: positiveInt(g.holdMinutes, d.holdMinutes),
    whishNumber: text(g.whishNumber, d.whishNumber),
    termsVersion: text(g.termsVersion, d.termsVersion),
  }
}

/**
 * Read with access overridden, because the public form needs the price and the
 * number. Never throws: an unreadable setting falls back to the defaults.
 */
export async function getPlaceSettings(
  payload: Payload,
  req?: PayloadRequest,
): Promise<PlaceSettings> {
  const raw = await payload
    .findGlobal({ slug: 'settings', depth: 0, overrideAccess: true, ...(req ? { req } : {}) })
    .catch(() => null)
  return placeSettingsFrom(raw)
}
