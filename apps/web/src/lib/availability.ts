import {
  durationMinutes,
  isUsableInterval,
  occupiesCapacity,
  overlaps,
  type BookingStatus,
  type Interval,
} from '@vardenia/core'
import { isOpenNow, type OpeningHour } from './hours'
import { beirutDate } from './beirut'
import type { Locale } from '@vardenia/i18n'

/**
 * Can this booking be made?
 *
 * A pure function of the request, the business's rules, its opening hours and
 * the bookings that already exist. No database, no clock of its own - `now` is
 * passed in. That is what makes the awkward cases testable: a request for 03:00
 * on a Sunday at a restaurant whose Saturday session runs past midnight, a
 * booking made eleven months out, a party of twelve at a place that seats four.
 *
 * # This is advisory, not the guarantee
 *
 * Capacity is checked here so the customer gets a useful message, and it is
 * checked *again* by a trigger in the database, which is where the guarantee
 * actually lives. Two people booking the last table at the same moment both pass
 * this function: it reads the bookings that existed when it ran, and neither
 * request has been written yet. No amount of care in application code fixes
 * that, because the check and the insert are separate statements.
 *
 * So treat a pass here as "worth submitting", never as "reserved".
 */

export const UNAVAILABLE_REASONS = [
  'invalid-interval',
  'bookings-disabled',
  'in-the-past',
  'too-soon',
  'too-far-ahead',
  'too-short',
  'too-long',
  'party-too-small',
  'party-too-large',
  'closed-period',
  'closed',
  'at-capacity',
] as const

export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number]

export type Availability =
  { ok: true } | { ok: false; reason: UnavailableReason; detail?: Record<string, number> }

/**
 * Per-business booking rules, as stored on the listing.
 *
 * Every field is optional because Payload returns a group that nobody has filled
 * in as `undefined`, and a half-configured listing must not resolve to something
 * permissive. Missing values fall back to the constants below, except `enabled`,
 * which falls back to off.
 */
export interface BookingRules {
  enabled?: boolean | null
  /** How many occupying bookings may overlap at once. */
  capacity?: number | null
  minPartySize?: number | null
  maxPartySize?: number | null
  /** Minimum notice, in minutes. A kitchen needs some; a hotel needs more. */
  leadTimeMinutes?: number | null
  /** How far ahead the calendar is open, in days. */
  maxAdvanceDays?: number | null
  minDurationMinutes?: number | null
  maxDurationMinutes?: number | null
  /**
   * Room or unit types a stay can request (Standard, Deluxe). Presentation only:
   * the availability check ignores them - capacity stays a single number, and a
   * room type does not have its own inventory. It is here so the form and the
   * booking service can read the configured labels from the same rules object.
   */
  roomTypes?: ({ label?: string | null; price?: number | null } | null)[] | null
  /** Free-text cancellation terms, shown to the customer. Not enforced. */
  cancellationPolicy?: string | null
}

/** An existing booking, reduced to what the check actually needs. */
export interface ExistingBooking {
  start: Date
  end: Date
  status: BookingStatus
  /** Excluded from the capacity count, so editing a booking does not conflict with itself. */
  id?: string | number
}

/**
 * A period the venue has said it is shut, as Beirut calendar days, inclusive at
 * both ends. See the Closures collection for why these are text and not
 * timestamps.
 */
export interface ClosedPeriod {
  startsOn: string
  endsOn: string
}

