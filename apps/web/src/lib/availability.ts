import {
  durationMinutes,
  isUsableInterval,
  occupiesCapacity,
  overlaps,
  type BookingStatus,
  type Interval,
} from '@vardenia/core/booking'
import { isOpenNow, type OpeningHour } from './hours'
import { addDays, beirutDate } from './beirut'
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
  // Room bookings at hotels with room types (lib/room-availability).
  'no-rooms-chosen',
  'room-unknown',
  'rooms-full',
  'rooms-too-small',
  // A guest house booked as a whole property (lib/stay-booking, Task 6).
  'below-min-nights',
  // Quoting a price (core/price-quote, Task 7). Shown with a quote, and the
  // first three refuse a booking; 'no-price' never does (no snapshot is kept).
  'invalid-input',
  'unknown-package',
  'inactive-package',
  'no-price',
  // A restaurant with seating areas (core/seating, Task 8).
  'area-required',
  'area-unknown',
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
  /** "HH:MM". For hotels with room types; see fields/bookingRules. */
  checkInTime?: string | null
  checkOutTime?: string | null
}

/** An existing booking, reduced to what the check actually needs. */
export interface ExistingBooking {
  start: Date
  end: Date
  status: BookingStatus
  /** Excluded from the capacity count, so editing a booking does not conflict with itself. */
  id?: string | number
  /**
   * The restaurant seating area it holds (core/seating, Task 8), or null. Only
   * read at a listing with seating areas (lib/seating-booking).
   */
  area?: string | null
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

const MINUTES_PER_DAY = 1440

/** Nights between two instants: how many Beirut midnights the stay crosses. */
function nightsBetween(start: Date, end: Date): number {
  const days = (Date.parse(beirutDate(end)) - Date.parse(beirutDate(start))) / 86_400_000
  return Math.max(0, Math.round(days))
}

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

  /**
   * A stay is measured in nights, not hours.
   *
   * A place whose shortest booking is a day or more sells nights (the same
   * threshold the Book form uses to ask for them), and one night runs from
   * check-in at 15:00 to check-out at 11:00: twenty hours. Measured by the
   * clock, every one-night stay was refused as shorter than the 24-hour
   * minimum, while the form kept offering "1 night". So a stay counts as the
   * number of Beirut nights it spans, each worth a full day.
   */
  const counted =
    config.minDurationMinutes >= MINUTES_PER_DAY
      ? nightsBetween(start, request.interval.end) * MINUTES_PER_DAY
      : minutes

