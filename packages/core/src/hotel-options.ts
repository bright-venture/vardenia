import { canHaveRoomTypes } from './taxonomy'
import type { Labelled } from './attributes'

/**
 * What a hotel offers, in the words Booking.com uses (Task 5, 20 November 2026).
 *
 * NOTE FOR THE TECH LEAD: Booking.com's share page could not be read when this
 * was written, so these lists follow Booking.com's standard facility names from
 * memory and need your confirmation before they go live.
 *
 * # Room options
 *
 * Views and in-room amenities of a room type (collections/RoomTypes.ts). Every
 * slug that existed before is kept, in its old order (Payload derives a
 * Postgres enum from the order). Where the new list named something the old one
 * already had under another slug (sea-view / sea, free-wifi / wifi,
 * flat-screen-tv / tv, desk / work-desk, private-kitchenette / kitchenette) the
 * old slug stays and the new one is not added, so a hotel never sees two
 * checkboxes for one thing. The room size in m2 is its own number field.
 *
 * # Hotel facilities
 *
 * `facilities` is everything the hotel has, `popularFacilities` the few it
 * wants shown first (a subset, at most 8), `propertyHighlights` the headline
 * strengths (at most 6). All three are public and only valid on a listing that
 * can have room types (canHaveRoomTypes: hotels only since Task 6; a getaway
 * has its own `features` instead, core/stay).
 *
 * # Prices
 *
 * USD per night, on each room option; see validPrice and fromPrice.
 */

export const ROOM_VIEWS: readonly Labelled[] = [
  { slug: 'sea', en: 'Sea view', ar: 'إطلالة على البحر' },
  { slug: 'mountain', en: 'Mountain view', ar: 'إطلالة على الجبل' },
  { slug: 'city', en: 'City view', ar: 'إطلالة على المدينة' },
  { slug: 'garden', en: 'Garden view', ar: 'إطلالة على الحديقة' },
  { slug: 'pool', en: 'Pool view', ar: 'إطلالة على المسبح' },
  { slug: 'landmark-view', en: 'Landmark view', ar: 'إطلالة على معلم سياحي' },
]

export const ROOM_AMENITIES: readonly Labelled[] = [
  // The fourteen that existed before, in their enum order.
  { slug: 'private-bathroom', en: 'Private bathroom', ar: 'حمام خاص' },
  { slug: 'balcony', en: 'Balcony', ar: 'شرفة' },
  { slug: 'kitchenette', en: 'Private kitchenette', ar: 'مطبخ صغير خاص' },
  { slug: 'air-conditioning', en: 'Air conditioning', ar: 'تكييف' },
  { slug: 'heating', en: 'Heating', ar: 'تدفئة' },
  { slug: 'wifi', en: 'Free WiFi', ar: 'واي فاي مجاني' },
  { slug: 'tv', en: 'Flat-screen TV', ar: 'تلفاز بشاشة مسطحة' },
  { slug: 'minibar', en: 'Minibar', ar: 'ميني بار' },
  { slug: 'coffee-machine', en: 'Coffee machine', ar: 'آلة قهوة' },
  { slug: 'bathtub', en: 'Bathtub', ar: 'حوض استحمام' },
  { slug: 'work-desk', en: 'Desk', ar: 'مكتب' },
  { slug: 'safe', en: 'Safe', ar: 'خزنة' },
  { slug: 'soundproofing', en: 'Soundproofing', ar: 'عزل صوتي' },
  { slug: 'fireplace', en: 'Fireplace', ar: 'مدفأة' },
  // New.
  { slug: 'shared-bathroom', en: 'Shared bathroom', ar: 'حمام مشترك' },
  { slug: 'shower', en: 'Shower', ar: 'دش' },
  { slug: 'terrace', en: 'Terrace', ar: 'تراس' },
  { slug: 'kettle', en: 'Kettle', ar: 'غلاية' },
  { slug: 'refrigerator', en: 'Refrigerator', ar: 'ثلاجة' },
  { slug: 'microwave', en: 'Microwave', ar: 'مايكروويف' },
  { slug: 'seating-area', en: 'Seating area', ar: 'منطقة جلوس' },
  { slug: 'dining-area', en: 'Dining area', ar: 'منطقة طعام' },
  { slug: 'sofa', en: 'Sofa', ar: 'أريكة' },
  { slug: 'wardrobe', en: 'Wardrobe', ar: 'خزانة ملابس' },
  { slug: 'hairdryer', en: 'Hairdryer', ar: 'مجفف شعر' },
  { slug: 'free-toiletries', en: 'Free toiletries', ar: 'أدوات استحمام مجانية' },
  { slug: 'bathrobes', en: 'Bathrobes', ar: 'أرواب حمام' },
  { slug: 'slippers', en: 'Slippers', ar: 'خفوف' },
  { slug: 'iron', en: 'Iron', ar: 'مكواة' },
  { slug: 'extra-bed-available', en: 'Extra bed available', ar: 'سرير إضافي متاح' },
  { slug: 'crib-available', en: 'Crib available', ar: 'سرير أطفال متاح' },
]

