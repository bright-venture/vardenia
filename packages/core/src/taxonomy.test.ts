import { describe, expect, it } from 'vitest'
import {
  CATEGORIES,
  canTakeBookings,
  categoryTakesBookings,
  currentSubcategory,
  isActiveSubcategory,
  isBookableSubcategory,
  SUBCATEGORY_MOVES,
  SUBCATEGORY_PARENT,
} from './taxonomy'

const live = (category: string) =>
  CATEGORIES.find((c) => c.slug === category)!
    .children.filter((child) => !child.retired)
    .map((child) => child.slug)

describe('the October 2026 list', () => {
  it('offers exactly the kinds of place the team chose, in their order', () => {
    expect(live('hospitality')).toEqual(['hotels', 'getaways'])
    expect(live('food-and-beverage')).toEqual(['restaurants', 'coffee-shops', 'pools', 'nightlife'])
    expect(live('tourism')).toEqual(['historical-sites', 'tour-guides', 'festivals', 'activities'])
    expect(live('lifestyle')).toEqual(['malls', 'gyms'])
    expect(live('weddings')).toEqual(['wedding-planners'])
    expect(live('transportation')).toEqual([
      'car-rental',
      'airport-transfers',
      'private-chauffeurs',
    ])
  })

  it('retires healthcare and everything in it', () => {
    const healthcare = CATEGORIES.find((c) => c.slug === 'healthcare')!
    expect(healthcare.retired).toBe(true)
    expect(healthcare.children.every((child) => child.retired)).toBe(true)
  })
})

describe('which kinds of place take bookings', () => {
  it('books hotels, getaways, restaurants, tours, activities, planners and drivers', () => {
    for (const slug of [
      'hotels',
      'getaways',
      'restaurants',
      'tour-guides',
      'activities',
      'wedding-planners',
      'car-rental',
      'airport-transfers',
      'private-chauffeurs',
    ]) {
      expect(isBookableSubcategory(slug), slug).toBe(true)
    }
  })

  it('only advertises pools, cafes, nightlife, festivals, historic sites, gyms and malls', () => {
    for (const slug of [
      'pools',
      'coffee-shops',
      'nightlife',
      'festivals',
      'historical-sites',
      'gyms',
      'malls',
    ]) {
      expect(isBookableSubcategory(slug), slug).toBe(false)
    }
  })

  it('never books a retired kind of place', () => {
    expect(isBookableSubcategory('luxury-hotels')).toBe(false)
  })

  it('lets a listing book when any of its kinds of place can', () => {
    expect(canTakeBookings(['pools', 'hotels'])).toBe(true)
    expect(canTakeBookings(['pools', 'nightlife'])).toBe(false)
    expect(canTakeBookings([])).toBe(false)
  })

  it('knows which sections have anything bookable at all', () => {
    expect(categoryTakesBookings('hospitality')).toBe(true)
    expect(categoryTakesBookings('food-and-beverage')).toBe(true)
    expect(categoryTakesBookings('lifestyle')).toBe(false)
    expect(categoryTakesBookings(null)).toBe(false)
  })
})

describe('retired slugs', () => {
  it('moves every one that had listings to a live one', () => {
    for (const [from, to] of Object.entries(SUBCATEGORY_MOVES)) {
      expect(isActiveSubcategory(from), from).toBe(false)
      expect(isActiveSubcategory(to), to).toBe(true)
    }
  })

  it('keeps a move inside its section, except where the section changed on purpose', () => {
    const crossing = Object.entries(SUBCATEGORY_MOVES)
      .filter(([from, to]) => SUBCATEGORY_PARENT[from] !== SUBCATEGORY_PARENT[to])
      .map(([from]) => from)
    // Wineries became activities, and the gyms left healthcare earlier.
    expect(crossing.sort()).toEqual(['wellness', 'wine-experiences'])
  })

  it('translates an old link to the live slug', () => {
    expect(currentSubcategory('boutique-hotels')).toBe('hotels')
    expect(currentSubcategory('hotels')).toBe('hotels')
    expect(currentSubcategory('photographers')).toBeNull()
    expect(currentSubcategory(null)).toBeNull()
  })
})
