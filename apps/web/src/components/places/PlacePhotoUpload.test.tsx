// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'

// The canvas half of photo handling needs a real browser.
vi.mock('./photos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./photos')>()
  return { ...actual, preparePhoto: vi.fn(async (file: File) => file) }
})

import { PlacePhotoUpload, __resetCapturedToken } from './PlacePhotoUpload'

const m = getMessages('en').magazinePlaces.upload

describe('PlacePhotoUpload', () => {
  let container: HTMLDivElement
  let root: Root
  let fetchMock: ReturnType<typeof vi.fn>

  const mount = async (hash: string) => {
    window.history.replaceState(null, '', `/en/magazine-places/upload${hash}`)
    await act(async () =>
      root.render(
        <NextIntlClientProvider locale="en" messages={getMessages('en')} timeZone="Asia/Beirut">
          <PlacePhotoUpload />
        </NextIntlClientProvider>,
      ),
    )
  }
  const input = (slot: string) =>
    container.querySelector<HTMLInputElement>(`input[name="${slot}"]`)!
  const pick = async (el: HTMLInputElement, file: File) => {
    Object.defineProperty(el, 'files', { configurable: true, value: [file] })
    await act(async () => {
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }
  const png = () => new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })
  const ok = (logo: boolean, hero: boolean) =>
    new Response(JSON.stringify({ ok: true, logoReceived: logo, heroReceived: hero }))

  beforeEach(() => {
    __resetCapturedToken()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    fetchMock = vi.fn(async () => ok(true, false))
    vi.stubGlobal('fetch', fetchMock)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it('reads the token from the fragment and removes it from the address bar at once', async () => {
    await mount('#t=secret-token')
    expect(window.location.hash).toBe('')
    expect(window.location.href).not.toContain('secret-token')
    expect(container.innerHTML).not.toContain('secret-token')
    expect(input('logo')).toBeTruthy()
    expect(input('hero')).toBeTruthy()
  })

  it('posts the file with the remembered token (body, not URL) and shows received', async () => {
    await mount('#t=secret-token')
    await pick(input('logo'), png())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/place-uploads')
    const form = init.body as FormData
    expect(form.get('sessionToken')).toBe('secret-token')
    expect(form.get('slot')).toBe('logo')
    expect(container.querySelector('[data-slot-state="received"]')!.textContent).toBe(m.received)
    expect(container.querySelector('input[name="hero"]')).toBeTruthy()
  })

  it('shows the second slot on its own, and a thank-you once both are in', async () => {
    await mount('#t=tok')
    await pick(input('logo'), png())
    fetchMock.mockResolvedValueOnce(ok(true, true))
    await pick(input('hero'), png())
    expect(container.textContent).toContain(m.bothDone)
  })

  it('shows a plain failure for one slot and lets the owner try again', async () => {
    await mount('#t=tok')
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 415 }))
    await pick(input('hero'), png())
    expect(container.textContent).toContain(m.badFile)
    expect(container.querySelector('[data-slot-state="received"]')).toBeNull()
    fetchMock.mockResolvedValueOnce(ok(false, true))
    await pick(input('hero'), png())
    expect(container.textContent).not.toContain(m.badFile)
    expect(container.querySelector('[data-slot-state="received"]')).toBeTruthy()
  })

  it('says the link is dead when there is no token', async () => {
    await mount('')
    expect(container.querySelector('[data-upload-dead]')).toBeTruthy()
    expect(container.textContent).toContain(m.deadTitle)
    expect(container.querySelector('input[type="file"]')).toBeNull()
  })

  it('says the link is dead when the server answers 404', async () => {
    await mount('#t=old')
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 404 }))
    await pick(input('logo'), png())
    expect(container.querySelector('[data-upload-dead]')).toBeTruthy()
    expect(container.querySelector('input[type="file"]')).toBeNull()
  })

  it('has no visible string left as a raw key', async () => {
    await mount('#t=tok')
    expect(container.textContent).not.toMatch(/magazinePlaces\./)
  })
})
