import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import type { Locale } from '@vardenia/i18n'
import { POINTS_NEW_PLACE, POINTS_RETURN_VISIT, sectionForCategory } from '@vardenia/core'
import { Link } from '../../i18n/routing'
import type { PassportView } from '../../lib/passport'
import { beirutStampDate } from '../../lib/beirut'
import { placeLabel, sectionName } from '../../lib/labels'
import { LINK } from '../formStyles'
import { Stamp } from './Stamp'

/**
 * The passport itself, for a guest who is signed in: the cover, the stamp
 * pages and the milestones. Takes the passport as data, so the page owns the
 * session and the query and this owns only the drawing.
 */

/** The page always shows at least this many spaces, filled or not. */
const PAGE_SPACES = 6

export async function PassportBook({
  holder,
  passport,
  locale,
}: {
  holder: string
  passport: PassportView
  locale: Locale
}) {
  const t = await getTranslations('passport')
  const account = await getTranslations('account')

  const filled = passport.stamps.length + passport.pending.length
  // Round up to a full page, so the empty spaces read as room to fill rather
  // than as a grid that ran out.
  const blanks = Math.max(PAGE_SPACES, Math.ceil(filled / PAGE_SPACES) * PAGE_SPACES) - filled

  const sectionOf = (category: string | null) => {
    const section = sectionForCategory(category)
    return section ? sectionName(section, locale) : ''
  }

  return (
    <main className="vd-passport-page mx-auto max-w-5xl px-6 py-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="sr-only">{t('title')}</h1>
        <Link href="/account" className={LINK}>
          {account('title')}
        </Link>
      </div>

      {/* The cover. Dark, gold and the monogram, like the printed issue. */}
      <section className="bg-cedar-900 text-surface-base relative mt-6 overflow-hidden p-8 sm:p-12">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <Image src="/brand/monogram-ivory.png" alt="" width={51} height={56} />
            <p className="text-gold-300 mt-6 text-xs uppercase tracking-[0.3em]">
              {t('coverLabel')}
            </p>
            <p className="font-display mt-2 text-3xl sm:text-4xl" dir="auto">
              {holder}
            </p>
          </div>
          <dl className="flex gap-10">
            <div>
              <dt className="text-surface-base/70 text-xs uppercase tracking-widest">
                {t('points')}
              </dt>
              <dd className="font-display text-gold-300 mt-1 text-5xl tabular-nums">
                {passport.points.toLocaleString('en-US')}
              </dd>
            </div>
            <div>
              <dt className="text-surface-base/70 text-xs uppercase tracking-widest">
                {t('stamps')}
              </dt>
              <dd className="font-display mt-1 text-5xl tabular-nums">
                {passport.stamps.length.toLocaleString('en-US')}
              </dd>
            </div>
          </dl>
        </div>
        <p className="text-surface-base/80 mt-10 max-w-2xl text-sm leading-relaxed">
          {t('how', { newPoints: POINTS_NEW_PLACE, returnPoints: POINTS_RETURN_VISIT })}{' '}
          {t('howLand')}
        </p>
      </section>

      <h2 className="text-ink-500 mt-14 text-xs uppercase tracking-widest">{t('stampsHeading')}</h2>

      {filled === 0 ? (
        <div className="mt-4">
          <p className="text-ink-700 max-w-xl">{t('empty')}</p>
          <Link href="/directory" className={`${LINK} mt-3 inline-block`}>
            {account('browse')}
          </Link>
        </div>
      ) : null}

      <ul className="border-ink-100 bg-surface-raised mt-6 grid grid-cols-2 gap-x-4 gap-y-10 border p-6 sm:grid-cols-3 sm:p-10">
        {passport.stamps.map((stamp) => {
          const where = placeLabel(stamp.place.governorate, stamp.place.district, locale)
          const name = stamp.place.slug ? (
            <Link href={`/directory/${stamp.place.slug}`} className="hover:underline">
              {stamp.place.name}
            </Link>
          ) : (
            stamp.place.name
          )
          return (
            <li key={stamp.businessId}>
              <Stamp
                state="inked"
                seed={stamp.businessId}
                category={stamp.category}
                top={sectionOf(stamp.category)}
                name={name}
                bottom={beirutStampDate(stamp.stampedOn, locale)}
                note={[where, stamp.visits > 1 ? t('visits', { count: stamp.visits }) : '']
                  .filter(Boolean)
                  .join(' · ')}
              />
            </li>
          )
        })}

        {passport.pending.map((stamp) => (
          <li key={`pending-${stamp.businessId}`}>
            <Stamp
              state="pending"
              top={t('pendingLabel')}
              name={stamp.place.name}
              note={t('pendingBy', { date: beirutStampDate(stamp.landsBy, locale) })}
            />
          </li>
        ))}

        {Array.from({ length: blanks }, (_, i) => (
          <li key={`blank-${i}`} aria-hidden>
            <Stamp state="blank" top={i === 0 ? t('nextStamp') : undefined} />
          </li>
        ))}
      </ul>

      <h2 className="text-ink-500 mt-14 text-xs uppercase tracking-widest">
        {t('milestonesHeading')}
      </h2>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {passport.milestones.map((milestone) => (
          <li
            key={milestone.key}
            className={[
              'border p-5',
              milestone.reached ? 'border-gold-300 bg-gold-100/40' : 'border-ink-100',
            ].join(' ')}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-ink-900 font-semibold">{t(`milestone.${milestone.key}`)}</p>
              <p className="text-ink-500 text-xs tabular-nums">
                {milestone.reached
                  ? t('reached')
                  : t('progress', { count: milestone.count, target: milestone.target })}
              </p>
            </div>
            <div
              className="bg-ink-100 mt-3 h-1.5 overflow-hidden rounded-full"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={milestone.target}
              aria-valuenow={milestone.count}
              aria-label={t(`milestone.${milestone.key}`)}
            >
              <div
                className="bg-gold-500 h-full rounded-full"
                style={{ width: `${(milestone.count / milestone.target) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
