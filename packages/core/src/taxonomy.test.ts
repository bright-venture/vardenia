import { describe, expect, it } from 'vitest'
import {
  CATEGORIES,
  canTakeBookings,
  categoryTakesBookings,
  isBookableSubcategory,
  SUBCATEGORY_PARENT,
} from './taxonomy'

const kinds = (category: string) =>
  CATEGORIES.find((c) => c.slug === category)!.children.map((child) => child.slug)

describe('the October 2026 list', () => {
  it('has the six categories, and no healthcare', () => {
    expect(CATEGORIES.map((c) => c.slug)).toEqual([
      'hospitality',
      'food-and-beverage',
      'tourism',
      'weddings',
      'lifestyle',
      'transportation',
    ])
  })

  it('offers exactly the kinds of place the team chose, in their order', () => {
    expect(kinds('hospitality')).toEqual(['hotels', 'getaways'])
    expect(kinds('food-and-beverage')).toEqual(['restaurants', 'cafes', 'pools', 'nightlife'])
    expect(kinds('tourism')).toEqual(['historic-sites', 'guided-tours', 'festivals', 'activities'])
    expect(kinds('weddings')).toEqual(['event-planners'])
    expect(kinds('lifestyle')).toEqual(['malls', 'gyms'])
    expect(kinds('transportation')).toEqual(['car-rental', 'airport-transfers', 'private-drivers'])
  })

  it('has sixteen kinds of place, each under one category', () => {
    expect(Object.keys(SUBCATEGORY_PARENT)).toHaveLength(16)
  })

  it('carries nothing retired: the old slugs were deleted before launch', () => {
    expect(CATEGORIES.some((c) => c.retired || c.children.some((child) => child.retired))).toBe(
      false,
    )
  })
})

describe('which kinds of place take bookings', () => {
  it('books hotels, getaways, restaurants, tours, activities, planners and drivers', () => {
    for (const slug of [
      'hotels',
      'getaways',
      'restaurants',
      'guided-tours',
      'activities',
      'event-planners',
      'car-rental',
      'airport-transfers',
      'private-drivers',
    ]) {
      expect(isBookableSubcategory(slug), slug).toBe(true)
    }
  })

  it('only advertises pools, cafes, nightlife, festivals, historic sites, gyms and malls', () => {
    for (const slug of [
      'pools',
      'cafes',
      'nightlife',
      'festivals',
      'historic-sites',
      'gyms',
      'malls',
    ]) {
      expect(isBookableSubcategory(slug), slug).toBe(false)
    }
  })

  it('never books a slug it does not know', () => {
    expect(isBookableSubcategory('luxury-hotels')).toBe(false)
    expect(isBookableSubcategory(null)).toBe(false)
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
