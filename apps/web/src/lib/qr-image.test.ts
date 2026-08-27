import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PRINT_MM,
  MAX_PRINT_MM,
  MIN_PRINT_MM,
  formatFromParam,
  parseCodeParam,
  qrPng,
  qrSvg,
  scanUrl,
  formatFromWord,
} from './qr-image'

const CODE = 'K3M9QP2'

describe('scanUrl', () => {
  it('encodes the redirect route, never the destination', () => {
    expect(scanUrl(CODE, 'https://vardenia.com')).toBe('https://vardenia.com/g/K3M9QP2')
  })

  it('tolerates a trailing slash on the site URL', () => {
    expect(scanUrl(CODE, 'https://vardenia.com/')).toBe('https://vardenia.com/g/K3M9QP2')
  })
})

describe('qrSvg', () => {
  it('carries a physical size so it lands in a layout at the right scale', async () => {
    const svg = await qrSvg(CODE, { siteUrl: 'https://vardenia.com' })
    expect(svg).toContain(`width="${DEFAULT_PRINT_MM}mm"`)
    expect(svg).toContain(`height="${DEFAULT_PRINT_MM}mm"`)
  })

  /**
   * Rewriting the opening tag once produced `<svgxmlns="...">`. Served as
   * image/svg+xml that is parsed as strict XML and simply does not render, with
   * nothing in the console to say why.
   */
  it('produces a well formed opening tag', async () => {
    const svg = await qrSvg(CODE, { siteUrl: 'https://vardenia.com' })
    expect(svg.startsWith('<svg ')).toBe(true)
    expect(svg).toContain(' xmlns="http://www.w3.org/2000/svg"')
    expect(svg).not.toMatch(/<svg[^\s>]/)
  })

  it('separates every attribute in the opening tag', async () => {
    const svg = await qrSvg(CODE, { siteUrl: 'https://vardenia.com' })
    const openingTag = svg.slice(0, svg.indexOf('>') + 1)

    // Strip well-formed `name="value"` pairs one at a time. Anything left over
    // means two attributes ran together, which is exactly the failure above.
    const remainder = openingTag
      .replace(/^<svg/, '')
      .replace(/>$/, '')
      .replace(/\s+[a-zA-Z-]+="[^"]*"/g, '')
      .trim()

    expect(remainder).toBe('')
  })

  it('keeps the viewBox, so the code stays scalable', async () => {
    const svg = await qrSvg(CODE, { siteUrl: 'https://vardenia.com' })
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/)
  })

  it('never emits duplicate width or height attributes', async () => {
    const svg = await qrSvg(CODE, { siteUrl: 'https://vardenia.com' })
    const openingTag = svg.slice(0, svg.indexOf('>') + 1)
    expect(openingTag.match(/\swidth=/g)).toHaveLength(1)
    expect(openingTag.match(/\sheight=/g)).toHaveLength(1)
  })

  it('refuses to go below the size that still scans on paper', async () => {
    const svg = await qrSvg(CODE, { siteUrl: 'https://vardenia.com', sizeMm: 2 })
    expect(svg).toContain(`width="${MIN_PRINT_MM}mm"`)
  })

  it('honours a larger requested size', async () => {
    const svg = await qrSvg(CODE, { siteUrl: 'https://vardenia.com', sizeMm: 60 })
    expect(svg).toContain('width="60mm"')
  })

  /**
   * The one that matters most. A cropped quiet zone is the commonest cause of a
   * printed code that will not scan, and it is invisible until the copies land.
   */
  it('keeps a four module quiet zone on every side', async () => {
    const svg = await qrSvg(CODE, { siteUrl: 'https://vardenia.com' })

    const viewBox = /viewBox="0 0 (\d+) (\d+)"/.exec(svg)
    expect(viewBox).not.toBeNull()
    const size = Number(viewBox![1])

    // Only the stroked path holds the dark modules. The other path is the white
    // background, which covers the full viewBox by design and would mask this.
    const darkPath = /<path stroke="#000000" d="([^"]+)"/.exec(svg)?.[1]
    expect(darkPath).toBeDefined()

    // Dark modules are drawn as horizontal runs: "M<x> <y>h<len>".
    const runs = [...(darkPath ?? '').matchAll(/M(\d+(?:\.\d+)?) (\d+(?:\.\d+)?)h(\d+)/g)].map(
      (m) => ({
        x: Number(m[1]),
        y: Number(m[2]),
        len: Number(m[3]),
      }),
    )
    expect(runs.length).toBeGreaterThan(0)

    const minX = Math.min(...runs.map((r) => r.x))
    const maxX = Math.max(...runs.map((r) => r.x + r.len))
    const minY = Math.min(...runs.map((r) => r.y))
    const maxY = Math.max(...runs.map((r) => r.y))

    expect(minX).toBeGreaterThanOrEqual(4)
    expect(minY).toBeGreaterThanOrEqual(4)
    expect(size - maxX).toBeGreaterThanOrEqual(4)
    expect(size - maxY).toBeGreaterThanOrEqual(4)
  })

  it('produces a different symbol for a different code', async () => {
    const a = await qrSvg(CODE, { siteUrl: 'https://vardenia.com' })
    const b = await qrSvg('AASBVQR', { siteUrl: 'https://vardenia.com' })
    expect(a).not.toBe(b)
  })
})

