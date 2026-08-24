import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Locale } from '@vardenia/i18n'
import { Stars } from './Stars'

/**
 * A rating that announces nothing is worse than a bare number.
 *
 * The first version put `aria-label` on a plain span and marked every visible
 * piece inside it `aria-hidden`. A span has the implicit role `generic`, and
 * ARIA does not let a generic element take an accessible name, so the label was
 * discarded and the content was hidden: a screen reader reached the rating and
 * said nothing.
 *
 * These pin the two halves of the fix - a role that can hold a name, and a name
 * that actually contains the numbers.
 */

const render = (props: Partial<Parameters<typeof Stars>[0]> = {}) =>
  renderToStaticMarkup(<Stars rating={4.5} locale={'en' as Locale} {...props} />)

describe('Stars', () => {
  it('gives the label an element that can carry it', () => {
    const html = render()
    // role and label must be on the same element, or the name is dropped.
    expect(html).toMatch(/role="img"[^>]*aria-label="/)
  })

  it('says the rating out loud, not just in pixels', () => {
    expect(render({ rating: 4.5 })).toContain('aria-label="4.5 out of 5 on Google"')
  })

  it('includes the number of reviews when there is more than one', () => {
    expect(render({ rating: 4.2, count: 12 })).toContain(
      'aria-label="4.2 out of 5, from 12 ratings on Google"',
    )
  })

  it('translates the label rather than announcing English to an Arabic reader', () => {
    const html = render({ rating: 4, count: 3, locale: 'ar' as Locale })
    expect(html).toContain('من 5')
    expect(html).not.toContain('out of 5')
  })

  it('hides the decorative shapes so they are not announced as five images', () => {
    const html = render()
    // Both the stars and the duplicated number are hidden; the label speaks.
    expect((html.match(/aria-hidden/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  /**
   * A rating scale runs low to high in both scripts. An Arabic reader shown
   * four filled stars on the right would read it as one.
   */
  it('does not mirror the star row in Arabic', () => {
    expect(render({ locale: 'ar' as Locale })).toContain('dir="ltr"')
  })

  it('clamps a rating outside the scale rather than drawing nonsense', () => {
    expect(render({ rating: 9 })).toContain('aria-label="5.0 out of 5 on Google"')
    expect(render({ rating: -3 })).toContain('aria-label="0.0 out of 5 on Google"')
  })
  /**
   * The attribution is the point, not decoration.
   *
   * This number was copied from Google. It is not a rating Vardenia collected
   * and not a verdict Vardenia formed. Unattributed on a listing page it reads
   * as ours, which is a claim we have not earned - so the source is in the
   * visible text AND in the accessible name, because a listener gets no help
   * from the small grey word beside the stars.
   */
  it('says where the rating came from, visibly and out loud', () => {
    const html = render({ rating: 4.5 })
    expect(html).toContain('on Google')
    expect(html).toContain('aria-label="4.5 out of 5 on Google"')
  })

  it('attributes the source in Arabic too', () => {
    const html = render({ rating: 4.5, locale: 'ar' as Locale })
    expect(html).toContain('على غوغل')
    expect(html).not.toContain('on Google')
  })

  it('can drop the source only when asked explicitly', () => {
    const html = render({ rating: 4.5, showSource: false })
    expect(html).not.toContain('on Google')
    expect(html).toContain('aria-label="4.5 out of 5"')
  })
})
