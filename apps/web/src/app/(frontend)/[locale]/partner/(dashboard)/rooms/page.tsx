import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { dataLocale, isLocale } from '@vardenia/i18n'
import config from '../../../../../../payload.config'
import { currentOwner, ownerListings } from '../../../../../../lib/session'
import { resolvePhotograph } from '../../../../../../lib/media'
import {
  RoomTypesManager,
  type ManagedRoomType,
} from '../../../../../../components/rooms/RoomTypesManager'

/**
 * Where a partner manages their hotel's room types (17 November 2026).
 *
 * Read on the server with access overridden but limited to the partner's own
 * listings; written from the browser through Payload's REST API, where the
 * room types collection's access rules and guardRoomTypeWrite check the hotel
 * again, the same way closed dates work.
 */

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'partnerRooms' })
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function PartnerRoomsPage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const owner = await currentOwner()
  if (!owner) notFound()

  const hotels = (await ownerListings()).filter((listing) => listing.hasRooms)
  const payload = await getPayload({ config })
  const result =
    hotels.length === 0
      ? { docs: [] }
      : await payload.find({
          collection: 'room-types',
          depth: 1,
          limit: 200,
          pagination: false,
          overrideAccess: true,
          locale: dataLocale(locale),
          sort: 'order',
          where: { business: { in: hotels.map((hotel) => hotel.id) } },
        })

  const roomTypes: ManagedRoomType[] = result.docs.map((doc) => {
    const d = doc as unknown as Record<string, unknown>
    const business = d.business
    const photos = (Array.isArray(d.photos) ? d.photos : []).flatMap((photo) => {
      const image = resolvePhotograph(photo as never, 'thumbnail')
      const id = (photo as { id?: unknown })?.id ?? photo
      return image && (typeof id === 'number' || typeof id === 'string')
        ? [{ id: Number(id), src: image.src }]
        : []
    })
    return {
      id: Number(d.id),
      business: Number(
        typeof business === 'object' && business !== null
          ? (business as { id: unknown }).id
          : business,
      ),
      name: String(d.name ?? ''),
      kind: d.kind === 'suite' ? 'suite' : 'room',
      description: String(d.description ?? ''),
      beds: String(d.beds ?? ''),
      sizeM2: typeof d.sizeM2 === 'number' ? d.sizeM2 : null,
      rooms: Number(d.rooms ?? 1),
      sleepsAdults: Number(d.sleepsAdults ?? 2),
      sleepsChildren: Number(d.sleepsChildren ?? 0),
      views: Array.isArray(d.views) ? (d.views as string[]) : [],
      amenities: Array.isArray(d.amenities) ? (d.amenities as string[]) : [],
      photos,
      options: (Array.isArray(d.options) ? (d.options as Record<string, unknown>[]) : []).map(
        (option) => ({
          id: String(option.id ?? ''),
          breakfast: option.breakfast === true,
          cancellation: option.cancellation === 'non-refundable' ? 'non-refundable' : 'free',
          freeCancellationDays: Number(option.freeCancellationDays ?? 1),
          payment: option.payment === 'in-advance' ? 'in-advance' : 'at-property',
          price: typeof option.price === 'number' ? option.price : null,
        }),
      ),
      active: d.active !== false,
      order: Number(d.order ?? 0),
    }
  })

  return (
    <RoomTypesManager
      locale={locale}
      hotels={hotels.map((hotel) => ({ id: hotel.id, name: hotel.name }))}
      initial={roomTypes}
    />
  )
}
