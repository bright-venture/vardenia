import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import { ListingCard } from './ListingCard'

/**
 * The card every directory result is rendered as, and the first thing a reader
 * sees of an advertiser. Its risk is not crashing - it is degrading quietly:
 * a listing with no photo, no price band or no district still has to look like
 * a listing rather than like a broken one.
 */

const base = {
  slug: 'le-royal-hotel',
  name: 'Le Royal Hotel',
  locale: 'en' as const,
}

/**
 * Wrapped in the real provider rather than mocking next-intl's Link.
 *
 * The link is half of what this component does - the whole card is a link to
 * the listing - so stubbing it out would leave the most important assertion
 * checking a stub.
 */
const render = (props: Partial<Parameters<typeof ListingCard>[0]> = {}) => {
  const locale = props.locale ?? base.locale
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)}>
      <ListingCard {...base} {...props} />
    </NextIntlClientProvider>,
  )
}

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

describe('ListingCard', () => {
  it('links to the listing', () => {
    expect(render()).toContain('/directory/le-royal-hotel')
  })

  it('shows the name', () => {
    expect(text(render())).toContain('Le Royal Hotel')
  })

  it('renders with nothing but a name and a slug', () => {
    // Everything else is optional in the CMS, so everything else is optional
    // here. A half-filled listing is a normal state during onboarding.
    expect(() => render()).not.toThrow()
    expect(render()).not.toBe('')
  })

  it('translates the category rather than printing its slug', () => {
    const html = text(render({ category: 'hospitality' }))
    expect(html).toContain('Hospitality')
    expect(html).not.toContain('hospitality')
  })

  it('shows a place as district then governorate', () => {
    const html = text(render({ governorate: 'mount-lebanon', district: 'jbeil' }))
    expect(html).toContain('Jbeil')
    expect(html).toContain('Mount Lebanon')
  })

  /** Beirut is both a governorate and its only district. "Beirut, Beirut" reads as a bug. */
  it('does not repeat a place that is its own district', () => {
    const html = text(render({ governorate: 'beirut', district: 'beirut' }))
    expect(html).not.toContain('Beirut, Beirut')
    expect(html).toContain('Beirut')
  })

  it('renders the price band as currency marks', () => {
    expect(text(render({ priceRange: 3 }))).toContain('$$$')
    expect(text(render({ priceRange: '4' }))).toContain('$$$$')
  })

  it('omits the price band rather than showing an empty one', () => {
    expect(text(render({ priceRange: null }))).not.toContain('$')
    expect(text(render({ priceRange: 0 }))).not.toContain('$')
  })

  /**
   * The badge is a bare tick, so its accessible label is the only thing a screen
   * reader can announce. It was hardcoded English on a bilingual site.
   */
  it('labels the verified badge, and only when verified', () => {
    expect(render({ verified: true })).toContain('Verified by Vardenia')
    expect(render({ verified: false })).not.toContain('Verified')
    expect(render({})).not.toContain('Verified')
  })

  it('gives the tick an accessible label rather than leaving it a stray glyph', () => {
    const html = render({ verified: true })
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="Verified by Vardenia"')
  })

  it('survives an image that is only an id, which is what depth 0 gives', () => {
    expect(() => render({ heroImage: 7 })).not.toThrow()
  })

  it('survives no image at all', () => {
    expect(() => render({ heroImage: null })).not.toThrow()
  })

  describe('in Arabic', () => {
    it('translates the category', () => {
      const html = text(render({ category: 'hospitality', locale: 'ar' }))
      expect(html).toContain('الضيافة')
      expect(html).not.toContain('Hospitality')
    })

    it('translates the place', () => {
      const html = text(render({ governorate: 'mount-lebanon', locale: 'ar' }))
      expect(html).toMatch(/[؀-ۿ]/)
    })

    it('translates the verified badge', () => {
      const html = render({ verified: true, locale: 'ar' })
      expect(html).toContain('موثّق من فاردينيا')
      expect(html).not.toContain('Verified by Vardenia')
    })
  })
})
