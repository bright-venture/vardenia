import { describe, expect, it } from 'vitest'
import { articleSchema, listingSchema, organizationSchema } from './structured-data'

const LISTING = {
  name: 'Le Royal Hotel',
  slug: 'le-royal-hotel',
  tagline: 'Sea views over Beirut',
  category: 'hospitality',
  governorate: 'mount-lebanon',
  district: 'matn',
  address: 'Dbayeh Highway',
  location: [35.5925668, 33.9480149], // [lng, lat] - GeoJSON order
  priceRange: 4,
  heroImage: { url: 'https://cdn.example.com/hero.webp', alt: 'Le Royal' },
  openingHours: [
    { day: 'mon', opens: '09:00', closes: '23:00' },
    { day: 'sun', closed: true },
  ],
}

describe('listingSchema', () => {
  it('picks a specific type from the category', () => {
    expect(listingSchema(LISTING, 'en')['@type']).toBe('LodgingBusiness')
    expect(listingSchema({ ...LISTING, category: 'food-and-beverage' }, 'en')['@type']).toBe(
      'FoodEstablishment',
    )
    expect(listingSchema({ ...LISTING, category: 'healthcare' }, 'en')['@type']).toBe(
      'MedicalBusiness',
    )
  })

  it('falls back to LocalBusiness for an unmapped category', () => {
    expect(listingSchema({ ...LISTING, category: 'something-new' }, 'en')['@type']).toBe(
      'LocalBusiness',
    )
  })

  /**
   * Payload stores points as [longitude, latitude]. Reading them in the order
   * people say them aloud puts a Beirut hotel in the Indian Ocean.
   */
  it('reads coordinates in GeoJSON order', () => {
    const geo = listingSchema(LISTING, 'en').geo as Record<string, number>
    expect(geo.latitude).toBeCloseTo(33.948)
    expect(geo.longitude).toBeCloseTo(35.593)
  })

  it('renders the price band as currency marks', () => {
    expect(listingSchema(LISTING, 'en').priceRange).toBe('$$$$')
  })

  it('expresses a closed day rather than omitting it', () => {
    const hours = listingSchema(LISTING, 'en').openingHoursSpecification as Record<
      string,
      string | undefined
    >[]
    const sunday = hours.find((h) => h.dayOfWeek?.endsWith('Sunday'))
    expect(sunday).toBeDefined()
    expect(sunday?.opens).toBe('00:00')
    expect(sunday?.closes).toBe('00:00')
  })

  /**
   * Contact details left the collection when bookings arrived, so the schema
   * must not still be claiming them. Asserted rather than assumed: these
   * properties were built from fields that no longer exist, and markup that
   * declares a telephone the page cannot show is exactly what Google penalises.
   */
  it('declares no contact properties, because listings no longer carry any', () => {
    const schema = listingSchema(LISTING, 'en')
    expect(schema).not.toHaveProperty('telephone')
    expect(schema).not.toHaveProperty('email')
    expect(schema).not.toHaveProperty('sameAs')
  })

  it('prefixes the URL for Arabic', () => {
    expect(listingSchema(LISTING, 'ar').url).toContain('/ar/directory/le-royal-hotel')
    expect(listingSchema(LISTING, 'en').url).not.toContain('/ar/')
  })

  /** Markup that claims more than the page shows is worse than no markup. */
  it('omits properties it has no value for', () => {
    const sparse = listingSchema({ name: 'Nameless', category: 'lifestyle' }, 'en')
    expect(sparse).not.toHaveProperty('address')
    expect(sparse).not.toHaveProperty('geo')
    expect(sparse).not.toHaveProperty('priceRange')
    expect(sparse).not.toHaveProperty('image')
    expect(sparse.name).toBe('Nameless')
  })

  it('omits an address block that would carry only the country', () => {
    const sparse = listingSchema({ name: 'X', category: 'lifestyle' }, 'en')
    expect(sparse).not.toHaveProperty('address')
  })

  it('produces JSON that survives a round trip', () => {
    const parsed = JSON.parse(JSON.stringify(listingSchema(LISTING, 'en')))
    expect(parsed['@context']).toBe('https://schema.org')
  })
})

describe('articleSchema', () => {
  it('names the author when there is one, and the publisher otherwise', () => {
    const withAuthor = articleSchema({ title: 'A', author: { name: 'Dana' } }, 'en')
    expect((withAuthor.author as Record<string, string>).name).toBe('Dana')

    const without = articleSchema({ title: 'A' }, 'en')
    expect((without.author as Record<string, string>)['@type']).toBe('Organization')
  })

  it('falls back to the published date when never modified', () => {
    const s = articleSchema({ title: 'A', publishedAt: '2026-08-01T00:00:00.000Z' }, 'en')
    expect(s.dateModified).toBe('2026-08-01T00:00:00.000Z')
  })
})

describe('organizationSchema', () => {
  it('identifies the publisher', () => {
    const s = organizationSchema()
    expect(s['@type']).toBe('Organization')
    expect(s.name).toBe('Vardenia')
  })
})
