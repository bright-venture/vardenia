import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import { ListingCard } from './ListingCard'

/**
 * The switch that hides every listing's location (lib/location-display), made
 * settable here so the card is tested both ways: the place tests below still
 * guard how an area reads once it is shown again, and the last one guards that
 * nothing leaks while it is off.
 */
const display = vi.hoisted(() => ({ SHOW_LOCATION: true }))
vi.mock('../lib/location-display', () => display)
beforeEach(() => {
  display.SHOW_LOCATION = true
})

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
    const html = text(render({ governorate: 'keserwan', district: 'jbeil' }))
    expect(html).toContain('Jbeil')
    expect(html).toContain('Keserwan')
  })

  /** Beirut is both a governorate and its only district. "Beirut, Beirut" reads as a bug. */
  it('does not repeat a place that is its own district', () => {
    const html = text(render({ governorate: 'beirut', district: 'beirut' }))
    expect(html).not.toContain('Beirut, Beirut')
    expect(html).toContain('Beirut')
  })

  it('shows no area at all while locations are hidden', () => {
    display.SHOW_LOCATION = false
    const html = text(render({ governorate: 'keserwan', district: 'jbeil' }))
    expect(html).not.toContain('Jbeil')
    expect(html).not.toContain('Keserwan')
    expect(render({ governorate: 'keserwan', district: 'jbeil' })).not.toContain('vd-card-place')
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
   * Every listing is visited and checked before it appears (the owner's rule
   * since 9 November 2026), so no card carries a Verified badge: one on some
   * cards would suggest the others are not. The admin's verified flag is still
   * passed in and must not leak onto the card.
   */
  it('shows no Verified badge, whatever the flag says', () => {
    for (const verified of [true, false, undefined]) {
      const html = render({ verified })
      expect(html).not.toContain('Verified')
      expect(html).not.toContain('aria-label="Verified by Vardenia"')
    }
  })

  /** The badge that remains, the gold one, is announced rather than a stray glyph. */
  it('gives the remaining badge an accessible label', () => {
    const html = render({ signature: true })
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="A Vardenia Signature listing"')
  })

  /**
   * Every card carries a save heart, and an icon has no text of its own. Naming
   * the listing in its label is what stops a grid being a row of buttons all
   * called "Save", which a screen reader cannot tell apart.
   */
  it('names the listing on its save button', () => {
    expect(render()).toContain('aria-label="Save Le Royal Hotel"')
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
      const html = text(render({ governorate: 'matn', locale: 'ar' }))
      expect(html).toMatch(/[؀-ۿ]/)
    })

    it('shows no Verified badge in Arabic either', () => {
      const html = render({ verified: true, locale: 'ar' })
      expect(html).not.toContain('موثّق من فاردينيا')
    })

    /**
     * No listing has an Arabic name yet, so on the Arabic page these two fields
     * hold English inside an RTL layout. The bidirectional algorithm puts
     * neutral characters at the end of the paragraph direction, which moves a
     * full stop to the left edge and makes the text look broken rather than
     * untranslated.
     *
     * `auto` and not `ltr`: the moment a listing is translated, a hardcoded
     * direction would be wrong for it. Asking the browser to read the first
     * strong character is correct in both states, and in the long middle where
     * some listings are translated and some are not.
     */
    it('lets the browser choose direction for the name and tagline', () => {
      const html = render({ name: 'Le Royal Hotel', tagline: 'A view of the bay.', locale: 'ar' })

      expect(html).toMatch(/<h3[^>]*dir="auto"/)
      expect(html).toMatch(/<p[^>]*dir="auto"[^>]*>A view of the bay\./)
    })

    it('does not pin the direction to ltr, which would break a translated name', () => {
      const html = render({ name: 'فندق لو رويال', locale: 'ar' })
      expect(html).not.toMatch(/dir="ltr"/)
    })
  })
})
