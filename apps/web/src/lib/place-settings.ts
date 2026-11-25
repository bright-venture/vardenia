import type { Payload, PayloadRequest } from 'payload'

/**
 * The "Magazine places" settings (globals/Settings, tab Magazine places), with
 * the defaults filled in. Read by the start and finish services of the
 * Magazine Places form and by the payment engine (lib/place-payments).
 *
 * Two-stage payment (spec v4, 24 November 2026): the owner pays a downpayment
 * (a percent of the price) within `downpaymentDeadlineDays` of finishing the
 * form, and the rest within `balanceDeadlineDays` of being accepted. The single
 * `paymentDeadlineDays` of the first version is gone.
 */
export interface PlaceSettings {
  pricePerYear: number
  currency: string
  termMonths: number
  /** Percent of the price paid first, above 0 and at most 100. */
  downpaymentPercent: number
  /** Days after the form is finished to pay the downpayment. */
  downpaymentDeadlineDays: number
  /** Day (counted from the finish) of the one downpayment reminder; 0 = none. */
  downpaymentReminderDay: number
  /** Days after acceptance to pay the rest. */
  balanceDeadlineDays: number
  /** How many days before the balance deadline the reminder goes; 0 = none. */
  balanceReminderDaysBefore: number
  holdMinutes: number
  /** Company number for Whish and WhatsApp, international format. */
  whishNumber: string
  termsVersion: string
}

export const DEFAULT_PLACE_SETTINGS: PlaceSettings = {
  pricePerYear: 1000,
  currency: 'USD',
  termMonths: 12,
  downpaymentPercent: 50,
  downpaymentDeadlineDays: 7,
  downpaymentReminderDay: 5,
  balanceDeadlineDays: 30,
  balanceReminderDaysBefore: 3,
  holdMinutes: 30,
  whishNumber: '+96179300350',
  termsVersion: '2026-11-24',
}

const positiveInt = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback

/** A whole number of days where 0 is meaningful ("no reminder"). */
const wholeDays = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback

const text = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback

/** A reminder must come before its deadline: at most deadline - 1, 0 = none. */
const reminderBefore = (value: number, deadlineDays: number) =>
  Math.max(0, Math.min(value, deadlineDays - 1))

/** Pure: turns whatever the global holds (or null) into complete settings. */
export function placeSettingsFrom(raw: unknown): PlaceSettings {
  const g = ((raw as { magazinePlaces?: Record<string, unknown> } | null)?.magazinePlaces ??
    {}) as Record<string, unknown>
  const d = DEFAULT_PLACE_SETTINGS
  const downpaymentDeadlineDays = positiveInt(g.downpaymentDeadlineDays, d.downpaymentDeadlineDays)
  const balanceDeadlineDays = positiveInt(g.balanceDeadlineDays, d.balanceDeadlineDays)
  return {
    pricePerYear:
      typeof g.pricePerYear === 'number' && Number.isFinite(g.pricePerYear) && g.pricePerYear >= 1
        ? g.pricePerYear
        : d.pricePerYear,
    currency: text(g.currency, d.currency).toUpperCase(),
    termMonths: positiveInt(g.termMonths, d.termMonths),
    downpaymentPercent:
      typeof g.downpaymentPercent === 'number' &&
      Number.isFinite(g.downpaymentPercent) &&
      g.downpaymentPercent > 0 &&
      g.downpaymentPercent <= 100
        ? g.downpaymentPercent
        : d.downpaymentPercent,
    downpaymentDeadlineDays,
    downpaymentReminderDay: reminderBefore(
      wholeDays(g.downpaymentReminderDay, d.downpaymentReminderDay),
      downpaymentDeadlineDays,
    ),
    balanceDeadlineDays,
    balanceReminderDaysBefore: reminderBefore(
      wholeDays(g.balanceReminderDaysBefore, d.balanceReminderDaysBefore),
      balanceDeadlineDays,
    ),
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
