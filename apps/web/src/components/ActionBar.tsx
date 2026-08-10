import { getTranslations } from 'next-intl/server'

/**
 * Call, directions, reserve.
 *
 * This is the commercial payload of a listing page. Someone has just scanned a
 * code in a magazine while standing in a lobby; these are the things they might
 * actually do next, and every one of them is a conversion the advertiser paid
 * for. Buttons only render when the underlying data exists, because a dead
 * "Reserve" button is worse than no button.
 *
 * Plain anchors, no JavaScript: they work while the rest of the page is still
 * loading, which matters on a hotel's guest Wi-Fi.
 */

interface Props {
  phone?: string | null
  whatsapp?: string | null
  website?: string | null
  reservationUrl?: string | null
  menuUrl?: string | null
  coordinates?: [number, number] | null
  name: string
}

/** wa.me wants digits only, no plus, spaces or dashes. */
const digitsOnly = (value: string) => value.replace(/\D/g, '')

const PRIMARY =
  'inline-flex items-center justify-center rounded-md bg-ink-900 px-5 py-3 text-sm font-semibold text-surface-base transition-colors hover:bg-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500'

const SECONDARY =
  'inline-flex items-center justify-center rounded-md border border-ink-100 px-5 py-3 text-sm font-semibold text-ink-900 transition-colors hover:border-ink-300 hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500'

export async function ActionBar({
  phone,
  whatsapp,
  website,
  reservationUrl,
  menuUrl,
  coordinates,
  name,
}: Props) {
  const t = await getTranslations('directory')

  // Payload stores points as [longitude, latitude]; Google Maps wants the
  // opposite order. Getting this backwards drops the pin in the wrong hemisphere.
  const directions = coordinates
    ? `https://www.google.com/maps/dir/?api=1&destination=${coordinates[1]},${coordinates[0]}`
    : null

  const actions = [
    reservationUrl && { href: reservationUrl, label: t('reserve'), primary: true, external: true },
    phone && { href: `tel:${phone}`, label: t('call'), primary: !reservationUrl },
    directions && { href: directions, label: t('getDirections'), external: true },
    whatsapp && {
      href: `https://wa.me/${digitsOnly(whatsapp)}`,
      label: 'WhatsApp',
      external: true,
    },
    menuUrl && { href: menuUrl, label: t('viewMenu'), external: true },
    website && { href: website, label: t('website'), external: true },
  ].filter(Boolean) as {
    href: string
    label: string
    primary?: boolean
    external?: boolean
  }[]

  if (actions.length === 0) return null

  return (
    <div className="flex flex-wrap gap-3" aria-label={`Contact ${name}`}>
      {actions.map((action) => (
        <a
          key={action.href}
          href={action.href}
          className={action.primary ? PRIMARY : SECONDARY}
          {...(action.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {action.label}
        </a>
      ))}
    </div>
  )
}