export const HOTEL_FACILITIES: readonly Labelled[] = [
  { slug: 'free-wifi', en: 'Free WiFi', ar: 'واي فاي مجاني' },
  { slug: 'parking-free', en: 'Free parking', ar: 'موقف سيارات مجاني' },
  { slug: 'parking-paid', en: 'Paid parking', ar: 'موقف سيارات مدفوع' },
  { slug: 'airport-shuttle', en: 'Airport shuttle', ar: 'خدمة نقل من وإلى المطار' },
  { slug: 'family-rooms', en: 'Family rooms', ar: 'غرف عائلية' },
  { slug: 'non-smoking-rooms', en: 'Non-smoking rooms', ar: 'غرف لغير المدخنين' },
  { slug: 'restaurant', en: 'Restaurant', ar: 'مطعم' },
  { slug: 'bar', en: 'Bar', ar: 'بار' },
  { slug: '24h-front-desk', en: '24-hour front desk', ar: 'مكتب استقبال على مدار الساعة' },
  { slug: 'room-service', en: 'Room service', ar: 'خدمة الغرف' },
  { slug: 'fitness-centre', en: 'Fitness centre', ar: 'مركز لياقة بدنية' },
  { slug: 'spa-wellness', en: 'Spa and wellness centre', ar: 'سبا ومركز عافية' },
  { slug: 'outdoor-pool', en: 'Outdoor pool', ar: 'مسبح خارجي' },
  { slug: 'indoor-pool', en: 'Indoor pool', ar: 'مسبح داخلي' },
  { slug: 'pets-allowed', en: 'Pets allowed', ar: 'يسمح بالحيوانات الأليفة' },
  {
    slug: 'accessible',
    en: 'Facilities for disabled guests',
    ar: 'تسهيلات لذوي الاحتياجات الخاصة',
  },
  { slug: 'breakfast', en: 'Breakfast', ar: 'فطور' },
  { slug: 'terrace', en: 'Terrace', ar: 'تراس' },
  { slug: 'garden', en: 'Garden', ar: 'حديقة' },
  { slug: 'beachfront', en: 'Beachfront', ar: 'على الشاطئ مباشرة' },
  { slug: 'ev-charging', en: 'Electric vehicle charging', ar: 'شحن السيارات الكهربائية' },
  { slug: 'laundry', en: 'Laundry', ar: 'غسيل الملابس' },
  { slug: 'business-centre', en: 'Business centre', ar: 'مركز أعمال' },
  { slug: 'meeting-rooms', en: 'Meeting rooms', ar: 'قاعات اجتماعات' },
  { slug: 'kids-club', en: 'Kids club', ar: 'نادي أطفال' },
  { slug: 'babysitting', en: 'Babysitting', ar: 'رعاية أطفال' },
  { slug: 'currency-exchange', en: 'Currency exchange', ar: 'صرف العملات' },
  { slug: 'luggage-storage', en: 'Luggage storage', ar: 'تخزين الأمتعة' },
  { slug: 'concierge', en: 'Concierge', ar: 'خدمة الكونسيرج' },
  { slug: 'bbq', en: 'BBQ facilities', ar: 'مرافق شواء' },
  { slug: 'elevator', en: 'Elevator', ar: 'مصعد' },
  { slug: 'heating', en: 'Heating', ar: 'تدفئة' },
  {
    slug: 'air-conditioning-public',
    en: 'Air conditioning in public areas',
    ar: 'تكييف في الأماكن العامة',
  },
]