/**
 * A Beirut calendar day, and nothing that merely looks like one.
 *
 * The shape check alone is not enough: `2026-02-31` matches the pattern and is
 * not a date. Round-tripping through `Date` rejects it, and `2026-13-01` with
 * it. Lives here rather than beside the collection that validates on write,
 * because this is where a bad value would do its damage - a malformed string
 * compares with `<=` against real dates and would shut a listing for a period
 * nobody can read back.
 */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export function isCalendarDay(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DAY.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export interface AvailabilityRequest {
  interval: Interval
  partySize: number
  /** Set when editing, so the booking being changed is not counted against itself. */
  excludeBookingId?: string | number
}

const DEFAULTS = {
  capacity: 1,
  minPartySize: 1,
  maxPartySize: 20,
  leadTimeMinutes: 0,
  maxAdvanceDays: 365,
  minDurationMinutes: 15,
  maxDurationMinutes: 60 * 24 * 30,
} as const

/** A positive integer, or the fallback. Guards against 0, NaN and negatives in the CMS. */
const positive = (value: number | null | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback

/** Zero is meaningful for lead time, so it needs its own guard. */
const nonNegative = (value: number | null | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback

export function resolveRules(rules: BookingRules | null | undefined) {
  const r = rules ?? {}
  return {
    enabled: r.enabled === true,
    capacity: positive(r.capacity, DEFAULTS.capacity),
    minPartySize: positive(r.minPartySize, DEFAULTS.minPartySize),
    maxPartySize: positive(r.maxPartySize, DEFAULTS.maxPartySize),
    leadTimeMinutes: nonNegative(r.leadTimeMinutes, DEFAULTS.leadTimeMinutes),
    maxAdvanceDays: positive(r.maxAdvanceDays, DEFAULTS.maxAdvanceDays),
    minDurationMinutes: positive(r.minDurationMinutes, DEFAULTS.minDurationMinutes),
    maxDurationMinutes: positive(r.maxDurationMinutes, DEFAULTS.maxDurationMinutes),
  }
}

export function checkAvailability({
  rules,
  hours,
  closures,
  existing,
  request,
  now = new Date(),
}: {
  rules: BookingRules | null | undefined
  hours: OpeningHour[] | null | undefined
  /** Holidays and shutdowns the venue has entered. Omitted means none. */
  closures?: ClosedPeriod[] | null
  existing: ExistingBooking[]
  request: AvailabilityRequest
  now?: Date
}): Availability {
  const config = resolveRules(rules)

  // Ordered cheapest first, and deliberately from the most general reason to the
  // most specific: telling someone the restaurant is full is worse than useless
  // if the real problem is that it does not take bookings at all.
  if (!config.enabled) return { ok: false, reason: 'bookings-disabled' }

  if (!isUsableInterval(request.interval)) return { ok: false, reason: 'invalid-interval' }

  const minutes = durationMinutes(request.interval)!
  const { start } = request.interval

  if (start.getTime() < now.getTime()) return { ok: false, reason: 'in-the-past' }

  const noticeMinutes = (start.getTime() - now.getTime()) / 60_000
  if (noticeMinutes < config.leadTimeMinutes) {
    return {
      ok: false,
      reason: 'too-soon',
      detail: { requiredMinutes: config.leadTimeMinutes },
    }
  }

  const daysAhead = (start.getTime() - now.getTime()) / 86_400_000
  if (daysAhead > config.maxAdvanceDays) {
    return { ok: false, reason: 'too-far-ahead', detail: { maxDays: config.maxAdvanceDays } }
  }

  if (minutes < config.minDurationMinutes) {
    return { ok: false, reason: 'too-short', detail: { minMinutes: config.minDurationMinutes } }
  }
  if (minutes > config.maxDurationMinutes) {
    return { ok: false, reason: 'too-long', detail: { maxMinutes: config.maxDurationMinutes } }
  }

  const party = Math.floor(request.partySize)
  if (!Number.isFinite(party) || party < config.minPartySize) {
    return { ok: false, reason: 'party-too-small', detail: { minPartySize: config.minPartySize } }
  }
  if (party > config.maxPartySize) {
    return { ok: false, reason: 'party-too-large', detail: { maxPartySize: config.maxPartySize } }
  }

  /**
   * A holiday beats the weekly timetable, and is checked first for that reason.
   *
   * Both answers are "no", but they are different sentences. A venue shut for
   * the fortnight in August is not "closed at that time" - which invites the
   * reader to try an hour later on the same day, and get the same refusal. The
   * order here is what decides which of the two the customer is told.
   *
   * Compared on the Beirut calendar day, because that is what a closed day is.
   * The alternative - comparing instants - makes a booking at 01:00 on the 15th
   * fall on the 14th in UTC, and a venue that closed only the 14th would refuse
   * it. `beirutDate` is the same function the dashboard groups rows by, so the
   * day a customer is refused is the day the owner sees on their own screen.
   */
  if (closures && closures.length > 0) {
    const day = beirutDate(start)
    const shut = closures.some(
      (period) =>
        isCalendarDay(period.startsOn) &&
        isCalendarDay(period.endsOn) &&
        day >= period.startsOn &&
        day <= period.endsOn,
    )
    if (shut) return { ok: false, reason: 'closed-period' }
  }

  /**
   * Opening hours, checked at the start instant only.
   *
   * `isOpenNow` already knows about Beirut and about sessions that run past
   * midnight, so this reuses it rather than reimplementing a timezone.
   *
   * Only the start is checked, and that is a decision rather than an oversight.
   * A dinner booked at 21:00 in a kitchen that closes at 23:00 legitimately runs
   * past closing while the guests finish, and a hotel stay spans every closed
   * night in between. Requiring the end to fall inside opening hours would
   * reject both.
   *
   * `null` means no hours are recorded, which is not the same as closed. A
   * business with bookings switched on and no hours published is taken at its
   * word - the alternative is refusing every request at a place that has told us
   * it wants them.
   */
  if (isOpenNow(hours, start) === false) return { ok: false, reason: 'closed' }

  const conflicting = existing.filter((booking) => {
    if (request.excludeBookingId !== undefined && booking.id === request.excludeBookingId) {
      return false
    }
    if (!occupiesCapacity(booking.status)) return false
    return overlaps(request.interval, { start: booking.start, end: booking.end })
  })

  if (conflicting.length >= config.capacity) {
    return {
      ok: false,
      reason: 'at-capacity',
      detail: { capacity: config.capacity, taken: conflicting.length },
    }
  }

  return { ok: true }
}

/**
 * Wording for a customer, in both languages.
 *
 * Kept beside the reasons so adding one to `UNAVAILABLE_REASONS` without a
 * message fails to compile rather than rendering a blank.
 */
const MESSAGES: Record<UnavailableReason, Record<Locale, string>> = {
  'invalid-interval': {
    en: 'Those dates do not make sense. Please check them and try again.',
    ar: 'التواريخ غير صحيحة. يرجى التحقق منها والمحاولة مرة أخرى.',
    fr: 'Ces dates ne sont pas cohérentes. Vérifiez-les et réessayez.',
    es: 'Esas fechas no tienen sentido. Revísalas e inténtalo de nuevo.',
    pt: 'Essas datas não fazem sentido. Confira e tente de novo.',
    ru: 'Эти даты не имеют смысла. Проверьте их и попробуйте ещё раз.',
    zh: '这些日期不合理，请检查后重试。',
    hi: 'ये तारीख़ें सही नहीं लगतीं। कृपया जाँचकर फिर कोशिश करें।',
    bn: 'তারিখগুলো ঠিক মিলছে না। দয়া করে যাচাই করে আবার চেষ্টা করুন।',
    ur: 'یہ تاریخیں درست نہیں لگتیں۔ براہِ کرم جانچ کر دوبارہ کوشش کریں۔',
  },
  'bookings-disabled': {
    en: 'This place does not take bookings through Vardenia yet.',
    ar: 'هذا المكان لا يستقبل الحجوزات عبر فاردينيا بعد.',
    fr: 'Ce lieu ne prend pas encore de réservations via Vardenia.',
    es: 'Este lugar todavía no acepta reservas a través de Vardenia.',
    pt: 'Este lugar ainda não aceita reservas pela Vardenia.',
    ru: 'Это место пока не принимает бронирования через Vardenia.',
    zh: '该地点目前尚未通过 Vardenia 接受预订。',
    hi: 'यह जगह अभी Vardenia के ज़रिए बुकिंग नहीं लेती।',
    bn: 'এই জায়গাটি এখনো Vardenia-র মাধ্যমে বুকিং নেয় না।',
    ur: 'یہ مقام ابھی Vardenia کے ذریعے بکنگ نہیں لیتا۔',
  },
  'in-the-past': {
    en: 'That time has already passed.',
    ar: 'لقد مضى هذا الوقت.',
    fr: 'Cet horaire est déjà passé.',
    es: 'Esa hora ya ha pasado.',
    pt: 'Esse horário já passou.',
    ru: 'Это время уже прошло.',
    zh: '该时间已经过去了。',
    hi: 'यह समय बीत चुका है।',
    bn: 'এই সময়টি পেরিয়ে গেছে।',
    ur: 'یہ وقت گزر چکا ہے۔',
  },
  'too-soon': {
    en: 'This place needs more notice than that.',
    ar: 'يحتاج هذا المكان إلى مهلة أطول.',
    fr: 'Ce lieu demande à être prévenu plus tôt.',
    es: 'Este lugar necesita más antelación.',
    pt: 'Este lugar precisa de mais antecedência.',
    ru: 'Здесь нужно бронировать заранее, а это слишком скоро.',
    zh: '该地点需要更早预订。',
    hi: 'इस जगह को इससे पहले बताना ज़रूरी है।',
    bn: 'এই জায়গাটির জন্য আরও আগে জানাতে হবে।',
    ur: 'اس مقام کو اس سے پہلے اطلاع درکار ہے۔',
  },
  'too-far-ahead': {
    en: 'Bookings are not open that far ahead yet.',
    ar: 'الحجوزات غير متاحة لهذه الفترة بعد.',
    fr: "Les réservations ne sont pas encore ouvertes aussi loin à l'avance.",
    es: 'Todavía no se aceptan reservas con tanta antelación.',
    pt: 'Ainda não há reservas abertas com tanta antecedência.',
    ru: 'Бронирование на такой срок вперёд пока не открыто.',
    zh: '暂不开放这么远的预订。',
    hi: 'इतनी आगे की बुकिंग अभी शुरू नहीं हुई है।',
    bn: 'এত আগের বুকিং এখনো খোলা হয়নি।',
    ur: 'اتنی آگے کی بکنگ ابھی شروع نہیں ہوئی۔',
  },
  'too-short': {
    en: 'That booking is too short.',
    ar: 'مدة الحجز قصيرة جدًا.',
    fr: 'Cette réservation est trop courte.',
    es: 'Esa reserva es demasiado corta.',
    pt: 'Essa reserva é curta demais.',
    ru: 'Это бронирование слишком короткое.',
    zh: '预订时长太短。',
    hi: 'यह बुकिंग बहुत छोटी है।',
    bn: 'বুকিংটি খুব ছোট।',
    ur: 'یہ بکنگ بہت مختصر ہے۔',
  },
  /**
   * Deliberately different from `closed`, which is the weekly timetable talking.
   * "Not open at that time" invites the reader to try an hour later and be
   * refused again; this one tells them to try another day.
   */
  'closed-period': {
    en: 'This place is closed on that date. Please try another day.',
    ar: 'هذا المكان مغلق في ذلك التاريخ. يرجى اختيار يوم آخر.',
    fr: 'Ce lieu est fermé à cette date. Essayez un autre jour.',
    es: 'Este lugar está cerrado ese día. Prueba otro día.',
    pt: 'Este lugar está fechado nessa data. Tente outro dia.',
    ru: 'В этот день место закрыто. Попробуйте другой день.',
    zh: '该地点在那天不营业，请换一天试试。',
    hi: 'यह जगह उस तारीख़ को बंद है। कृपया कोई और दिन चुनें।',
    bn: 'এই জায়গাটি সেই তারিখে বন্ধ। অন্য কোনো দিন চেষ্টা করুন।',
    ur: 'یہ مقام اس تاریخ کو بند ہے۔ براہِ کرم کوئی اور دن آزمائیں۔',
  },
  'too-long': {
    en: 'That booking is too long.',
    ar: 'مدة الحجز طويلة جدًا.',
    fr: 'Cette réservation est trop longue.',
    es: 'Esa reserva es demasiado larga.',
    pt: 'Essa reserva é longa demais.',
    ru: 'Это бронирование слишком длинное.',
    zh: '预订时长太长。',
    hi: 'यह बुकिंग बहुत लंबी है।',
    bn: 'বুকিংটি খুব দীর্ঘ।',
    ur: 'یہ بکنگ بہت طویل ہے۔',
  },
  'party-too-small': {
    en: 'Please enter how many people are coming.',
    ar: 'يرجى إدخال عدد الأشخاص.',
    fr: 'Indiquez combien de personnes viendront.',
    es: 'Indica cuántas personas vendrán.',
    pt: 'Informe quantas pessoas vão.',
    ru: 'Укажите, сколько будет гостей.',
    zh: '请填写到场人数。',
    hi: 'कृपया बताएँ कि कितने लोग आ रहे हैं।',
    bn: 'কতজন আসছেন তা লিখুন।',
    ur: 'براہِ کرم بتائیں کہ کتنے لوگ آ رہے ہیں۔',
  },
  'party-too-large': {
    en: 'That is more people than this place can take at once.',
    ar: 'هذا العدد أكبر مما يمكن لهذا المكان استقباله في وقت واحد.',
    fr: "C'est plus de personnes que ce lieu ne peut en accueillir à la fois.",
    es: 'Son más personas de las que este lugar puede recibir a la vez.',
    pt: 'São mais pessoas do que este lugar consegue receber de uma vez.',
    ru: 'Это больше гостей, чем место может принять одновременно.',
    zh: '人数超过了该地点一次能接待的上限。',
    hi: 'यह जगह एक साथ इतने लोगों को नहीं ले सकती।',
    bn: 'এই জায়গাটি একসঙ্গে এতজনকে জায়গা দিতে পারে না।',
    ur: 'یہ مقام ایک ساتھ اتنے لوگوں کو نہیں لے سکتا۔',
  },
  closed: {
    en: 'This place is closed at that time.',
    ar: 'هذا المكان مغلق في ذلك الوقت.',
    fr: 'Ce lieu est fermé à cette heure-là.',
    es: 'Este lugar está cerrado a esa hora.',
    pt: 'Este lugar está fechado nesse horário.',
    ru: 'В это время место закрыто.',
    zh: '该地点在这个时间不营业。',
    hi: 'यह जगह उस समय बंद रहती है।',
    bn: 'এই জায়গাটি সেই সময় বন্ধ থাকে।',
    ur: 'یہ مقام اس وقت بند ہوتا ہے۔',
  },
  'at-capacity': {
    en: 'This place is fully booked at that time.',
    ar: 'هذا المكان محجوز بالكامل في ذلك الوقت.',
    fr: 'Ce lieu est complet à cette heure-là.',
    es: 'Este lugar está completo a esa hora.',
    pt: 'Este lugar está lotado nesse horário.',
    ru: 'На это время всё уже забронировано.',
    zh: '该地点在这个时间已订满。',
    hi: 'इस समय यह जगह पूरी तरह बुक है।',
    bn: 'এই সময়ে জায়গাটি পুরোপুরি বুক করা।',
    ur: 'اس وقت یہ مقام مکمل طور پر بک ہے۔',
  },
}

export function unavailableMessage(reason: UnavailableReason, locale: Locale = 'en'): string {
  return MESSAGES[reason][locale] ?? MESSAGES[reason].en
}
