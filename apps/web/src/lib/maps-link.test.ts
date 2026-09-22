import { describe, expect, it } from 'vitest'
import { mapsLink, mapsQuery } from './maps-link'

/**
 * The link replaced an embedded map, so the thing worth testing is that it still
 * finds the right place when there are no coordinates - which today is every
 * listing in the catalogue.
 */
describe('mapsQuery', () => {
  it('uses the exact point when a listing has coordinates', () => {
    // Payload stores [longitude, latitude]; Maps wants "lat,lng".
    expect(mapsQuery({ name: 'Anywhere', coordinates: [35.5018, 33.8938] })).toBe('33.8938,35.5018')
  })

  it('searches by name, address and place when it has none', () => {
    expect(
      mapsQuery({ name: 'Le Telegraphe de Belle Vue', address: 'Bhamdoun', place: 'Aley' }),
    ).toBe('Le Telegraphe de Belle Vue, Bhamdoun, Aley, Lebanon')
  })

  it('always names the country, so a name that exists abroad resolves here', () => {
    expect(mapsQuery({ name: 'Starbucks' })).toBe('Starbucks, Lebanon')
  })

  it('drops a place that only repeats the address', () => {
    expect(mapsQuery({ name: 'Bean Avenue', address: 'Aley', place: 'Aley' })).toBe(
      'Bean Avenue, Aley, Lebanon',
    )
  })

  it('drops an address already contained in the name', () => {
    // "Latte Art Baabda" already says Baabda; repeating it helps nobody.
    expect(mapsQuery({ name: 'Latte Art Baabda', address: 'Baabda' })).toBe(
      'Latte Art Baabda, Lebanon',
    )
  })

  it('survives missing and blank parts', () => {
    expect(mapsQuery({ name: 'Solo', address: null, place: '   ' })).toBe('Solo, Lebanon')
  })
})

describe('mapsLink', () => {
  it('escapes the query rather than pasting it into the URL raw', () => {
    const url = mapsLink({ name: 'Chez Sami & Co', address: 'Jal El Dib' })
    expect(url.startsWith('https://www.google.com/maps/search/?api=1&query=')).toBe(true)
    // An unescaped '&' would truncate the query at "Chez Sami".
    expect(url).not.toContain('Sami &')
    expect(decodeURIComponent(url.split('query=')[1] ?? '')).toBe(
      'Chez Sami & Co, Jal El Dib, Lebanon',
    )
  })
})
