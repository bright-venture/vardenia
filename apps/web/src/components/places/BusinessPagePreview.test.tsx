import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BusinessPagePreview } from './BusinessPagePreview'
import { emptyPreview, type PreviewData } from './preview-model'

const data: PreviewData = {
  ...emptyPreview('en'),
  name: 'Le Petit Jardin',
  tagline: 'Garden dining by the old port',
  description: 'Seasonal Lebanese cooking.',
  category: 'Food & Beverage',
  governorate: 'Byblos',
  address: 'Old Port, Byblos',
  hours: 'Tue-Sun 12:00-23:00',
  phone: '+961 9 000 000',
  amenities: ['Sea view', 'Wifi'],
  heroUrl: 'blob:hero',
  galleryUrls: ['blob:1', 'blob:2', 'blob:3'],
  listingNumber: 47,
}

const templates = ['a', 'b', 'c'] as const

describe('BusinessPagePreview', () => {
  for (const t of templates) {
    describe(`template ${t}`, () => {
      it('renders the name and the page number', () => {
        const html = renderToStaticMarkup(<BusinessPagePreview template={t} data={data} />)
        expect(html).toContain('Le Petit Jardin')
        expect(html).toContain('VARDENIA - 47')
      })

      it('shows placeholders, never undefined or null, when empty', () => {
        const html = renderToStaticMarkup(
          <BusinessPagePreview template={t} data={emptyPreview('en')} />,
        )
        expect(html).not.toMatch(/undefined|null/)
        expect(html).not.toContain('VARDENIA -')
        expect(html).toContain('Your business name')
      })

      it('uses the labels it is given', () => {
        const html = renderToStaticMarkup(
          <BusinessPagePreview
            template={t}
            data={emptyPreview('en')}
            labels={{ name: 'Nom de la place' }}
          />,
        )
        expect(html).toContain('Nom de la place')
      })

      it('is right to left for Arabic and sets lang', () => {
        const html = renderToStaticMarkup(
          <BusinessPagePreview template={t} data={{ ...data, locale: 'ar', name: 'Jardin' }} />,
        )
        expect(html).toContain('dir="rtl"')
        expect(html).toContain('lang="ar"')
      })

      it('clamps a 5000 character description', () => {
        const long = 'x'.repeat(5000)
        const html = renderToStaticMarkup(
          <BusinessPagePreview template={t} data={{ ...data, description: long }} />,
        )
        expect(html).not.toContain(long)
        expect(html).toContain('\u2026')
      })

      it('uses the page ratio variable and no physical direction classes', () => {
        const html = renderToStaticMarkup(<BusinessPagePreview template={t} data={data} />)
        expect(html).toContain('--page-ratio:210 / 297')
        expect(html).not.toMatch(
          /class="[^"]*(?:\b[mp][lr]-|\b(?:left|right)-|text-(?:left|right))/,
        )
      })

      it('puts the business name in the photo alt text', () => {
        const html = renderToStaticMarkup(<BusinessPagePreview template={t} data={data} />)
        expect(html).toContain('alt="Le Petit Jardin"')
      })
    })
  }

  it('keeps the phone paragraph on the page direction in Arabic, digits isolated', () => {
    for (const t of templates) {
      const html = renderToStaticMarkup(
        <BusinessPagePreview template={t} data={{ ...data, locale: 'ar' }} />,
      )
      expect(html).toContain('<p><bdi dir="ltr">+961 9 000 000</bdi></p>')
      expect(html).not.toMatch(/<p[^>]*dir="ltr"[^>]*>\s*\+961/)
    }
  })

  it('takes the body clamp from the layout budget', () => {
    expect(renderToStaticMarkup(<BusinessPagePreview template="a" data={data} />)).toContain(
      '-webkit-line-clamp:4',
    )
  })

  it('renders no scannable-looking code, only a decorative square', () => {
    const html = renderToStaticMarkup(<BusinessPagePreview template="a" data={data} />)
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toMatch(/<svg|<canvas|conic-gradient/)
  })
})
