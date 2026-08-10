import type { Locale } from '@vardenia/i18n'
import { DAY_LABELS, formatDay, orderedHours, type OpeningHour } from '../lib/hours'

/**
 * Hours, always in week order and always with every day listed. A day missing
 * from the table reads as an oversight; an explicit "Closed" reads as fact.
 */
export function OpeningHoursTable({
  hours,
  locale,
}: {
  hours: OpeningHour[] | null | undefined
  locale: Locale
}) {
  const rows = orderedHours(hours)
  if (rows.length === 0) return null

  return (
    <dl className="divide-ink-100 divide-y text-sm">
      {rows.map((entry) => {
        const day = entry.day ?? 'mon'
        const range = formatDay(entry)
        return (
          <div key={day} className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-ink-700">{DAY_LABELS[day][locale === 'ar' ? 'ar' : 'en']}</dt>
            <dd
              className={range ? 'text-ink-900 tabular-nums' : 'text-ink-300'}
              // Times stay left-to-right even in Arabic, or "09:00 - 23:00"
              // renders with the parts reversed.
              dir="ltr"
            >
              {range ?? (locale === 'ar' ? 'مغلق' : 'Closed')}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
