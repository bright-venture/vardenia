import { getPayload } from 'payload'
import { dataLocale, type Locale } from '@vardenia/i18n'
import config from '../payload.config'
import { resolvePhotograph, type ResolvedImage } from './media'

/**
 * A hotel's room types as its page shows them: words, photos and options,
 * never prices (none on the website for now, decided 17 November 2026). The
 * rooms left are not here: the page is prerendered, and those are asked for
 * live from /booking/rooms once the guest picks dates.
 */
export interface RoomOptionView {
  id: string
  breakfast: boolean
  cancellation: 'free' | 'non-refundable'
  freeCancellationDays: number | null
  payment: 'at-property' | 'in-advance'
}

export interface RoomTypeView {
  id: number
  name: string
  kind: 'room' | 'suite'
  description: string
  beds: string
  sizeM2: number | null
  /** How many rooms of this type the hotel has. */
  rooms: number
  sleepsAdults: number
  sleepsChildren: number
  views: string[]
  amenities: string[]
  photos: ResolvedImage[]
  options: RoomOptionView[]
}

export async function listingRoomTypes(listingId: number, locale: Locale): Promise<RoomTypeView[]> {
  try {
    const payload = await getPayload({ config })
    const result = await payload.find({
      collection: 'room-types',
      depth: 1,
      limit: 50,
      pagination: false,
      overrideAccess: true,
      locale: dataLocale(locale),
      sort: 'order',
      where: { and: [{ business: { equals: listingId } }, { active: { equals: true } }] },
    })
    return result.docs.map((doc) => {
      const d = doc as unknown as Record<string, unknown>
      const photos = (Array.isArray(d.photos) ? d.photos : [])
        .map((photo) => resolvePhotograph(photo as never, 'card'))
        .filter((photo): photo is ResolvedImage => photo !== null)
      const options = (
        Array.isArray(d.options) ? (d.options as Record<string, unknown>[]) : []
      ).map((option): RoomOptionView => ({
        id: String(option.id ?? ''),
        breakfast: option.breakfast === true,
        cancellation: option.cancellation === 'non-refundable' ? 'non-refundable' : 'free',
        freeCancellationDays:
          typeof option.freeCancellationDays === 'number' ? option.freeCancellationDays : null,
        payment: option.payment === 'in-advance' ? 'in-advance' : 'at-property',
      }))
      return {
        id: Number(d.id),
        name: String(d.name ?? ''),
        kind: d.kind === 'suite' ? 'suite' : 'room',
        description: typeof d.description === 'string' ? d.description : '',
        beds: typeof d.beds === 'string' ? d.beds : '',
        sizeM2: typeof d.sizeM2 === 'number' ? d.sizeM2 : null,
        rooms: Number(d.rooms ?? 0),
        sleepsAdults: Number(d.sleepsAdults ?? 2),
        sleepsChildren: Number(d.sleepsChildren ?? 0),
        views: Array.isArray(d.views) ? (d.views as string[]) : [],
        amenities: Array.isArray(d.amenities) ? (d.amenities as string[]) : [],
        photos,
        options,
      }
    })
  } catch {
    return []
  }
}
