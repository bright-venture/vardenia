// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot, type Root } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import type { Locale } from '@vardenia/i18n'

// The canvas half of photo handling needs a real browser; here a photo passes
// through unchanged so the form logic around it can be exercised.
vi.mock('./photos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./photos')>()
  return { ...actual, preparePhoto: vi.fn(async (file: File) => file) }
})

import { PlaceSubmissionForm } from './PlaceSubmissionForm'

const wrap = (locale: Locale) => (
  <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Beirut">
    <PlaceSubmissionForm locale={locale} />
  </NextIntlClientProvider>
)

const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html')

describe('PlaceSubmissionForm, first paint', () => {
  it('runs left to right in English and right to left in Arabic', () => {
    const en = doc(renderToStaticMarkup(wrap('en')))
    expect(en.querySelector('[data-place-form]')!.getAttribute('dir')).toBe('ltr')
    const ar = doc(renderToStaticMarkup(wrap('ar')))
    expect(ar.querySelector('[data-place-form]')!.getAttribute('dir')).toBe('rtl')
    expect(ar.body.textContent).toContain(getMessages('ar').magazinePlaces.form.submit)
  })

  it('puts the preview above the fields, on template A', () => {
    const page = doc(renderToStaticMarkup(wrap('en')))
    const preview = page.querySelector('[data-template]')!
    expect(preview.getAttribute('data-template')).toBe('a')
    const firstField = page.querySelector('input[name="name"]')!
    expect(
      preview.compareDocumentPosition(firstField) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('starts with Submit disabled and says why', () => {
    const page = doc(renderToStaticMarkup(wrap('en')))
    const submit = page.querySelector('button[type="submit"]')!
    expect(submit.hasAttribute('disabled')).toBe(true)
    expect(page.body.textContent).toContain(getMessages('en').magazinePlaces.form.submitNeeds)
  })

  it('lets the owner phone take 40 characters (the schema limit) and the public phone 20', () => {
    const page = doc(renderToStaticMarkup(wrap('en')))
    expect(page.querySelector('input[name="ownerPhone"]')!.getAttribute('maxlength')).toBe('40')
    expect(page.querySelector('input[name="publicPhone"]')!.getAttribute('maxlength')).toBe('20')
  })

  it('has a translated hotels-and-getaways error in every locale', () => {
    const en = getMessages('en').magazinePlaces.errors as Record<string, string>
    for (const locale of ['en', 'ar', 'fr', 'es', 'pt', 'ru', 'zh', 'hi', 'bn', 'ur'] as const) {
      const errors = getMessages(locale).magazinePlaces.errors as Record<string, string>
      expect(errors.hotelAndGetaway, locale).toBeTruthy()
      if (locale !== 'en') expect(errors.hotelAndGetaway, locale).not.toBe(en.hotelAndGetaway)
    }
  })

  it('has no visible string left as a raw key', () => {
    const text = doc(renderToStaticMarkup(wrap('ar'))).body.textContent ?? ''
    expect(text).not.toMatch(/magazinePlaces\.|form\.[a-z]/)
  })
})

describe('PlaceSubmissionForm, in use', () => {
  let container: HTMLDivElement
  let root: Root
  let fetchMock: ReturnType<typeof vi.fn>
  const m = getMessages('en').magazinePlaces

  const numbersReply = (taken: number[] = []) =>
    new Response(
      JSON.stringify({
        ok: true,
        issues: [{ issueId: 1, issueTitle: 'All Lebanon', from: 1, to: 10, taken }],
      }),
      { status: 200 },
    )

  const q = <T extends Element>(selector: string) => container.querySelector<T>(selector)!
  const submitButton = () => q<HTMLButtonElement>('button[type="submit"]')
  const numberButton = (n: number) => q<HTMLButtonElement>(`button[data-number="${n}"]`)

  const setValue = async (
    el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
    value: string,
  ) => {
    const proto = Object.getPrototypeOf(el)
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
    await act(async () => {
      el.dispatchEvent(
        new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }),
      )
    })
  }
  const click = (el: Element) =>
    act(async () => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
  const addFile = async (input: HTMLInputElement, file: File) => {
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }

  beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    let n = 0
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn(() => `blob:test-${++n}`),
        revokeObjectURL: vi.fn(),
      }),
    )
    fetchMock = vi.fn(async () => numbersReply())
    vi.stubGlobal('fetch', fetchMock)
    Element.prototype.scrollIntoView = vi.fn()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root.render(wrap('en')))
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it('switches the preview to template C', async () => {
    await click(q('input[name="pageTemplate"][value="c"]'))
    expect(q('[data-template]').getAttribute('data-template')).toBe('c')
  })

  it('loads the numbers for a governorate and shows the chosen one on the page', async () => {
    await setValue(q('select[name="governorate"]'), 'keserwan')
    expect(fetchMock).toHaveBeenCalledWith(
      '/place-submissions/numbers?governorate=keserwan',
      expect.objectContaining({ cache: 'no-store' }),
    )
    await click(numberButton(4))
    expect(numberButton(4).getAttribute('aria-pressed')).toBe('true')
    expect(q('[data-template]').textContent).toContain('VARDENIA - 4')
  })

  it('keeps Submit disabled until both a number and a main photo are chosen', async () => {
    expect(submitButton().disabled).toBe(true)
    await setValue(q('select[name="governorate"]'), 'keserwan')
    await click(numberButton(4))
    expect(submitButton().disabled).toBe(true)
    await addFile(q('input[name="hero"]'), new File(['x'], 'hero.jpg', { type: 'image/jpeg' }))
    expect(submitButton().disabled).toBe(false)
  })

  it('refuses a photo that is not JPEG, PNG or WebP', async () => {
    await addFile(q('input[name="hero"]'), new File(['x'], 'hero.gif', { type: 'image/gif' }))
    expect(container.textContent).toContain(m.errors.photoType)
  })

  it('revokes the old object URL when the main photo is replaced', async () => {
    await addFile(q('input[name="hero"]'), new File(['x'], 'a.jpg', { type: 'image/jpeg' }))
    await addFile(q('input[name="hero"]'), new File(['y'], 'b.jpg', { type: 'image/jpeg' }))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-1')
  })

  async function fillAndPick() {
    await setValue(q('input[name="name"]'), 'Le Petit Jardin')
    await setValue(q('select[name="category"]'), 'food-and-beverage')
    await setValue(q('select[name="governorate"]'), 'keserwan')
    await setValue(q('input[name="address"]'), 'Old Port, Byblos')
    await setValue(q('input[name="ownerName"]'), 'Rita Haddad')
    await setValue(q('input[name="ownerEmail"]'), 'rita@example.com')
    await setValue(q('input[name="ownerPhone"]'), '+961 3 000 000')
    await click(numberButton(4))
    await addFile(q('input[name="hero"]'), new File(['x'], 'hero.jpg', { type: 'image/jpeg' }))
  }

  it('shows field errors next to their inputs without posting', async () => {
    await setValue(q('select[name="governorate"]'), 'keserwan')
    await click(numberButton(4))
    await addFile(q('input[name="hero"]'), new File(['x'], 'hero.jpg', { type: 'image/jpeg' }))
    const calls = fetchMock.mock.calls.length
    await act(async () => q<HTMLFormElement>('form').requestSubmit())
    expect(fetchMock.mock.calls.length).toBe(calls)
    const name = q<HTMLInputElement>('input[name="name"]')
    expect(name.getAttribute('aria-invalid')).toBe('true')
    const describedBy = name.getAttribute('aria-describedby')!
    expect(container.querySelector(`[id="${describedBy.split(' ').pop()}"]`)!.textContent).toBe(
      m.errors.required,
    )
  })

  it('on a 409 clears the number, reloads the picker and says so, keeping the input', async () => {
    await fillAndPick()
    fetchMock.mockImplementationOnce(
      async () =>
        new Response(JSON.stringify({ ok: false, code: 'number-unavailable' }), { status: 409 }),
    )
    fetchMock.mockImplementationOnce(async () => numbersReply([4]))
    await act(async () => q<HTMLFormElement>('form').requestSubmit())
    expect(container.textContent).toContain(m.numbers.justTaken)
    expect(numberButton(4).disabled).toBe(true)
    expect(container.querySelector('button[aria-pressed="true"]')).toBeNull()
    expect(q<HTMLInputElement>('input[name="name"]').value).toBe('Le Petit Jardin')
    expect(submitButton().disabled).toBe(true)
  })

  it('says when there are too many attempts', async () => {
    await fillAndPick()
    fetchMock.mockImplementationOnce(async () => new Response('Too many requests', { status: 429 }))
    await act(async () => q<HTMLFormElement>('form').requestSubmit())
    expect(container.textContent).toContain(m.errors.rateLimited)
    expect(container.textContent).not.toContain('Too many requests')
  })

  it('posts multipart and shows the review notice', async () => {
    await fillAndPick()
    fetchMock.mockImplementationOnce(
      async () => new Response(JSON.stringify({ ok: true }), { status: 201 }),
    )
    await act(async () => q<HTMLFormElement>('form').requestSubmit())
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit]
    expect(url).toBe('/place-submissions')
    const data = JSON.parse((init.body as FormData).get('data') as string)
    expect(data).toMatchObject({ issue: 1, listingNumber: 4, locale: 'en', pageTemplate: 'a' })
    expect(container.querySelector('[role="status"]')!.textContent).toContain(m.form.successTitle)
  })
})
