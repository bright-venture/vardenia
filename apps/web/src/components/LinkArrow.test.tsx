import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { LinkArrow } from './LinkArrow'

describe('LinkArrow', () => {
  it('draws a font-independent decorative arrow without changing the link label', () => {
    const html = renderToStaticMarkup(
      <a href="#directory">
        Discover <LinkArrow />
      </a>,
    )
    expect(html).toContain('<svg')
    expect(html).toContain('<path')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('focusable="false"')
    expect(html).toContain('width="1em"')
    expect(html).toContain('height="1em"')
    expect(html).toContain('rtl:-scale-x-100')
    expect(html).not.toContain('↗')
    expect(html.replace(/<[^>]+>/g, '').trim()).toBe('Discover')
    expect(html).toContain('href="#directory"')
  })

  it.each([
    'ContentPage.tsx',
    'journey/CinematicJourney.tsx',
    'journey/MagazineArt.tsx',
    'home/HomePlaces.tsx',
    'home/PrintConnection.tsx',
    'header/DiscoveryMenu.tsx',
  ])('uses SVG navigation arrows in %s', (file) => {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    expect(source).toContain('<LinkArrow />')
    expect(source).not.toContain('↗')
  })
})
