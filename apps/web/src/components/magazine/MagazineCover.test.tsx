// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MagazineCover } from './MagazineCover'

const render = (media: Parameters<typeof MagazineCover>[0]['media']) => {
  const root = document.createElement('div')
  root.innerHTML = renderToStaticMarkup(<MagazineCover media={media} sizes="50vw" />)
  return root
}

describe('complete magazine cover artwork', () => {
  it('prefers the original A5 artwork over a cropped portrait rendition', () => {
    const root = render({
      url: '/media/cover.webp',
      alt: 'Demo magazine cover',
      width: 1480,
      height: 2100,
      sizes: { portrait: { url: '/media/cover-900x1200.webp', width: 900, height: 1200 } },
    })
    const image = root.querySelector('img')!
    expect(decodeURIComponent(image.src)).toContain('/media/cover.webp')
    expect(image.src).not.toContain('900x1200')
    expect(image.classList.contains('object-contain')).toBe(true)
    expect(image.className).not.toContain('scale')
    expect(image.alt).toBe('Demo magazine cover')
    expect(root.querySelector<HTMLElement>('[data-magazine-cover]')!.style.aspectRatio).toBe(
      '1480 / 2100',
    )
  })

  it('contains artwork when dimensions are absent instead of assuming a crop', () => {
    const root = render({ url: '/media/cover.webp' })
    expect(root.querySelector<HTMLElement>('[data-magazine-cover]')!.style.aspectRatio).toBe(
      '3 / 4',
    )
    expect(root.querySelector('img')!.classList.contains('object-contain')).toBe(true)
  })

  it('retains an available rendition if an original URL is unavailable', () => {
    const root = render({ sizes: { portrait: { url: '/media/available.webp' } } })
    expect(decodeURIComponent(root.querySelector('img')!.src)).toContain('/media/available.webp')
  })

  it('does not invent artwork for a missing or unpopulated cover', () => {
    for (const media of [null, 123, '123']) expect(render(media).querySelector('img')).toBeNull()
  })
})
