import { getTranslations } from 'next-intl/server'

/**
 * What a reader can actually do from a listing page.
 *
 * This used to be the commercial payload: call, WhatsApp, reserve, menu,
 * website. All of those routed the reader off Vardenia and, in the case of an
 * external reservation link, straight past the thing we are building. Bookings
 * happen here now, and a question goes through us rather than to a phone number
 * printed on a page - so the contact fields are gone from the collection
 * entirely, and this is what is left.
 *
 * Directions only, for the moment. It is the one action that cannot be served
 * on-site: someone who has just scanned a code in a lobby wants to know how to
 * get there, and no booking flow replaces a map.
 *
 * The booking button belongs here when Phase 3 lands, which is why this stays a
 * bar rather than collapsing into a single link at the call site.
 *
 * Plain anchors, no JavaScript: they work while the rest of the page is still
 * loading, which matters on a hotel's guest Wi-Fi.
 */

interface Props {
  coordinates?: [number, number] | null
  name: string
}

export async function ActionBar({ coordinates, name }: Props) {
  const t = await getTranslations('directory')

  // Payload stores points as [longitude, latitude]; Google Maps wants the
  // opposite order. Getting this backwards drops the pin in the wrong hemisphere.
  const directions = coordinates
    ? `https://www.google.com/maps/dir/?api=1&destination=${coordinates[1]},${coordinates[0]}`
    : null

  // A listing with no coordinates has nothing to offer here yet. Rendering an
  // empty bar would leave a gap in the page for no reason.
  if (!directions) return null

  return (
    <div className="flex flex-wrap gap-3" aria-label={`Actions for ${name}`}>
      <a href={directions} className={PRIMARY} target="_blank" rel="noopener noreferrer">
        {t('getDirections')}
      </a>
    </div>
  )
}

const PRIMARY =
  'inline-flex items-center justify-center rounded-md bg-ink-900 px-5 py-3 text-sm font-semibold text-surface-base transition-colors hover:bg-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500'