export const PROPERTY_HIGHLIGHTS: readonly Labelled[] = [
  { slug: 'parking', en: 'Parking', ar: 'موقف سيارات' },
  { slug: 'wellness', en: 'Wellness', ar: 'عافية' },
  { slug: 'breakfast', en: 'Breakfast', ar: 'فطور' },
  { slug: 'pool', en: 'Pool', ar: 'مسبح' },
  { slug: 'beachfront', en: 'Beachfront', ar: 'على الشاطئ مباشرة' },
  { slug: 'mountain-view', en: 'Mountain view', ar: 'إطلالة جبلية' },
  { slug: 'city-centre', en: 'City centre', ar: 'وسط المدينة' },
  { slug: 'family-friendly', en: 'Family friendly', ar: 'مناسب للعائلات' },
  { slug: 'romantic', en: 'Romantic', ar: 'رومانسي' },
  { slug: 'business-friendly', en: 'Business friendly', ar: 'مناسب لرجال الأعمال' },
  { slug: 'pet-friendly', en: 'Pet friendly', ar: 'يسمح بالحيوانات الأليفة' },
  { slug: 'quiet-location', en: 'Quiet location', ar: 'موقع هادئ' },
]

export const MAX_POPULAR_FACILITIES = 8
export const MAX_PROPERTY_HIGHLIGHTS = 6

const toOptions = (list: readonly Labelled[]) => list.map((o) => ({ label: o.en, value: o.slug }))

/** Payload `options`, so the collections and the labels cannot drift apart. */
export const roomViewOptions = toOptions(ROOM_VIEWS)
export const roomAmenityOptions = toOptions(ROOM_AMENITIES)
export const hotelFacilityOptions = toOptions(HOTEL_FACILITIES)
export const propertyHighlightOptions = toOptions(PROPERTY_HIGHLIGHTS)

/** The label of a room view or in-room amenity, in this language; the slug if unknown. */
export function roomOptionLabel(slug: string, locale: string): string {
  const found = [...ROOM_VIEWS, ...ROOM_AMENITIES].find((o) => o.slug === slug)
  if (!found) return slug
  return locale === 'ar' ? found.ar : found.en
}

/** A price per night in USD: a number, 0 or more, at most two decimals. Optional. */
export function validPrice(value: unknown): true | string {
  if (value === null || value === undefined) return true
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'The price must be a number.'
  if (value < 0) return 'The price cannot be negative.'
  if (Math.abs(Math.round(value * 100) - value * 100) > 1e-6) {
    return 'The price can have at most two decimals.'
  }
  return true
}

/**
 * The lowest price among a room type's options, for "from $70".
 * Room options have no switch of their own; the room type has, so the caller
 * passes the options of active room types only. An option with no price is
 * ignored; a price of 0 counts. Null when no option has a price.
 */
export function fromPrice(
  options: readonly { price?: number | null }[] | null | undefined,
): number | null {
  let lowest: number | null = null
  for (const option of options ?? []) {
    const price = option.price
    if (typeof price !== 'number' || !Number.isFinite(price)) continue
    if (lowest === null || price < lowest) lowest = price
  }
  return lowest
}

interface FacilityInput {
  subcategories?: readonly (string | null | undefined)[] | null
  facilities?: readonly string[] | null
  popularFacilities?: readonly string[] | null
  propertyHighlights?: readonly string[] | null
}

/**
 * Why these facility picks cannot be saved, or null when they can.
 * Only a listing that can have room types (hotels) may have any;
 * popular facilities must all be in the full list; and the caps hold.
 */
export function facilityProblem(input: FacilityInput): string | null {
  const facilities = input.facilities ?? []
  const popular = input.popularFacilities ?? []
  const highlights = input.propertyHighlights ?? []
  if (facilities.length + popular.length + highlights.length === 0) return null
  if (!canHaveRoomTypes(input.subcategories ?? [])) {
    return 'Facilities and highlights are only for hotels.'
  }
  if (popular.length > MAX_POPULAR_FACILITIES) {
    return `Choose at most ${MAX_POPULAR_FACILITIES} popular facilities.`
  }
  if (highlights.length > MAX_PROPERTY_HIGHLIGHTS) {
    return `Choose at most ${MAX_PROPERTY_HIGHLIGHTS} property highlights.`
  }
  const missing = popular.filter((slug) => !facilities.includes(slug))
  if (missing.length > 0) {
    return `Popular facilities must also be in the facilities list: ${missing.join(', ')}.`
  }
  return null
}
