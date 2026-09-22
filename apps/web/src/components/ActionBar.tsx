import { getTranslations } from 'next-intl/server'
import { mapsLink } from '../lib/maps-link'

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
 * The link goes to Google Maps rather than an embedded map. A hosted map costs
 * a tile subscription and shows nothing without coordinates, while a link needs
 * neither and lands the reader in the app their phone already navigates with.
 * See lib/maps-link for how the destination is built when a listing has no
 * coordinates, which is currently all of them.
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
  /** The listing's address line, used to find it when there are no coordinates. */
  address?: string | null
  /** Localized place name, e.g. "Achrafieh, Beirut", to disambiguate a chain. */
  place?: string | null
}

export async function ActionBar({ coordinates, name, address, place }: Props) {
  const t = await getTranslations('directory')

  const directions = mapsLink({ name, address, place, coordinates })

  return (
    <div className="flex flex-wrap gap-3" aria-label={`Actions for ${name}`}>
      <a href={directions} className={PRIMARY} target="_blank" rel="noopener noreferrer">
        {t('getDirections')}
      </a>
    </div>
  )
}

/**
 * Square, and cedar rather than near-black.
 *
 * It sits on the listing page directly under a masthead in the brand navy, and
 * a rounded near-black pill there read as a control borrowed from another site.
 * `ink.900` and `cedar.900` are a few points apart in darkness and far apart in
 * hue, which is exactly the pairing that looks like a mistake rather than a
 * choice - the same reason ui/FilterChip stopped using two darks.
 */
const PRIMARY =
  'inline-flex items-center justify-center bg-cedar-900 px-6 py-3.5 text-sm font-semibold text-surface-base transition-colors hover:bg-gold-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500'
