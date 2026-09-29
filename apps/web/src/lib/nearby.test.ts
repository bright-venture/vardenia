import { describe, expect, it } from 'vitest'
import { distanceKm, NEARBY_RADIUS_KM, rankNearby, type Placed } from './nearby'
import { formatKm } from '../components/ListingCard'

// Real places, as [lng, lat] the way Payload stores a point.
const BEIRUT_HOTEL: [number, number] = [35.5199, 33.8886]
const EM_SHERIF: [number, number] = [35.5145, 33.8894] // about 0.5 km away
const BYBLOS: [number, number] = [35.6519, 34.123] // about 29 km north
const ZAHLE: [number, number] = [35.8903, 33.8225] // over the mountain, about 35 km
const TRIPOLI: [number, number] = [35.8497, 34.4367] // about 68 km

const at = (id: number, location: Placed['location'], over: Partial<Placed> = {}): Placed => ({
  id,
  location,
  district: null,
  governorate: null,
  ...over,
})

describe('distanceKm', () => {
  it('measures across Lebanon about right', () => {
    const km = distanceKm(
      { lng: BEIRUT_HOTEL[0], lat: BEIRUT_HOTEL[1] },
      { lng: TRIPOLI[0], lat: TRIPOLI[1] },
    )
    expect(km).toBeGreaterThan(65)
    expect(km).toBeLessThan(72)
  })
})

describe('rankNearby', () => {
  const subject = at(1, BEIRUT_HOTEL, { district: 'beirut', governorate: 'beirut' })

  it('puts the closest first, whatever the directory order', () => {
    const picks = rankNearby(subject, [at(2, BYBLOS), at(3, EM_SHERIF)])
    expect(picks.map((p) => p.id)).toEqual([3, 2])
    expect(picks[0]?.km).toBeLessThan(1)
    expect(picks.every((p) => p.near)).toBe(true)
  })

  it('never suggests the listing itself', () => {
    expect(rankNearby(subject, [at(1, BEIRUT_HOTEL), at(3, EM_SHERIF)]).map((p) => p.id)).toEqual([
      3,
    ])
  })

  it('treats past the radius as not near, but still says how far', () => {
    const [pick] = rankNearby(subject, [at(4, TRIPOLI)])
    expect(pick?.near).toBe(false)
    expect(pick?.km).toBeGreaterThan(NEARBY_RADIUS_KM)
  })

  it('falls back to the district, then the governorate, without coordinates', () => {
    const bare = at(1, null, { district: 'zahle', governorate: 'beqaa' })
    const picks = rankNearby(bare, [
      at(2, null, { district: 'jbeil', governorate: 'mount-lebanon' }),
      at(3, null, { district: 'baalbek', governorate: 'beqaa' }),
      at(4, null, { district: 'zahle', governorate: 'beqaa' }),
    ])
    expect(picks).toEqual([
      { id: 4, km: null, near: true },
      { id: 3, km: null, near: true },
      { id: 2, km: null, near: false },
    ])
  })

  it('prefers a measured neighbour over a same-district guess', () => {
    const picks = rankNearby(subject, [at(2, null, { district: 'beirut' }), at(3, EM_SHERIF)], 2)
    expect(picks.map((p) => p.id)).toEqual([3, 2])
  })

  it('stops at the count asked for', () => {
    const many = [2, 3, 4, 5].map((id) => at(id, EM_SHERIF))
    expect(rankNearby(subject, many)).toHaveLength(3)
  })

  it('ignores a malformed point', () => {
    const picks = rankNearby(subject, [at(2, [Number.NaN, 33]), at(3, ZAHLE)])
    expect(picks.find((p) => p.id === 2)?.km).toBeNull()
  })
})

describe('formatKm', () => {
  it('keeps a decimal only under ten', () => {
    expect(formatKm(0.46)).toBe('0.5')
    expect(formatKm(2.44)).toBe('2.4')
    expect(formatKm(18.6)).toBe('19')
    expect(formatKm(0)).toBe('0.1')
  })
})