describe('qrPng', () => {
  it('returns a real PNG', async () => {
    const png = await qrPng(CODE, { siteUrl: 'https://vardenia.com', pixels: 128 })
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  })

  // Slowest test in the suite by a wide margin, and deliberately so: it asks for
  // a 100000px image to prove the clamp holds. Even clamped, that is a real PNG
  // encode. It runs in well under a second normally, but roughly ten times that
  // under coverage instrumentation, which puts it past vitest's 5s default. An
  // explicit timeout so it stays a size check rather than a speed check.
  it('clamps absurd sizes rather than trying to allocate them', async () => {
    const png = await qrPng(CODE, { siteUrl: 'https://vardenia.com', pixels: 100000 })
    expect(png.byteLength).toBeGreaterThan(0)
  }, 30_000)
})

describe('parseCodeParam', () => {
  it('accepts a bare code', () => {
    expect(parseCodeParam('K3M9QP2')).toBe('K3M9QP2')
  })

  it('accepts the code with a file extension, so /qr/K3M9QP2.svg works', () => {
    expect(parseCodeParam('K3M9QP2.svg')).toBe('K3M9QP2')
    expect(parseCodeParam('K3M9QP2.png')).toBe('K3M9QP2')
  })

  it('folds the confusable characters the alphabet excludes', () => {
    expect(parseCodeParam('k3m9qp2')).toBe('K3M9QP2')
    expect(parseCodeParam('OI23456')).toBe('0123456')
  })

  it('rejects anything the wrong length or outside the alphabet', () => {
    expect(parseCodeParam('SHORT')).toBeNull()
    expect(parseCodeParam('WAYTOOLONG')).toBeNull()
    expect(parseCodeParam('../../etc')).toBeNull()
  })
})

/**
 * The size arrives from a query string, so both ends need a bound. The lower one
 * protects a code that would not scan on paper; the upper one stops
 * `?size=99999` producing a hundred-metre symbol in someone's layout tool.
 */
describe('print size bounds', () => {
  it('caps an absurd size', async () => {
    const svg = await qrSvg(CODE, { siteUrl: 'https://vardenia.com', sizeMm: 99999 })
    expect(svg).toContain(`width="${MAX_PRINT_MM}mm"`)
  })

  it('still honours a large but plausible poster size', async () => {
    const svg = await qrSvg(CODE, { siteUrl: 'https://vardenia.com', sizeMm: 400 })
    expect(svg).toContain('width="400mm"')
  })

  it('falls back rather than writing NaN into the attribute', async () => {
    const svg = await qrSvg(CODE, { siteUrl: 'https://vardenia.com', sizeMm: Number.NaN })
    expect(svg).toContain(`width="${DEFAULT_PRINT_MM}mm"`)
    expect(svg).not.toContain('NaN')
  })

  it('handles infinity the same way as any other oversize request', async () => {
    const svg = await qrSvg(CODE, { siteUrl: 'https://vardenia.com', sizeMm: Infinity })
    expect(svg).toContain(`width="${DEFAULT_PRINT_MM}mm"`)
  })
})

/**
 * parseCodeParam has always stripped the extension so the lookup works, which
 * made `/qr/CODE.png` look supported while it quietly returned an SVG. A file
 * that downloads fine and is the wrong format is the worst outcome here: it
 * surfaces in a layout tool, possibly after going to print.
 */
describe('formatFromParam', () => {
  it('reads the extension', () => {
    expect(formatFromParam('K3M9QP2.png')).toBe('png')
    expect(formatFromParam('K3M9QP2.svg')).toBe('svg')
  })

  it('is case insensitive, because URLs get typed by hand', () => {
    expect(formatFromParam('K3M9QP2.PNG')).toBe('png')
    expect(formatFromParam('K3M9QP2.Svg')).toBe('svg')
  })

  it('returns null with no extension, so the caller keeps its default', () => {
    expect(formatFromParam('K3M9QP2')).toBeNull()
  })

  it('ignores extensions it does not serve', () => {
    expect(formatFromParam('K3M9QP2.jpg')).toBeNull()
    expect(formatFromParam('K3M9QP2.pdf')).toBeNull()
  })

  it('agrees with parseCodeParam on the same input', () => {
    expect(parseCodeParam('K3M9QP2.png')).toBe('K3M9QP2')
    expect(formatFromParam('K3M9QP2.png')).toBe('png')
  })
})

/**
 * Two functions that answer nearly the same question, which is why they are
 * tested together.
 *
 * `formatFromParam` reads a filename and needs the dot. `formatFromWord` reads
 * a query value and must not. The export route used the first for the second
 * job: `?format=png` returned null, fell back to SVG, and shipped an archive of
 * SVG files named `.svg` to everybody who asked for PNG. Nothing looked wrong
 * until the zip was opened.
 */
describe('the two format parsers, and the difference between them', () => {
  it('formatFromParam reads an extension', () => {
    expect(formatFromParam('K3M9QP2.png')).toBe('png')
    expect(formatFromParam('K3M9QP2.svg')).toBe('svg')
  })

  /** The exact input that caused the bug. */
  it('formatFromParam does not read a bare word', () => {
    expect(formatFromParam('png')).toBeNull()
    expect(formatFromParam('svg')).toBeNull()
  })

  it('formatFromWord reads a bare word', () => {
    expect(formatFromWord('png')).toBe('png')
    expect(formatFromWord('svg')).toBe('svg')
    expect(formatFromWord('PNG')).toBe('png')
    expect(formatFromWord('  svg  ')).toBe('svg')
  })

  it('formatFromWord refuses anything else, including a filename', () => {
    for (const value of ['jpg', '', '  ', 'pngg', 'K3M9QP2.png', null]) {
      expect(formatFromWord(value), String(value)).toBeNull()
    }
  })
})
