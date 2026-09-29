import { getTranslations } from 'next-intl/server'
import { dataLocale, type Locale } from '@vardenia/i18n'
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
/** How a guest can pay the venue, as ticked in the admin. See Businesses `payments`. */
export interface PaymentsAccepted {
  cash?: boolean | null
  card?: boolean | null
  whish?: boolean | null
  omt?: boolean | null
}

export async function BookingPanel({
  businessId,
  rules,
  locale,
  venue,
  payments,
}: {
  businessId: number
  rules: BookingRules | null | undefined
  locale: Locale
  /** The listing's name, for the promises under the form. */
  venue: string
  payments?: PaymentsAccepted | null
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

  // Shown under the form when set. Read off the same rules the form uses, at the
  // page's locale, so it is the Arabic policy on an Arabic page.
  const cancellationPolicy =
    typeof rules?.cancellationPolicy === 'string' ? rules.cancellationPolicy.trim() : ''

  /*
   * What a guest can count on, said where they decide.
   *
   * Every one is true by construction, not by hope: Vardenia never takes
   * payment, so booking is free and the venue is paid directly; whether the
   * venue confirms or the booking is instant is the listing's own autoConfirm
   * setting; and reviews can only be written after a booking that happened
   * (see review-service). The payment line appears only when the venue's
   * methods are known, because "cards accepted" guessed wrong is worse than
   * saying nothing.
   */
  const instant = (rules as { autoConfirm?: boolean } | null | undefined)?.autoConfirm === true
  const methods = [
    payments?.cash ? t('payCash') : null,
    payments?.card ? t('payCard') : null,
    payments?.whish ? 'Whish' : null,
    payments?.omt ? 'OMT' : null,
  ].filter((method): method is string => Boolean(method))
  const methodList =
    methods.length > 0
      ? new Intl.ListFormat(dataLocale(locale), { style: 'long', type: 'conjunction' }).format(
          methods,
        )
      : null

  /*
   * Square, and it sets no margin of its own.
   *
   * The rounded corners went with the old palette - the design draws every
   * panel as a plain rectangle with a hairline. The margin went because this is
   * now placed by the listing page rather than stacked under the description,
   * and a component carrying its own top margin cannot be put in a sidebar
   * without fighting it.
   */
  return (
    <section id="book" className="border-ink-100 bg-surface-raised border p-6 md:p-8">
      <h2 className="font-display text-ink-900 text-2xl">
        {model.mode === 'nights' ? t('headingStay') : t('heading')}
      </h2>

      <div className="mt-6">
        <BookingForm businessId={businessId} model={model} locale={locale} />
      </div>

      <ul className="border-ink-100 text-ink-700 mt-6 space-y-2 border-t pt-4 text-sm">
        <li className="flex gap-2">
          <span aria-hidden className="text-gold-700">
            ✓
          </span>
          <span>
            {t('promisePay', { venue })}
            {methodList ? ` ${t('promisePayWith', { methods: methodList })}` : ''}
          </span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="text-gold-700">
            ✓
          </span>
          <span>{instant ? t('promiseInstant') : t('promiseConfirm', { venue })}</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="text-gold-700">
            ✓
          </span>
          <span>{t('promiseReviews')}</span>
        </li>
      </ul>

      {cancellationPolicy ? (
        <div className="border-ink-100 mt-6 border-t pt-4">
          <h3 className="text-ink-500 font-mono text-[11px] uppercase tracking-[0.16em]">
            {t('cancellationPolicy')}
          </h3>
          <p dir="auto" className="text-ink-700 mt-2 whitespace-pre-line text-sm leading-relaxed">
            {cancellationPolicy}
          </p>
        </div>
      ) : null}
    </section>
  )
}
