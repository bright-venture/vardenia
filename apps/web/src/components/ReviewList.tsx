import { formatDate, type Locale } from '@vardenia/i18n'
import { forDisplay, type ReviewSummary } from '../lib/reviews'
import { Stars } from './ui'

/**
 * The reviews on a listing page.
 *
 * # Attribution is the whole job
 *
 * Three kinds of thing are shown here and a reader has to be able to tell them
 * apart at a glance, because they carry completely different weight:
 *
 * - An editorial review is Vardenia's own verdict. It is the most authoritative
 *   thing on the page and is attributed to us by name, in a panel of its own.
 * - A guest review is somebody who went. It carries a name when we have one.
 * - A partner quote came from the business. It is labelled as such, in plainer
 *   type, at the bottom, because a place describing itself is not evidence.
 *
 * Collapsing these into one undifferentiated list is the failure mode. It is
 * also the easy thing to build, which is why the distinction lives in the
 * markup and the ordering rather than in a comment.
 *
 * # Why the partner label is not softened
 *
 * "Supplied by the business" is blunt on purpose. Any gentler phrasing is
 * either vague or flattering, and the reader is entitled to know who is
 * speaking before they read the sentence rather than after.
 */

const LABELS = {
  editorial: { en: 'Vardenia', ar: 'فاردينيا' },
  partner: { en: 'Supplied by the business', ar: 'مقدَّم من المكان' },
  anonymousGuest: { en: 'A guest', ar: 'أحد الضيوف' },
  visited: { en: 'Visited', ar: 'زيارة' },
  heading: { en: 'Reviews', ar: 'التقييمات' },
  ourVerdict: { en: 'Our verdict', ar: 'رأينا' },
} as const

function Attribution({ review, locale }: { review: ReviewSummary; locale: Locale }) {
  const ar = locale === 'ar'

  if (review.source === 'editorial') {
    return <span className="text-ink-900 font-medium">{ar ? LABELS.editorial.ar : LABELS.editorial.en}</span>
  }

  if (review.source === 'partner') {
    return (
      <span className="text-ink-500 italic">{ar ? LABELS.partner.ar : LABELS.partner.en}</span>
    )
  }

  return (
    <span className="text-ink-900 font-medium">
      {review.authorName || (ar ? LABELS.anonymousGuest.ar : LABELS.anonymousGuest.en)}
    </span>
  )
}

function When({ review, locale }: { review: ReviewSummary; locale: Locale }) {
  const raw = review.visitedAt ?? review.publishedAt
  if (!raw) return null

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null

  const ar = locale === 'ar'
  return (
    <time className="text-ink-300 font-mono text-xs" dateTime={raw}>
      {review.visitedAt ? `${ar ? LABELS.visited.ar : LABELS.visited.en} ` : ''}
      {formatDate(parsed, locale)}
    </time>
  )
}

/** The editorial verdict, given a panel because it is not one voice among many. */
export function EditorialVerdict({
  review,
  locale,
}: {
  review: ReviewSummary
  locale: Locale
}) {
  const ar = locale === 'ar'

  return (
    <figure className="bg-cedar-900 rounded-lg p-6 sm:p-8">
      <figcaption className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-gold-300 font-mono text-[11px] uppercase tracking-[0.16em]">
          {ar ? LABELS.ourVerdict.ar : LABELS.ourVerdict.en}
        </span>
        {/* The stars are gold on cedar here, which is the one place the two
            brand colours sit directly on each other. It reads as a seal. */}
        <Stars rating={review.rating} locale={locale} className="[&_span]:text-cedar-100" />
      </figcaption>

      <blockquote className="mt-5">
        <p className="font-display text-surface-base text-xl leading-snug sm:text-2xl">
          {review.title}
        </p>
        <p className="text-cedar-100/75 mt-3 text-sm leading-relaxed">{review.body}</p>
      </blockquote>

      <p className="text-cedar-100/50 mt-5 flex flex-wrap items-center gap-3 font-mono text-xs">
        <span>{ar ? LABELS.editorial.ar : LABELS.editorial.en}</span>
        <When review={review} locale={locale} />
      </p>
    </figure>
  )
}

export function ReviewList({
  reviews,
  locale,
}: {
  reviews: ReviewSummary[]
  locale: Locale
}) {
  // The editorial verdict is rendered separately above, so it is excluded here
  // rather than repeated.
  const rest = forDisplay(reviews).filter((review) => review.source !== 'editorial')
  if (rest.length === 0) return null

  const ar = locale === 'ar'

  return (
    <section className="mt-12">
      <h2 className="text-ink-900 text-2xl">{ar ? LABELS.heading.ar : LABELS.heading.en}</h2>

      <ul className="mt-6 flex flex-col gap-4">
        {rest.map((review) => (
          <li
            key={review.id}
            className={`border-ink-100 rounded-lg border p-5 ${
              review.source === 'partner' ? 'bg-surface-raised' : ''
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Attribution review={review} locale={locale} />
              {/* A partner quote gets no stars. A rating it gave itself is not
                  a rating, and drawing one would launder it into evidence. */}
              {review.source === 'guest' ? (
                <Stars rating={review.rating} locale={locale} />
              ) : null}
            </div>

            <h3 className="text-ink-900 mt-3 text-lg leading-snug">{review.title}</h3>
            <p className="text-ink-700 mt-2 text-sm leading-relaxed">{review.body}</p>

            <div className="mt-3">
              <When review={review} locale={locale} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
