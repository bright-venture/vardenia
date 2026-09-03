import { getTranslations } from 'next-intl/server'
import { LINK } from './formStyles'

/**
 * The partner's own QR code, ready to print.
 *
 * # Why this is the one thing on the dashboard that gives rather than asks
 *
 * Everything else here reports: bookings taken, guests seen, days closed. This
 * hands the partner an asset. `/qr/[code]` has produced print-ready SVG and PNG
 * since the codes were minted and nothing has ever shown it to anybody but
 * staff, so the only way a restaurant could get its own code was to ask us for
 * it - which nobody does, so nobody has one.
 *
 * It matters most before the magazine exists. A venue can put a table card out
 * this week, and every scan of it lands on their listing and shows up in the
 * scan log we will quote back at renewal.
 *
 * # SVG first
 *
 * A printer wants vector. The PNG is there because the same code goes on
 * Instagram and into a Word document, and telling somebody to convert an SVG is
 * how a feature stops being used. Sizes are the ones qr-image already generates:
 * 25mm is a table card, and the PNG is big enough to survive being pasted into
 * something that resamples it.
 *
 * # It renders nothing when there is no code
 *
 * A listing that has never been published has no code yet - `ensureQrCode` mints
 * one on first publish. An empty panel with a broken link would read as a fault
 * rather than as a thing that has not happened yet.
 */

export async function QrCodePanel({
  listings,
}: {
  listings: { id: number; name: string; code: string }[]
}) {
  const t = await getTranslations('partner')
  const withCode = listings.filter((listing) => listing.code)

  if (withCode.length === 0) return null

  return (
    <section className="border-ink-100 mt-12 border-t pt-8" aria-labelledby="qr-code">
      <h2 id="qr-code" className="text-ink-500 font-mono text-[11px] uppercase tracking-[0.14em]">
        {t('qrTitle')}
      </h2>
      <p className="text-ink-700 mt-2 max-w-prose text-sm leading-relaxed">{t('qrIntro')}</p>

      <ul className="mt-6 flex flex-wrap gap-8">
        {withCode.map((listing) => (
          <li key={listing.id} className="flex items-start gap-4">
            {/*
              The code itself, drawn by the same route the download uses, so what
              somebody scans to check it is the file they are about to print.

              A plain `img`, not next/image: this is an SVG served by our own
              route, already the right size, and the optimiser has nothing to do
              but cost a round trip.
            */}
            <img
              src={`/qr/${listing.code}?size=25`}
              alt=""
              width={96}
              height={96}
              className="border-ink-100 shrink-0 border bg-white p-2"
            />

            <div className="min-w-0">
              {listings.length > 1 ? (
                <p className="text-ink-900 text-sm font-medium">{listing.name}</p>
              ) : null}

              {/* `select-all` and mono, because the reason to read a code off a
                  screen is to type it into something else. */}
              <p className="text-ink-500 mt-0.5 select-all font-mono text-xs">{listing.code}</p>

              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <a href={`/qr/${listing.code}?format=svg&download=1`} className={LINK}>
                  {t('qrSvg')}
                </a>
                <a href={`/qr/${listing.code}?format=png&size=1024&download=1`} className={LINK}>
                  {t('qrPng')}
                </a>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
