import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { OpeningHoursTable } from './OpeningHoursTable'
import type { OpeningHour } from '../lib/hours'

/**
 * The hours table, which had no tests while the logic beneath it had 24.
 *
 * That gap matters more than it sounds. `lib/hours` is thoroughly checked, so
 * the risk was never the arithmetic - it was this component rendering correct
 * data wrongly: a missing day, a time reversed by RTL, or "Closed" shown for a
 * business that simply has not published hours. All three are the kind of thing
 * an advertiser notices before we do.
 *
 * Rendered to static markup rather than through a DOM library. These are server
 * components with no interactivity, so the HTML is the whole behaviour, and it
 * keeps the suite free of jsdom.
 */

const render = (hours: OpeningHour[] | null | undefined, locale: 'en' | 'ar' = 'en') =>
  renderToStaticMarkup(<OpeningHoursTable hours={hours} locale={locale} />)

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const WEEK: OpeningHour[] = [
  { day: 'mon', opens: '09:00', closes: '17:00' },
  { day: 'tue', opens: '09:00', closes: '17:00' },
  { day: 'wed', opens: '09:00', closes: '17:00' },
  { day: 'thu', opens: '09:00', closes: '17:00' },
  { day: 'fri', opens: '09:00', closes: '17:00' },
  { day: 'sat', opens: '09:00', closes: '17:00' },
  { day: 'sun', opens: '09:00', closes: '17:00' },
]

describe('OpeningHoursTable', () => {
  it('renders nothing when a business has published no hours', () => {
    // Not "Closed every day" - a listing whose hours vary by season, like a ski
    // resort, must not be presented as permanently shut.
    expect(render([])).toBe('')
    expect(render(null)).toBe('')
    expect(render(undefined)).toBe('')
  })

  it('lists all seven days even when only one is given', () => {
    const html = render([{ day: 'wed', opens: '09:00', closes: '17:00' }])

    for (const day of [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ])
      expect(text(html)).toContain(day)
  })

  /**
   * A day missing from the table reads as an oversight; an explicit "Closed"
   * reads as fact. The days not supplied are the ones this is about.
   */
  it('says Closed for a day with no hours rather than leaving it blank', () => {
    const html = render([{ day: 'wed', opens: '09:00', closes: '17:00' }])
    expect((text(html).match(/Closed/g) ?? []).length).toBe(6)
  })

  it('keeps the week in order rather than the order the data arrived in', () => {
    const shuffled: OpeningHour[] = [
      { day: 'sun', opens: '10:00', closes: '14:00' },
      { day: 'mon', opens: '09:00', closes: '17:00' },
      { day: 'sat', opens: '10:00', closes: '18:00' },
    ]
    const rendered = text(render(shuffled))

    expect(rendered.indexOf('Monday')).toBeLessThan(rendered.indexOf('Saturday'))
    expect(rendered.indexOf('Saturday')).toBeLessThan(rendered.indexOf('Sunday'))
  })

  it('shows the range for an open day', () => {
    expect(text(render(WEEK))).toContain('09:00')
    expect(text(render(WEEK))).toContain('17:00')
  })

  it('marks a day explicitly flagged closed', () => {
    const html = render([{ day: 'mon', closed: true }])
    expect(text(html)).toContain('Closed')
  })

  describe('in Arabic', () => {
    it('translates the day names', () => {
      const rendered = text(render(WEEK, 'ar'))
      expect(rendered).not.toContain('Monday')
      expect(rendered).toMatch(/[؀-ۿ]/)
    })

    it('translates Closed', () => {
      const html = render([{ day: 'mon', closed: true }], 'ar')
      expect(text(html)).toContain('مغلق')
      expect(text(html)).not.toContain('Closed')
    })

    /**
     * The one that is invisible until an Arabic reader looks at it. Without an
     * explicit direction, a right-to-left paragraph renders "09:00 - 17:00"
     * with the parts swapped, so a shop that opens at nine reads as opening at
     * five.
     */
    it('pins times left-to-right so a range is not reversed', () => {
      const html = render(WEEK, 'ar')
      expect(html).toContain('dir="ltr"')
    })
  })

  it('uses a description list, so a screen reader pairs each day with its hours', () => {
    const html = render(WEEK)
    expect(html).toContain('<dl')
    expect(html).toContain('<dt')
    expect(html).toContain('<dd')
  })
})
