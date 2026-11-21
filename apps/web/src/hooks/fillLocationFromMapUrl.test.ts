import { describe, expect, it } from 'vitest'
import { fillLocationFromMapUrl } from './fillLocationFromMapUrl'

type Args = Parameters<typeof fillLocationFromMapUrl>[0]
const run = (data: Record<string, unknown>, originalDoc?: Record<string, unknown>) =>
  fillLocationFromMapUrl({
    data,
    originalDoc,
    operation: originalDoc ? 'update' : 'create',
  } as unknown as Args) as Record<string, unknown>

const LE_GRAY =
  'https://www.google.com/maps/place/Le+Gray/@33.8960,35.5040,17z/data=!3d33.8938!4d35.5018'

describe('fillLocationFromMapUrl', () => {
  it('fills location as [lng, lat] from a link with coordinates', () => {
    expect(run({ mapUrl: LE_GRAY }).location).toEqual([35.5018, 33.8938])
  })

  it('leaves location alone for a short link, and keeps the link', () => {
    const data = run({ mapUrl: 'https://maps.app.goo.gl/AbC', location: [35.1, 33.1] })
    expect(data.location).toEqual([35.1, 33.1])
    expect(data.mapUrl).toBe('https://maps.app.goo.gl/AbC')
  })

  it('leaves location alone for a link with no coordinates', () => {
    expect(run({ mapUrl: 'https://www.google.com/maps/place/Le+Gray' })).not.toHaveProperty(
      'location',
    )
  })

  it('does not overwrite a point set by hand when the link did not change', () => {
    const data = run({ mapUrl: LE_GRAY, location: [35.9, 33.9] }, { mapUrl: LE_GRAY })
    expect(data.location).toEqual([35.9, 33.9])
  })

  it('replaces the point when the link changes', () => {
    const data = run(
      { mapUrl: LE_GRAY },
      { mapUrl: 'https://maps.app.goo.gl/old', location: [35.9, 33.9] },
    )
    expect(data.location).toEqual([35.5018, 33.8938])
  })

  it('does nothing when the write does not carry a link, or clears it', () => {
    expect(run({ name: 'x' }, { mapUrl: LE_GRAY })).not.toHaveProperty('location')
    expect(run({ mapUrl: null }, { mapUrl: LE_GRAY, location: [35.5, 33.8] })).not.toHaveProperty(
      'location',
    )
  })

  it('never fills from a hostile link', () => {
    expect(run({ mapUrl: 'https://evil.com/maps/@33.89,35.50,17z' })).not.toHaveProperty('location')
  })

  it('lets a changed link win over a different point sent in the same write', () => {
    const data = run(
      { mapUrl: LE_GRAY, location: [35.9, 33.9] },
      { mapUrl: 'https://maps.app.goo.gl/old', location: [35.1, 33.1] },
    )
    expect(data.location).toEqual([35.5018, 33.8938])
  })

  it('stores the link trimmed', () => {
    expect(run({ mapUrl: `  ${LE_GRAY}  ` }).mapUrl).toBe(LE_GRAY)
  })
})
