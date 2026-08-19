import { getTranslations } from 'next-intl/server'
import type { Locale } from '@vardenia/i18n'
import { resolveRules, type BookingRules } from '../lib/availability'
import { bookingFormModel } from '../lib/booking-form'
import { BookingForm } from './BookingForm'

/**
 * Where the booking form sits on a listing, and whether it appears at all.
 *
 * A server component so that the decision - does this place take bookings, and
 * what shape is the form - happens once during prerendering rather than in every
 * reader's browser. Only the form itself is client-side, and only because it has
 * to hold what the reader is typing.
 *
 * Renders nothing when bookings are off. Not a disabled form, not "bookings
 * coming soon": most listings will never take bookings through us, and a
 * permanently greyed-out form on all of them advertises an absence. The reader
 * of a listing with no booking simply sees a listing.
 */
export async function BookingPanel({
  businessId,
  rules,
  locale,
}: {
  businessId: number
  rules: BookingRules | null | undefined
  locale: Locale
}) {
  /**
   * `enabled` is read through `resolveRules` rather than off the raw group,
   * because that function is where "missing means off" is decided. Checking
   * `rules?.enabled` here would be a second opinion on the same question, and
   * the two would eventually disagree about a listing whose group is half
   * filled in.
   */
  if (!resolveRules(rules).enabled) return null

  const t = await getTranslations('booking')

  /**
   * Built here, and therefore built at prerender time.
   *
   * `earliestDate` and `latestDate` come from today's date in Beirut, so on a
   * page that has sat in the cache overnight they are yesterday's answer until
   * the first visitor triggers a revalidation.
   *
   * Left that way on purpose. They set the bounds of a date picker, not the
   * rules: `checkAvailability` refuses a past or too-soon booking whatever the
   * form allowed, and says so in a sentence. Correcting them in the browser
   * costs an effect and a second render to stop somebody clicking a day they
   * would immediately be told about anyway.
   */
  const model = bookingFormModel(rules)

  return (
    <section
      id="book"
      className="border-ink-100 bg-surface-raised mt-14 rounded-lg border p-6 md:p-8"
    >
      <h2 className="font-display text-ink-900 text-2xl">
        {model.mode === 'nights' ? t('headingStay') : t('heading')}
      </h2>

      <div className="mt-6">
        <BookingForm businessId={businessId} model={model} locale={locale} />
      </div>
    </section>
  )
}
