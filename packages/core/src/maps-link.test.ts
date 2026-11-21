import { describe, expect, it } from 'vitest'
import { isValidPoint, mapsUrlProblem, parseMapsLink, pointFromMapsUrl } from './maps-link'

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
    'https://www.google.com/maps/search/33.8938,35.5018',
    'https://www.google.com/maps/search/33.8938,+35.5018',
  ])('reads a shared point: %s', (link) => {
    expect(parseMapsLink(link)).toEqual({ ok: true, lat: 33.8938, lng: 35.5018 })
  })

  it.each([
    'https://maps.google.com/?q=12,34 Main St',
    'https://maps.google.com/?q=12,34+Main+St',
    'https://maps.google.com/?q=33.5,35.5abc',
  ])('does not read an address that starts with numbers as a point: %s', (link) => {
    expect(parseMapsLink(link)).toEqual({ ok: false, reason: 'no-coordinates' })
  })

  it('still reads a point followed by more parameters', () => {
    expect(parseMapsLink('https://maps.google.com/?q=33.89,35.50&z=12')).toEqual({
      ok: true,
      lat: 33.89,
      lng: 35.5,
    })
    expect(parseMapsLink('https://maps.google.com/?q=33.89,35.50#x')).toEqual({
      ok: true,
      lat: 33.89,
      lng: 35.5,
    })
  })

  it('reads numbers copied straight from the map', () => {
    expect(parseMapsLink(' 33.8938, 35.5018 ')).toEqual({ ok: true, lat: 33.8938, lng: 35.5018 })
  })

  it('reads a negative longitude and latitude', () => {
    expect(parseMapsLink('https://www.google.com/maps/@-33.86,-70.65,12z')).toEqual({
      ok: true,
      lat: -33.86,
      lng: -70.65,
    })
  })

  it.each(['https://maps.app.goo.gl/AbCdEf123', 'https://goo.gl/maps/AbCdEf123'])(
    'says a short link cannot be read: %s',
    (link) => {
      expect(parseMapsLink(link)).toEqual({ ok: false, reason: 'short-link' })
    },
  )

  it('finds nothing in text without coordinates', () => {
    expect(parseMapsLink('Hamra Street, Beirut')).toEqual({ ok: false, reason: 'no-coordinates' })
  })

  it('ignores coordinates out of range', () => {
    expect(parseMapsLink('https://www.google.com/maps/@91.0,35.5,15z')).toEqual({
      ok: false,
      reason: 'no-coordinates',
    })
    expect(parseMapsLink('https://www.google.com/maps/@33.5,181.0,15z')).toEqual({
      ok: false,
      reason: 'no-coordinates',
    })
  })
})

describe('mapsUrlProblem', () => {
  it.each([
    'https://www.google.com/maps/place/Le+Gray/@33.89,35.50,17z',
    'https://google.com/maps?q=33.89,35.50',
    'https://maps.google.com/?q=33.89,35.50',
    'https://maps.google.com',
    'https://maps.app.goo.gl/AbCdEf123',
    'https://goo.gl/maps/AbCdEf123',
    'https://www.GOOGLE.com/maps/@33.89,35.50,17z',
    'https://maps.google.com/?q=33.89,35.50',
    'https://maps.google.com/maps?q=33.89,35.50',
    'https://maps.google.com/maps/place/x',
    'https://MAPS.APP.GOO.GL/AbC',
    '  https://www.google.com/maps/@33.89,35.50,17z  ',
  ])('accepts %s', (url) => {
    expect(mapsUrlProblem(url)).toBeNull()
  })

  it.each([
    ['http://www.google.com/maps/@33,35,1z', 'not https'],
    ['https://google.com.evil.com/maps/@33,35,1z', 'lookalike suffix'],
    ['https://evil.com/google.com/maps', 'host in path'],
    ['https://notgoogle.com/maps', 'lookalike prefix'],
    ['https://www.google.com@evil.com/maps', 'userinfo trick'],
    ['https://evil.com@www.google.com/maps', 'userinfo'],
    ['https://user:pw@www.google.com/maps', 'credentials'],
    ['https://www.google.com\\@evil.com/maps', 'backslash'],
    ['https://www.google.com/search?q=maps', 'google but not maps'],
    ['https://goo.gl/abc123', 'goo.gl not maps'],
    ['https://www.google.com:8443/maps', 'port'],
    ['javascript:alert(1)', 'script'],
    ['//www.google.com/maps', 'no scheme'],
    ['www.google.com/maps', 'no scheme'],
    ['https://www.google.com/maps/ x', 'whitespace'],
    ['not a url', 'garbage'],
    ['', 'empty'],
    ['https://sites.google.com/maps/evil', 'user-content subdomain'],
    ['https://drive.google.com/maps', 'other google subdomain'],
    ['https://docs.google.com/maps/d/x', 'other google subdomain'],
    ['https://maps.google.com/url?q=https://evil.com', 'redirect path'],
    ['https://maps.google.com/url', 'redirect path'],
    ['https://maps.google.com/other/path', 'not a maps path'],
    ['https://google.com@evil.com/maps', 'literal userinfo trick'],
    ['https://GOOGLE.COM.EVIL.COM/maps', 'uppercase lookalike'],
    ['https://www.google.com/mapsevil', 'path prefix only'],
    ['https://foo.maps.app.goo.gl/x', 'subdomain of a short host'],
    ['https://foo.goo.gl/maps/x', 'subdomain of goo.gl'],
  ])('refuses %s (%s)', (url) => {
    expect(mapsUrlProblem(url)).not.toBeNull()
  })

  it('refuses a very long link', () => {
    expect(mapsUrlProblem(`https://www.google.com/maps/${'a'.repeat(3000)}`)).not.toBeNull()
  })
})

describe('pointFromMapsUrl', () => {
  it('stores [longitude, latitude], the order Payload keeps a point in', () => {
    // Le Gray, Beirut: latitude 33.8938, longitude 35.5018.
    expect(pointFromMapsUrl('https://www.google.com/maps/@33.8938,35.5018,17z')).toEqual([
      35.5018, 33.8938,
    ])
  })

  it('gives nothing for a short link, so location is left alone', () => {
    expect(pointFromMapsUrl('https://maps.app.goo.gl/AbCdEf123')).toBeNull()
    expect(pointFromMapsUrl('https://goo.gl/maps/AbCdEf123')).toBeNull()
  })

  it('gives nothing for a link with no coordinates or a hostile host', () => {
    expect(pointFromMapsUrl('https://www.google.com/maps/place/Le+Gray')).toBeNull()
    expect(pointFromMapsUrl('https://evil.com/maps/@33.89,35.50,17z')).toBeNull()
  })
})

describe('isValidPoint', () => {
  it.each([[[35.5, 33.9]], [[0, 0]], [[-180, -90]], [[180, 90]], [['35.5', '33.9']]])(
    'accepts %j',
    (value) => {
      expect(isValidPoint(value)).toBe(true)
    },
  )

  it.each([
    [[33.9]],
    [[1, 2, 3]],
    [[35.5, 91]],
    [[35.5, -91]],
    [[181, 33.9]],
    [[-181, 33.9]],
    [[NaN, 33.9]],
    [[Infinity, 33.9]],
    [['abc', 33.9]],
    [['', 33.9]],
    [[null, 33.9]],
    [{ lat: 33.9, lng: 35.5 }],
    ['35.5,33.9'],
    [[]],
  ])('refuses %j', (value) => {
    expect(isValidPoint(value)).toBe(false)
  })
})
