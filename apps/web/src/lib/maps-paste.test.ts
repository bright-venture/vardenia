import { describe, expect, it } from 'vitest'
import { parseMapsLink } from './maps-paste'

describe('parseMapsLink', () => {
  it('reads the pin from a place link, not the map centre', () => {
    const link =
      'https://www.google.com/maps/place/Le+Gray/@33.8960,35.5040,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d33.8938!4d35.5018'
    expect(parseMapsLink(link)).toEqual({ ok: true, lat: 33.8938, lng: 35.5018 })
  })

  it('reads the centre of a plain map link', () => {
    expect(parseMapsLink('https://www.google.com/maps/@34.1231,35.6512,15z')).toEqual({
      ok: true,
      lat: 34.1231,
      lng: 35.6512,
    })
  })

  it.each([
    'https://maps.google.com/?q=33.8938,35.5018',
    'https://www.google.com/maps/search/?api=1&query=33.8938%2C35.5018',
    'https://maps.google.com/maps?ll=33.8938,35.5018&z=16',
  ])('reads a shared point: %s', (link) => {
    expect(parseMapsLink(link)).toEqual({ ok: true, lat: 33.8938, lng: 35.5018 })
  })

  it('reads numbers copied straight from the map', () => {
    expect(parseMapsLink(' 33.8938, 35.5018 ')).toEqual({ ok: true, lat: 33.8938, lng: 35.5018 })
  })

  it('says a short link cannot be read, rather than failing silently', () => {
    expect(parseMapsLink('https://maps.app.goo.gl/AbCdEf123')).toEqual({
      ok: false,
      reason: 'short-link',
    })
  })

  it('finds nothing in text without coordinates', () => {
    expect(parseMapsLink('Hamra Street, Beirut')).toEqual({ ok: false, reason: 'no-coordinates' })
  })
})