  if (counted < config.minDurationMinutes) {
    return { ok: false, reason: 'too-short', detail: { minMinutes: config.minDurationMinutes } }
  }
  if (counted > config.maxDurationMinutes) {
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
    const [firstDay, lastDay] = occupiedDays(start, request.interval.end)
    const shut = closures.some(
      (period) =>
        isCalendarDay(period.startsOn) &&
        isCalendarDay(period.endsOn) &&
        period.startsOn <= lastDay &&
        period.endsOn >= firstDay,
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
  'no-rooms-chosen': {
    en: 'Choose at least one room.',
    ar: 'اختر غرفة واحدة على الأقل.',
    fr: 'Choisissez au moins une chambre.',
    es: 'Elige al menos una habitación.',
    pt: 'Escolha pelo menos um quarto.',
    ru: 'Выберите хотя бы один номер.',
    zh: '请至少选择一间客房。',
    hi: 'कम से कम एक कमरा चुनें।',
    bn: 'অন্তত একটি রুম বেছে নিন।',
    ur: 'کم از کم ایک کمرہ منتخب کریں۔',
  },
  'room-unknown': {
    en: 'One of those rooms is no longer offered. Please reload the page and choose again.',
    ar: 'إحدى هذه الغرف لم تعد متاحة. يرجى إعادة تحميل الصفحة والاختيار من جديد.',
    fr: "L'une de ces chambres n'est plus proposée. Rechargez la page et choisissez à nouveau.",
    es: 'Una de esas habitaciones ya no se ofrece. Recarga la página y elige de nuevo.',
    pt: 'Um desses quartos não está mais disponível. Recarregue a página e escolha de novo.',
    ru: 'Один из этих номеров больше не предлагается. Обновите страницу и выберите снова.',
    zh: '其中一间客房已不再提供，请刷新页面重新选择。',
    hi: 'इनमें से एक कमरा अब उपलब्ध नहीं है। पेज दोबारा लोड करके फिर चुनें।',
    bn: 'এর একটি রুম আর দেওয়া হচ্ছে না। পেজটি আবার লোড করে বেছে নিন।',
    ur: 'ان میں سے ایک کمرہ اب دستیاب نہیں۔ صفحہ دوبارہ لوڈ کر کے پھر منتخب کریں۔',
  },
  'rooms-full': {
    en: 'There are not enough of those rooms left for those dates.',
    ar: 'لم يتبقَّ عدد كافٍ من هذه الغرف في هذه التواريخ.',
    fr: 'Il ne reste pas assez de ces chambres pour ces dates.',
    es: 'No quedan suficientes habitaciones de ese tipo para esas fechas.',
    pt: 'Não restam quartos suficientes desse tipo para essas datas.',
    ru: 'На эти даты таких номеров осталось недостаточно.',
    zh: '这些日期剩余的该类客房不足。',
    hi: 'उन तारीख़ों के लिए ऐसे कमरे पर्याप्त नहीं बचे हैं।',
    bn: 'ওই তারিখগুলোতে এই রুম যথেষ্ট বাকি নেই।',
    ur: 'ان تاریخوں کے لیے ایسے کمرے کافی نہیں بچے۔',
  },
  'rooms-too-small': {
    en: 'Those rooms do not sleep that many guests. Add a room or choose a bigger one.',
    ar: 'هذه الغرف لا تتسع لهذا العدد من الضيوف. أضف غرفة أو اختر غرفة أكبر.',
    fr: "Ces chambres n'accueillent pas autant de personnes. Ajoutez une chambre ou choisissez-en une plus grande.",
    es: 'Esas habitaciones no alojan a tantos huéspedes. Añade una habitación o elige una más grande.',
    pt: 'Esses quartos não acomodam tantos hóspedes. Adicione um quarto ou escolha um maior.',
    ru: 'В этих номерах нельзя разместить столько гостей. Добавьте номер или выберите больший.',
    zh: '这些客房容纳不下这么多客人，请增加客房或选择更大的房型。',
    hi: 'इन कमरों में इतने मेहमान नहीं ठहर सकते। एक कमरा जोड़ें या बड़ा कमरा चुनें।',
    bn: 'এই রুমগুলোতে এতজন অতিথি থাকতে পারবেন না। আরেকটি রুম যোগ করুন বা বড় রুম বেছে নিন।',
    ur: 'ان کمروں میں اتنے مہمان نہیں ٹھہر سکتے۔ ایک کمرہ شامل کریں یا بڑا کمرہ منتخب کریں۔',
  },
  'below-min-nights': {
    en: 'That stay is shorter than the minimum number of nights here. Please choose more nights.',
    ar: 'مدة الإقامة أقصر من الحد الأدنى لعدد الليالي هنا. يرجى اختيار ليالٍ أكثر.',
    fr: 'Ce séjour est plus court que le nombre minimum de nuits ici. Choisissez plus de nuits.',
    es: 'Esa estancia es más corta que el mínimo de noches aquí. Elige más noches.',
    pt: 'Essa estadia é mais curta do que o mínimo de noites aqui. Escolha mais noites.',
    ru: 'Это проживание короче минимального числа ночей здесь. Выберите больше ночей.',
    zh: '入住时间少于这里的最少晚数，请选择更多晚。',
    hi: 'यह ठहराव यहाँ की न्यूनतम रातों से छोटा है। कृपया ज़्यादा रातें चुनें।',
    bn: 'এই থাকা এখানকার ন্যূনতম রাতের চেয়ে কম। দয়া করে আরও রাত বেছে নিন।',
    ur: 'یہ قیام یہاں کی کم از کم راتوں سے کم ہے۔ براہِ کرم زیادہ راتیں منتخب کریں۔',
  },
  'invalid-input': {
    en: 'Those details do not look right. Please check the dates and the number of guests.',
    ar: 'هذه التفاصيل غير صحيحة. يرجى التحقق من التواريخ وعدد الضيوف.',
    fr: 'Ces informations ne semblent pas correctes. Vérifiez les dates et le nombre de personnes.',
    es: 'Esos datos no parecen correctos. Revisa las fechas y el número de huéspedes.',
    pt: 'Esses dados não parecem corretos. Confira as datas e o número de hóspedes.',
    ru: 'Эти данные выглядят неверно. Проверьте даты и число гостей.',
    zh: '这些信息似乎不正确，请检查日期和客人人数。',
    hi: 'ये विवरण सही नहीं लगते। कृपया तारीख़ें और मेहमानों की संख्या जाँचें।',
    bn: 'এই তথ্যগুলো ঠিক মনে হচ্ছে না। দয়া করে তারিখ ও অতিথির সংখ্যা যাচাই করুন।',
    ur: 'یہ تفصیلات درست نہیں لگتیں۔ براہِ کرم تاریخیں اور مہمانوں کی تعداد جانچیں۔',
  },
  'unknown-package': {
    en: 'That package is not offered here. Please choose another one, or book without a package.',
    ar: 'هذه الباقة غير متوفرة هنا. يرجى اختيار باقة أخرى أو الحجز من دون باقة.',
    fr: "Cette formule n'est pas proposée ici. Choisissez-en une autre ou réservez sans formule.",
    es: 'Ese paquete no se ofrece aquí. Elige otro o reserva sin paquete.',
    pt: 'Esse pacote não é oferecido aqui. Escolha outro ou reserve sem pacote.',
    ru: 'Этот пакет здесь не предлагается. Выберите другой или бронируйте без пакета.',
    zh: '这里不提供该套餐，请选择其他套餐，或不选套餐直接预订。',
    hi: 'यह पैकेज यहाँ उपलब्ध नहीं है। कृपया दूसरा पैकेज चुनें या बिना पैकेज के बुक करें।',
    bn: 'এই প্যাকেজটি এখানে দেওয়া হয় না। দয়া করে অন্য একটি বেছে নিন, অথবা প্যাকেজ ছাড়া বুক করুন।',
    ur: 'یہ پیکج یہاں دستیاب نہیں۔ براہِ کرم کوئی اور پیکج منتخب کریں یا پیکج کے بغیر بک کریں۔',
  },
  'inactive-package': {
    en: 'That package is no longer offered. Please choose another one, or book without a package.',
    ar: 'لم تعد هذه الباقة متوفرة. يرجى اختيار باقة أخرى أو الحجز من دون باقة.',
    fr: "Cette formule n'est plus proposée. Choisissez-en une autre ou réservez sans formule.",
    es: 'Ese paquete ya no se ofrece. Elige otro o reserva sin paquete.',
    pt: 'Esse pacote não é mais oferecido. Escolha outro ou reserve sem pacote.',
    ru: 'Этот пакет больше не предлагается. Выберите другой или бронируйте без пакета.',
    zh: '该套餐已不再提供，请选择其他套餐，或不选套餐直接预订。',
    hi: 'यह पैकेज अब उपलब्ध नहीं है। कृपया दूसरा पैकेज चुनें या बिना पैकेज के बुक करें।',
    bn: 'এই প্যাকেজটি আর দেওয়া হয় না। দয়া করে অন্য একটি বেছে নিন, অথবা প্যাকেজ ছাড়া বুক করুন।',
    ur: 'یہ پیکج اب دستیاب نہیں۔ براہِ کرم کوئی اور پیکج منتخب کریں یا پیکج کے بغیر بک کریں۔',
  },
  'no-price': {
    en: 'This place has not set a price for this stay yet. You can still book, and the venue will confirm the price.',
    ar: 'لم يحدّد هذا المكان سعرًا لهذه الإقامة بعد. يمكنك الحجز مع ذلك، وسيؤكّد المكان السعر.',
    fr: "Ce lieu n'a pas encore fixé de prix pour ce séjour. Vous pouvez tout de même réserver ; l'établissement confirmera le prix.",
    es: 'Este lugar aún no ha fijado un precio para esta estancia. Puedes reservar igualmente y el alojamiento confirmará el precio.',
    pt: 'Este lugar ainda não definiu um preço para esta estadia. Você pode reservar mesmo assim, e o local confirmará o preço.',
    ru: 'Это место ещё не указало цену за такое проживание. Вы всё равно можете забронировать, а цену подтвердит заведение.',
    zh: '该场所尚未为此次入住设定价格。您仍可预订，价格将由商家确认。',
    hi: 'इस जगह ने इस ठहराव की कीमत अभी तय नहीं की है। आप फिर भी बुक कर सकते हैं, और जगह कीमत की पुष्टि करेगी।',
    bn: 'এই জায়গাটি এখনও এই থাকার দাম ঠিক করেনি। আপনি তবুও বুক করতে পারেন, আর জায়গাটি দাম নিশ্চিত করবে।',
    ur: 'اس جگہ نے ابھی اس قیام کی قیمت طے نہیں کی۔ آپ پھر بھی بک کر سکتے ہیں، اور جگہ قیمت کی تصدیق کرے گی۔',
  },
  'area-required': {
    en: 'Please choose where you would like to sit.',
    ar: 'يرجى اختيار المكان الذي تودّ الجلوس فيه.',
    fr: 'Choisissez où vous souhaitez être placé.',
    es: 'Elige dónde te gustaría sentarte.',
    pt: 'Escolha onde você gostaria de se sentar.',
    ru: 'Выберите, где вы хотели бы сидеть.',
    zh: '请选择您想坐的区域。',
    hi: 'कृपया चुनें कि आप कहाँ बैठना चाहेंगे।',
    bn: 'আপনি কোথায় বসতে চান তা বেছে নিন।',
    ur: 'براہِ کرم منتخب کریں کہ آپ کہاں بیٹھنا چاہیں گے۔',
  },
  'area-unknown': {
    en: 'That seating area is not offered here. Please reload the page and choose again.',
    ar: 'منطقة الجلوس هذه غير متوفرة هنا. يرجى إعادة تحميل الصفحة والاختيار من جديد.',
    fr: "Cet espace n'est pas proposé ici. Rechargez la page et choisissez à nouveau.",
    es: 'Esa zona no se ofrece aquí. Recarga la página y elige de nuevo.',
    pt: 'Essa área não é oferecida aqui. Recarregue a página e escolha de novo.',
    ru: 'Такой зоны здесь нет. Обновите страницу и выберите снова.',
    zh: '这里不提供该座位区，请刷新页面重新选择。',
    hi: 'यह बैठने की जगह यहाँ उपलब्ध नहीं है। पेज दोबारा लोड करके फिर चुनें।',
    bn: 'এই বসার জায়গাটি এখানে নেই। পেজটি আবার লোড করে বেছে নিন।',
    ur: 'بیٹھنے کی یہ جگہ یہاں دستیاب نہیں۔ صفحہ دوبارہ لوڈ کر کے پھر منتخب کریں۔',
  },
}

export function unavailableMessage(reason: UnavailableReason, locale: Locale = 'en'): string {
  return MESSAGES[reason][locale] ?? MESSAGES[reason].en
}

/**
 * The Beirut days a booking holds the venue, first and last, as "YYYY-MM-DD".
 *
 * A stay holds every night from check-in to the night before check-out: a
 * guest arriving on the 10th and leaving on the 14th needs the venue open on
 * the 10th to the 13th, not only on the 10th. Checking the arrival day alone
 * let a stay start just before a closed fortnight and run straight through it.
 *
 * A booking within one day - or one that runs past midnight, a dinner from
 * 23:00 to 01:00 - holds only the day it starts.
 */
export function occupiedDays(start: Date, end: Date): [string, string] {
  const firstDay = beirutDate(start)
  const endDay = beirutDate(end)
  const lastNight = addDays(endDay, -1)
  return [firstDay, endDay > firstDay && lastNight > firstDay ? lastNight : firstDay]
}
