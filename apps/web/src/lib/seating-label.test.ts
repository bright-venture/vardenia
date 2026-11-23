import { describe, expect, it } from 'vitest'
import { seatingAreaLabel } from './seating-label'

const names = { indoor: 'Indoor', 'outdoor-smoking': 'Outdoor, smoking' }
const listing = {
  subcategories: ['restaurants'],
  seatingAreas: [{ setting: 'indoor', smoking: false, tables: 2, label: 'Garden room' }],
}

describe('seatingAreaLabel', () => {
  it('uses the name the listing gave the area', () => {
    expect(seatingAreaLabel(listing, 'indoor', names)).toBe('Garden room')
  })
  it('falls back to the standard name, then to the key', () => {
    expect(seatingAreaLabel({ id: 1 }, 'outdoor-smoking', names)).toBe('Outdoor, smoking')
    expect(seatingAreaLabel(7, 'whatever', names)).toBe('whatever')
  })
  it('is null for a booking without an area', () => {
    expect(seatingAreaLabel(listing, null, names)).toBeNull()
    expect(seatingAreaLabel(listing, '', names)).toBeNull()
  })
})
