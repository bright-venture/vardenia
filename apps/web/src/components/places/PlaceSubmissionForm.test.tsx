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

// A fake bot check: every mount draws a new token, a reset draws another.
const turnstile = vi.hoisted(() => ({ n: 0, resets: 0 }))
vi.mock('../Turnstile', async () => {
  const React = await import('react')
  return {
    isTurnstileEnabled: () => true,
    Turnstile: ({
      onToken,
      handle,
    }: {
      onToken: (token: string | null) => void
      handle?: { current: { reset: () => void } | null }
    }) => {
      React.useImperativeHandle(
        handle,
        () => ({
          reset: () => {
            turnstile.resets += 1
            onToken(null)
            onToken(`ts-${++turnstile.n}`)
          },
        }),
        [onToken],
      )
      React.useEffect(() => {
        onToken(`ts-${++turnstile.n}`)
      }, [onToken])
      return null
    },
  }
})

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async () => 'data:image/png;base64,QRQR') },
}))

import QRCode from 'qrcode'
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
    expect(ar.body.textContent).toContain(getMessages('ar').magazinePlaces.flow.next)
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

  it('starts on step 1 with Next disabled, and says why', () => {
    const page = doc(renderToStaticMarkup(wrap('en')))
    expect(page.querySelector('[data-step]')!.textContent).toBe('Step 1 of 4')
    const next = page.querySelector('button[type="submit"]')!
    expect(next.hasAttribute('disabled')).toBe(true)
    expect(next.textContent).toBe(getMessages('en').magazinePlaces.flow.next)
    expect(page.body.textContent).toContain(getMessages('en').magazinePlaces.flow.nextNeeds)
  })

  it('has no photo or gallery inputs any more', () => {
    const page = doc(renderToStaticMarkup(wrap('en')))
    expect(page.querySelector('input[type="file"]')).toBeNull()
  })

  it('offers only the ten submittable kinds, grouped by category', () => {
    const page = doc(renderToStaticMarkup(wrap('en')))
    const options = [...page.querySelectorAll('select[name="kind"] option')]
      .map((o) => o.getAttribute('value'))
      .filter(Boolean)
    expect(options.sort()).toEqual(
      [
        'cafes',
        'festivals',
        'getaways',
        'gyms',
        'historic-sites',
        'hotels',
        'malls',
        'nightlife',
        'pools',
        'restaurants',
      ].sort(),
    )
    expect(page.querySelectorAll('select[name="kind"] optgroup').length).toBeGreaterThan(1)
  })

  it('lets the owner phone take 40 characters (the schema limit) and the public phone 20', () => {
    const page = doc(renderToStaticMarkup(wrap('en')))
    expect(page.querySelector('input[name="ownerPhone"]')!.getAttribute('maxlength')).toBe('40')
    expect(page.querySelector('input[name="publicPhone"]')!.getAttribute('maxlength')).toBe('20')
  })

  it('has no visible string left as a raw key', () => {
    const text = doc(renderToStaticMarkup(wrap('ar'))).body.textContent ?? ''
    expect(text).not.toMatch(/magazinePlaces\.|form\.[a-z]|flow\.[a-z]/)
  })
})

describe('PlaceSubmissionForm, the four steps', () => {
  let container: HTMLDivElement
  let root: Root
  let fetchMock: ReturnType<typeof vi.fn>
  let routes: Record<string, (init?: RequestInit) => Response | Promise<Response>>
  const m = getMessages('en').magazinePlaces

  const TOKEN = 'secret-session-token'
  const UPLOAD_URL = `https://vardenia.test/en/magazine-places/upload#t=${TOKEN}`

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
  // Numbers 1 to 10 of a block: 1-5 are full pages (pages 1-5), 6-9 the
  // quarters of page 6 and 10 a full page again. Held numbers are not free.
  const numbersReply = (taken: number[] = []) => {
    const free = (numbers: number[], slotOf: (n: number) => object) =>
      numbers.filter((n) => !taken.includes(n)).map(slotOf)
    const fullPages = free([1, 2, 3, 4, 5, 10], (n) => ({
      number: n,
      page: n <= 5 ? n : 7,
      position: null,
      lastPage: n <= 5 ? n : 7,
    }))
    const quarters = free([6, 7, 8, 9], (n) => ({
      number: n,
      page: 6,
      position: n - 5,
      lastPage: 6,
    }))
    return json({
      ok: true,
      issues: [
        {
          issueId: 1,
          issueTitle: 'All Lebanon',
          from: 1,
          to: 10,
          taken,
          currency: 'USD',
          // Price-table order, not the form's: the form lists them its own way.
          layouts: [
            {
              layout: 'quarter-page',
              price: 200,
              downpaymentAmount: 100,
              slots: quarters,
              free: quarters.length,
            },
            {
              layout: 'full-page',
              price: 1000,
              downpaymentAmount: 500,
              slots: fullPages,
              free: fullPages.length,
            },
          ],
        },
      ],
    })
  }
  const started = () =>
    json(
      {
        ok: true,
        reference: 'VD-12',
        sessionToken: TOKEN,
        uploadUrl: UPLOAD_URL,
        expiresAt: '2026-11-23T10:30:00.000Z',
      },
      201,
    )
  const status = (logo: boolean, hero: boolean, live = true) =>
    json({ ok: true, logoReceived: logo, heroReceived: hero, live })
  const termsReply = () =>
    json({
      ok: true,
      price: 1000,
      currency: 'USD',
      termMonths: 12,
      termsVersion: '2026-11-24',
      downpaymentPercent: 50,
      downpaymentAmount: 500,
      downpaymentDeadlineDays: 7,
      balanceDeadlineDays: 30,
    })

  const q = <T extends Element>(selector: string) => container.querySelector<T>(selector)!
  const nextButton = () => q<HTMLButtonElement>('button[type="submit"]')
  const numberButton = (n: number) => q<HTMLButtonElement>(`button[data-number="${n}"]`)
  const layoutRadio = (layout: string) =>
    q<HTMLInputElement>(`input[name="layout"][value="${layout}"]`)
  const button = (label: string) =>
    [...container.querySelectorAll('button')].find((b) => b.textContent === label)!
  const calls = (url: string) => fetchMock.mock.calls.filter(([u]) => u === url)
  const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string)

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
  const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    turnstile.n = 0
    turnstile.resets = 0
    vi.mocked(QRCode.toDataURL).mockClear()
    routes = {
      '/place-submissions/numbers?governorate=keserwan': () => numbersReply(),
      '/place-submissions': started,
      '/place-submissions/status': () => status(false, false),
      '/place-submissions/terms': termsReply,
      '/place-submissions/finish': () => json({ ok: true, reference: 'VD-12' }),
    }
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const route = routes[url]
      if (!route) throw new Error(`unexpected fetch ${url}`)
      return route(init)
    })
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
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  /** Keserwan, Jbeil: the numbers are asked for once both are chosen. */
  async function chooseKeserwan() {
    await setValue(q('select[name="governorate"]'), 'keserwan')
    await setValue(q('select[name="city"]'), 'jbeil')
  }

  async function fillAndPick() {
    await setValue(q('input[name="name"]'), 'Le Petit Jardin')
    await setValue(q('select[name="kind"]'), 'restaurants')
    await setValue(q('select[name="governorate"]'), 'keserwan')
    await setValue(q('select[name="city"]'), 'jbeil')
    await setValue(q('input[name="address"]'), 'Old Port, Byblos')
    await setValue(q('input[name="ownerName"]'), 'Rita Haddad')
    await setValue(q('input[name="ownerEmail"]'), 'rita@example.com')
    await setValue(q('input[name="ownerPhone"]'), '+961 3 000 000')
    await click(layoutRadio('full-page'))
    await click(numberButton(4))
  }
  const pressNext = () => act(async () => q<HTMLFormElement>('form').requestSubmit())
  async function toStep2() {
    await fillAndPick()
    await pressNext()
  }
  async function toStep3() {
    await toStep2()
    routes['/place-submissions/status'] = () => status(true, true)
    await tick(2000)
    await click(button(m.flow.continue))
  }

  describe('step 1: details', () => {
    it('switches the preview to template C and shows the number, with placeholders for photos', async () => {
      await click(q('input[name="pageTemplate"][value="c"]'))
      expect(q('[data-template]').getAttribute('data-template')).toBe('c')
      await chooseKeserwan()
      await click(layoutRadio('full-page'))
      await click(numberButton(4))
      expect(q('[data-template]').textContent).toContain('VARDENIA - 4')
      expect(q('[data-template]').querySelector('img')).toBeNull()
    })

    it('keeps Next disabled until a number is chosen', async () => {
      expect(nextButton().disabled).toBe(true)
      await chooseKeserwan()
      await click(layoutRadio('full-page'))
      expect(nextButton().disabled).toBe(true)
      await click(numberButton(4))
      expect(nextButton().disabled).toBe(false)
    })

    it('offers the five layouts as plain radios, in the fixed order, none chosen', async () => {
      const radios = [...container.querySelectorAll<HTMLInputElement>('input[name="layout"]')]
      expect(radios.map((r) => r.value)).toEqual([
        'full-spread',
        'full-page',
        'half-page',
        'three-third',
        'quarter-page',
      ])
      expect(radios.some((r) => r.checked)).toBe(false)
      const labels = radios.map((r) => r.closest('label')!.textContent)
      expect(labels).toEqual([
        m.form.layouts['full-spread'],
        m.form.layouts['full-page'],
        m.form.layouts['half-page'],
        m.form.layouts['three-third'],
        m.form.layouts['quarter-page'],
      ])
      // The A/B/C page design is still there, unchanged.
      expect(container.querySelectorAll('input[name="pageTemplate"]')).toHaveLength(3)
    })

    it('asks for a layout before listing places, then lists only its free slots with its price', async () => {
      await chooseKeserwan()
      expect(container.textContent).toContain(m.numbers.chooseLayout)
      expect(container.querySelector('button[data-number]')).toBeNull()
      await click(layoutRadio('quarter-page'))
      expect(container.textContent).not.toContain(m.numbers.chooseLayout)
      const slots = [...container.querySelectorAll('button[data-number]')]
      expect(slots.map((b) => b.getAttribute('data-number'))).toEqual(['6', '7', '8', '9'])
      expect(slots[0]!.textContent).toBe('Page 6, position 1')
      expect(container.textContent).toContain('$200 per year')
      await click(layoutRadio('full-page'))
      expect(container.textContent).toContain('$1,000 per year')
      expect(numberButton(10).textContent).toBe('Page 7')
    })

    it('says so when the region does not offer the chosen layout', async () => {
      await chooseKeserwan()
      await click(layoutRadio('full-spread'))
      expect(container.textContent).toContain(m.numbers.noneForLayout)
      expect(container.querySelector('button[data-number]')).toBeNull()
    })

    it('clears the picked number when the layout changes', async () => {
      await chooseKeserwan()
      await click(layoutRadio('full-page'))
      await click(numberButton(4))
      expect(nextButton().disabled).toBe(false)
      await click(layoutRadio('quarter-page'))
      expect(container.querySelector('button[aria-pressed="true"]')).toBeNull()
      expect(nextButton().disabled).toBe(true)
      await click(layoutRadio('full-page'))
      expect(numberButton(4).getAttribute('aria-pressed')).toBe('false')
    })

    it('offers nothing from a legacy issue without layouts', async () => {
      routes['/place-submissions/numbers?governorate=keserwan'] = () =>
        json({
          ok: true,
          issues: [{ issueId: 3, issueTitle: 'Old', from: 1, to: 10, taken: [], layouts: [] }],
        })
      await chooseKeserwan()
      await click(layoutRadio('full-page'))
      expect(container.querySelector('button[data-number]')).toBeNull()
      expect(container.textContent).toContain(m.numbers.noneForLayout)
    })

    it('shows field errors next to their inputs without posting', async () => {
      await chooseKeserwan()
      await click(layoutRadio('full-page'))
      await click(numberButton(4))
      await pressNext()
      expect(calls('/place-submissions').length).toBe(0)
      const name = q<HTMLInputElement>('input[name="name"]')
      expect(name.getAttribute('aria-invalid')).toBe('true')
      const describedBy = name.getAttribute('aria-describedby')!
      expect(container.querySelector(`[id="${describedBy.split(' ').pop()}"]`)!.textContent).toBe(
        m.errors.required,
      )
    })

    it("offers exactly the region's cities, by their names, and requires one", async () => {
      const city = q<HTMLSelectElement>('select[name="city"]')
      expect(city.required).toBe(true)
      expect(city.disabled).toBe(true)
      await setValue(q('select[name="governorate"]'), 'keserwan')
      const options = [...city.options].filter((o) => o.value)
      expect(options.map((o) => o.value)).toEqual([
        'jounieh',
        'harissa',
        'kaslik',
        'ghazir',
        'tabarja',
        'faqra-faraya',
        'jbeil',
      ])
      expect(options.map((o) => o.textContent)).toContain('Faqra / Faraya')
      expect(city.options[0]!.value).toBe('')
      expect(city.options[0]!.textContent).toBe(m.form.chooseCity)
    })

    it('names the cities in Arabic on the Arabic form', async () => {
      await act(async () => root.render(wrap('ar')))
      await setValue(q('select[name="governorate"]'), 'keserwan')
      const names = [...q<HTMLSelectElement>('select[name="city"]').options].map(
        (o) => o.textContent,
      )
      expect(names).toContain('فقرا / فاريا')
      expect(names).toContain('جونية')
      expect(names[0]).toBe(getMessages('ar').magazinePlaces.form.chooseCity)
    })

    it('puts "required" on the city when it is left unchosen, and the preview shows the chosen one', async () => {
      await fillAndPick()
      await setValue(q('select[name="city"]'), '')
      await pressNext()
      expect(calls('/place-submissions').length).toBe(0)
      const city = q<HTMLSelectElement>('select[name="city"]')
      expect(city.getAttribute('aria-invalid')).toBe('true')
      const describedBy = city.getAttribute('aria-describedby')!
      expect(container.querySelector(`[id="${describedBy.split(' ').pop()}"]`)!.textContent).toBe(
        m.errors.required,
      )
      await setValue(city, 'faqra-faraya')
      expect(q('[data-template]').textContent).toContain('Faqra / Faraya, Keserwan')
    })

    it('never changes the All Lebanon numbers when the city changes', async () => {
      await chooseKeserwan()
      await click(layoutRadio('full-page'))
      await click(numberButton(4))
      const fetched = fetchMock.mock.calls.length
      await setValue(q('select[name="city"]'), 'jounieh')
      await setValue(q('select[name="city"]'), 'jbeil')
      expect(fetchMock.mock.calls.length).toBe(fetched)
      expect(numberButton(4).getAttribute('aria-pressed')).toBe('true')
      expect(nextButton().disabled).toBe(false)
    })

    /**
     * An issue for one governorate (27 November 2026): its blocks are cities,
     * so the route asked without a city says so, and the form asks for the
     * city, then for that city's numbers.
     */
    describe('an issue split by city', () => {
      const needsCity = () =>
        json({
          ok: true,
          issues: [
            {
              issueId: 2,
              issueTitle: 'Keserwan',
              coverage: 'governorate',
              from: null,
              to: null,
              taken: [],
              layouts: [],
            },
          ],
        })
      const cityUrl = (city: string) =>
        `/place-submissions/numbers?governorate=keserwan&city=${city}`
      beforeEach(() => {
        routes['/place-submissions/numbers?governorate=keserwan'] = needsCity
        routes[cityUrl('jbeil')] = () => numbersReply()
        routes[cityUrl('jounieh')] = () => numbersReply()
      })

      it('asks for the city before listing numbers', async () => {
        await setValue(q('select[name="governorate"]'), 'keserwan')
        expect(container.textContent).toContain(m.numbers.chooseCity)
        expect(calls(cityUrl('jbeil')).length).toBe(0)
        await setValue(q('select[name="city"]'), 'jbeil')
        expect(container.textContent).not.toContain(m.numbers.chooseCity)
        expect(calls(cityUrl('jbeil')).length).toBe(1)
        await click(layoutRadio('full-page'))
        expect(numberButton(4).disabled).toBe(false)
      })

      it("asks for the new city's numbers and clears the picked number when the city changes", async () => {
        await chooseKeserwan()
        await click(layoutRadio('full-page'))
        await click(numberButton(4))
        expect(nextButton().disabled).toBe(false)
        await setValue(q('select[name="city"]'), 'jounieh')
        expect(calls(cityUrl('jounieh')).length).toBe(1)
        expect(container.querySelector('button[aria-pressed="true"]')).toBeNull()
        expect(nextButton().disabled).toBe(true)
      })
    })

    it('puts a server field error on the right input', async () => {
      await fillAndPick()
      routes['/place-submissions'] = () => json({ ok: false, errors: { address: 'required' } }, 400)
      await pressNext()
      expect(q('input[name="address"]').getAttribute('aria-invalid')).toBe('true')
      expect(container.textContent).toContain(m.errors.check)
      expect(q('[data-step]').textContent).toBe('Step 1 of 4')
    })

    it('on a 409 clears the number, reloads the picker and says so, keeping the input', async () => {
      await fillAndPick()
      routes['/place-submissions'] = () =>
        json({ ok: false, code: 'number-unavailable', message: 'x' }, 409)
      routes['/place-submissions/numbers?governorate=keserwan'] = () => numbersReply([4])
      await pressNext()
      expect(container.textContent).toContain(m.numbers.justTaken)
      // Only free slots are listed: number 4 is gone, its neighbours stay.
      expect(container.querySelector('button[data-number="4"]')).toBeNull()
      expect(numberButton(5).disabled).toBe(false)
      expect(container.querySelector('button[aria-pressed="true"]')).toBeNull()
      expect(q<HTMLInputElement>('input[name="name"]').value).toBe('Le Petit Jardin')
      expect(nextButton().disabled).toBe(true)
    })

    it('says when there are too many attempts', async () => {
      await fillAndPick()
      routes['/place-submissions'] = () => new Response('Too many requests', { status: 429 })
      await pressNext()
      expect(container.textContent).toContain(m.errors.rateLimited)
      expect(container.textContent).not.toContain('Too many requests')
    })

    it('has its own message when too many forms are already open', async () => {
      await fillAndPick()
      routes['/place-submissions'] = () =>
        json({ ok: false, code: 'too-many-open', message: 'x' }, 429)
      await pressNext()
      expect(container.textContent).toContain(m.flow.tooManyOpen)
      expect(container.textContent).not.toContain(m.errors.rateLimited)
    })

    it('says so when the bot check fails', async () => {
      await fillAndPick()
      routes['/place-submissions'] = () => json({ ok: false, code: 'failed', message: 'x' }, 403)
      await pressNext()
      expect(container.textContent).toContain(m.errors.botCheck)
    })

    it('posts the fields as JSON with the first Turnstile token and no photos', async () => {
      await fillAndPick()
      await pressNext()
      const [call] = calls('/place-submissions')
      const body = bodyOf(call!)
      expect(body.data).toMatchObject({
        issue: 1,
        listingNumber: 4,
        locale: 'en',
        pageTemplate: 'a',
        layout: 'full-page',
        kind: 'restaurants',
        governorate: 'keserwan',
        city: 'jbeil',
      })
      expect(body.data).not.toHaveProperty('price')
      expect(body.turnstileToken).toBe('ts-1')
      expect(JSON.stringify(body)).not.toMatch(/hero|logo|gallery/)
    })
  })

  describe('step 2: phone upload', () => {
    it('moves to step 2 and draws a QR code of the upload link', async () => {
      await toStep2()
      expect(q('[data-step]').textContent).toBe('Step 2 of 4')
      expect(QRCode.toDataURL).toHaveBeenCalledWith(UPLOAD_URL, expect.anything())
      const img = q<HTMLImageElement>('img')
      expect(img.getAttribute('src')).toBe('data:image/png;base64,QRQR')
      expect(img.getAttribute('alt')).toBe(m.flow.qrAlt)
      expect(container.textContent).toContain(m.flow.qrInstruction)
    })

    it('shows the link as text only inside the collapsed "Can\'t scan?" block', async () => {
      await toStep2()
      const details = q<HTMLDetailsElement>('details')
      expect(details.open).toBe(false)
      expect(details.querySelector('summary')!.textContent).toBe(m.flow.cantScan)
      expect(details.textContent).toContain(UPLOAD_URL)
      const outside = (container.textContent ?? '').replace(details.textContent ?? '', '')
      expect(outside).not.toContain(TOKEN)
    })

    it('keeps the token out of storage, the address bar, history and the console', async () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem')
      const push = vi.spyOn(history, 'pushState')
      const replace = vi.spyOn(history, 'replaceState')
      const log = vi.spyOn(console, 'log')
      const warn = vi.spyOn(console, 'warn')
      const error = vi.spyOn(console, 'error')
      const before = location.href
      await toStep2()
      await tick(4000)
      expect(setItem).not.toHaveBeenCalled()
      expect(push).not.toHaveBeenCalled()
      expect(replace).not.toHaveBeenCalled()
      expect(location.href).toBe(before)
      expect(location.href).not.toContain(TOKEN)
      for (const spy of [log, warn, error]) expect(spy).not.toHaveBeenCalled()
      for (const store of [localStorage, sessionStorage]) {
        expect(JSON.stringify({ ...store })).not.toContain(TOKEN)
      }
    })

    it('polls the status every 2 seconds with the token in the body, not the URL', async () => {
      await toStep2()
      expect(calls('/place-submissions/status').length).toBe(1)
      await tick(2000)
      expect(calls('/place-submissions/status').length).toBe(2)
      await tick(2000)
      expect(calls('/place-submissions/status').length).toBe(3)
      const [call] = calls('/place-submissions/status')
      expect(bodyOf(call!)).toEqual({ sessionToken: TOKEN })
      expect(String(call![0])).not.toContain(TOKEN)
    })

    it('ticks each row when its photo arrives and enables Continue only when both are in', async () => {
      await toStep2()
      const row = (slot: string) => q(`[data-slot="${slot}"]`)
      expect(button(m.flow.continue).disabled).toBe(true)
      expect(row('logo').getAttribute('data-received')).toBe('false')

      routes['/place-submissions/status'] = () => status(true, false)
      await tick(2000)
      expect(row('logo').getAttribute('data-received')).toBe('true')
      expect(row('logo').textContent).toContain(m.flow.received)
      expect(row('hero').getAttribute('data-received')).toBe('false')
      expect(button(m.flow.continue).disabled).toBe(true)

      routes['/place-submissions/status'] = () => status(true, true)
      await tick(2000)
      expect(button(m.flow.continue).disabled).toBe(false)
    })

    it('backs off while the poll fails and recovers', async () => {
      await toStep2()
      routes['/place-submissions/status'] = () => new Response('oops', { status: 500 })
      await tick(2000) // fails, next try in 4s
      const afterFirst = calls('/place-submissions/status').length
      await tick(2000)
      expect(calls('/place-submissions/status').length).toBe(afterFirst)
      await tick(2000)
      expect(calls('/place-submissions/status').length).toBe(afterFirst + 1)
    })

    it('stops polling when the step is left', async () => {
      await toStep3()
      const n = calls('/place-submissions/status').length
      await tick(10000)
      expect(calls('/place-submissions/status').length).toBe(n)
    })

    it('stops polling when unmounted', async () => {
      await toStep2()
      const n = calls('/place-submissions/status').length
      act(() => root.unmount())
      await tick(10000)
      expect(calls('/place-submissions/status').length).toBe(n)
      root = createRoot(container)
    })

    it('does not poll while the tab is hidden, and polls again at once when it is back', async () => {
      await toStep2()
      Object.defineProperty(document, 'hidden', { configurable: true, value: true })
      await tick(2000) // the pending tick fires, sees a hidden tab and waits
      const n = calls('/place-submissions/status').length
      await tick(10000)
      expect(calls('/place-submissions/status').length).toBe(n)
      Object.defineProperty(document, 'hidden', { configurable: true, value: false })
      await act(async () => void document.dispatchEvent(new Event('visibilitychange')))
      expect(calls('/place-submissions/status').length).toBe(n + 1)
    })

    it('does not start a second poll chain when the tab becomes visible mid-request', async () => {
      await fillAndPick()
      let release!: (r: Response) => void
      routes['/place-submissions/status'] = () => new Promise<Response>((r) => (release = r))
      await pressNext()
      expect(calls('/place-submissions/status').length).toBe(1)
      await act(async () => void document.dispatchEvent(new Event('visibilitychange')))
      expect(calls('/place-submissions/status').length).toBe(1)
      routes['/place-submissions/status'] = () => status(false, false)
      await act(async () => release(status(false, false)))
      await tick(2000)
      expect(calls('/place-submissions/status').length).toBe(2)
    })

    it('says the session expired on a 404 and Start again clears everything', async () => {
      await toStep2()
      routes['/place-submissions/status'] = () => json({ ok: false }, 404)
      await tick(2000)
      expect(container.textContent).toContain(m.flow.expired)
      expect(container.textContent).not.toContain(TOKEN)
      await click(button(m.flow.startAgain))
      expect(q('[data-step]').textContent).toBe('Step 1 of 4')
      expect(q<HTMLInputElement>('input[name="name"]').value).toBe('')
      expect(q<HTMLInputElement>('input[name="ownerEmail"]').value).toBe('')
      expect(nextButton().disabled).toBe(true)
    })

    it('says the session expired when the status says it is no longer live', async () => {
      await toStep2()
      routes['/place-submissions/status'] = () => status(true, true, false)
      await tick(2000)
      expect(container.textContent).toContain(m.flow.expired)
      expect(button(m.flow.continue)).toBeUndefined()
    })

    it('can send each photo from this computer instead, with the in-memory token', async () => {
      await toStep2()
      routes['/place-uploads'] = () => json({ ok: true, logoReceived: true, heroReceived: false })
      fetchMock.mockClear()
      const input = q<HTMLInputElement>('input[name="computer-logo"]')
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: [new File(['x'], 'logo.png', { type: 'image/png' })],
      })
      await act(async () => void input.dispatchEvent(new Event('change', { bubbles: true })))
      const [call] = calls('/place-uploads')
      const form = (call![1] as RequestInit).body as FormData
      expect(form.get('sessionToken')).toBe(TOKEN)
      expect(form.get('slot')).toBe('logo')
      expect((form.get('photo') as File).name).toBe('logo.png')
      expect(q('[data-slot="logo"]').getAttribute('data-received')).toBe('true')
    })

    it('refuses a computer photo that is not JPEG, PNG or WebP without sending it', async () => {
      await toStep2()
      fetchMock.mockClear()
      const input = q<HTMLInputElement>('input[name="computer-hero"]')
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: [new File(['x'], 'a.gif', { type: 'image/gif' })],
      })
      await act(async () => void input.dispatchEvent(new Event('change', { bubbles: true })))
      expect(container.textContent).toContain(m.errors.photoType)
      expect(calls('/place-uploads').length).toBe(0)
    })
  })

  describe('step 3: price and terms', () => {
    it('shows the price, what it includes, the one-year term and the two-stage payment', async () => {
      await toStep3()
      expect(q('[data-step]').textContent).toBe('Step 3 of 4')
      expect(q('[data-price]').textContent).toBe('$1,000 per year')
      for (const key of ['includeMagazine', 'includeListing', 'includeQr']) {
        expect(container.textContent).toContain(m.flow[key as 'includeQr'])
      }
      expect(container.textContent).toContain(
        'One year, starting when we publish your page. You pay in two parts: $500 first, then $500 if we accept your business.',
      )
      // The real flow, with the Settings values: 50% by Whish within 7 days to
      // keep the number, returned if not accepted, the rest within 1 month.
      expect(q('[data-payment-terms]').textContent).toBe(
        'Pay the 50% downpayment ($500) by Whish within 7 days to keep your page number. If we do not accept your business, we return the downpayment by Whish to the number it was paid from. If we accept it, the rest ($500) is due within 1 month of acceptance.',
      )
      expect(container.textContent).not.toMatch(/pay only if we accept/i)
      // The company number is never on the shared screen: it goes by email.
      expect(container.textContent).not.toMatch(/96179300350/)
    })

    it('shows the price of the chosen layout from the start answer, over the Settings price', async () => {
      routes['/place-submissions'] = () =>
        json(
          {
            ok: true,
            reference: 'VD-12',
            sessionToken: TOKEN,
            uploadUrl: UPLOAD_URL,
            expiresAt: '2026-11-23T10:30:00.000Z',
            price: 200,
            downpaymentAmount: 100,
            currency: 'USD',
          },
          201,
        )
      await toStep3()
      expect(q('[data-price]').textContent).toBe('$200 per year')
      expect(q('[data-payment-terms]').textContent).toContain('($100)')
      expect(container.textContent).not.toContain('$1,000')
    })

    it('takes every payment number from the Settings, never from the copy', async () => {
      routes['/place-submissions/terms'] = () =>
        json({
          ok: true,
          price: 1200,
          currency: 'USD',
          termMonths: 12,
          termsVersion: '2026-11-24',
          downpaymentPercent: 25,
          downpaymentAmount: 300,
          downpaymentDeadlineDays: 1,
          balanceDeadlineDays: 45,
        })
      await toStep3()
      expect(q('[data-payment-terms]').textContent).toBe(
        'Pay the 25% downpayment ($300) by Whish within 1 day to keep your page number. If we do not accept your business, we return the downpayment by Whish to the number it was paid from. If we accept it, the rest ($900) is due within 45 days of acceptance.',
      )
    })

    it('holds Submit until the box is ticked, then finishes with a FRESH token and the locale', async () => {
      await toStep3()
      expect(button(m.flow.submit).disabled).toBe(true)
      await click(q('input[name="acceptTerms"]'))
      expect(button(m.flow.submit).disabled).toBe(false)
      await click(button(m.flow.submit))

      const start = bodyOf(calls('/place-submissions')[0]!)
      const finish = bodyOf(calls('/place-submissions/finish')[0]!)
      expect(finish).toEqual({
        sessionToken: TOKEN,
        acceptedTerms: true,
        turnstileToken: finish.turnstileToken,
        locale: 'en',
      })
      expect(finish.turnstileToken).toBeTruthy()
      expect(finish.turnstileToken).not.toBe(start.turnstileToken)
      // The widget was reset after the start call.
      expect(turnstile.resets).toBeGreaterThanOrEqual(1)
    })

    it('goes to the thank-you with the reference', async () => {
      await toStep3()
      await click(q('input[name="acceptTerms"]'))
      await click(button(m.flow.submit))
      expect(q('[data-step]').textContent).toBe('Step 4 of 4')
      expect(q('[role="status"]').textContent).toContain(m.flow.thanks)
      // The owner is sent to their inbox: the downpayment comes before the review.
      expect(m.flow.thanks).toMatch(/check your email to pay the downpayment/i)
      expect(container.textContent).toContain('VD-12')
    })

    it('says the session expired on a 404 from finish', async () => {
      await toStep3()
      routes['/place-submissions/finish'] = () => json({ ok: false, code: 'not-found' }, 404)
      await click(q('input[name="acceptTerms"]'))
      await click(button(m.flow.submit))
      expect(container.textContent).toContain(m.flow.expired)
    })

    it('goes back to the photos step and says why when finish says they are missing', async () => {
      await toStep3()
      routes['/place-submissions/finish'] = () => json({ ok: false, code: 'photos-missing' }, 422)
      await click(q('input[name="acceptTerms"]'))
      await click(button(m.flow.submit))
      expect(q('[data-step]').textContent).toBe('Step 2 of 4')
      expect(q('[role="alert"]').textContent).toBe(m.flow.photosMissing)
      // Continuing clears the stale sentence: it is not shown again on step 3.
      await click(button(m.flow.continue))
      expect(q('[data-step]').textContent).toBe('Step 3 of 4')
      expect(container.textContent).not.toContain(m.flow.photosMissing)
    })

    it('shows a plain sentence when finish refuses the terms or is rate limited', async () => {
      await toStep3()
      await click(q('input[name="acceptTerms"]'))
      routes['/place-submissions/finish'] = () =>
        json({ ok: false, code: 'terms-not-accepted' }, 422)
      await click(button(m.flow.submit))
      expect(q('[role="alert"]').textContent).toBe(m.flow.termsNotAccepted)
      routes['/place-submissions/finish'] = () => new Response('Too many', { status: 429 })
      await click(button(m.flow.submit))
      expect(container.textContent).toContain(m.errors.rateLimited)
    })

    it('lets the owner retry when the price cannot be loaded', async () => {
      routes['/place-submissions/terms'] = () => json({ ok: false }, 500)
      await toStep3()
      expect(container.textContent).toContain(m.flow.termsError)
      expect(button(m.flow.submit).disabled).toBe(true)
      routes['/place-submissions/terms'] = termsReply
      await click(button(m.numbers.retry))
      expect(q('[data-price]').textContent).toBe('$1,000 per year')
    })
  })

  describe('step 4: thank you, and the kiosk reset', () => {
    async function toStep4() {
      await toStep3()
      await click(q('input[name="acceptTerms"]'))
      await click(button(m.flow.submit))
    }

    const nothingLeft = () => {
      const html = container.innerHTML
      for (const secret of ['rita@example.com', '+961 3 000 000', 'Rita Haddad', TOKEN]) {
        expect(html).not.toContain(secret)
      }
      expect(q<HTMLInputElement>('input[name="ownerEmail"]').value).toBe('')
      expect(q<HTMLInputElement>('input[name="ownerPhone"]').value).toBe('')
      expect(q<HTMLInputElement>('input[name="name"]').value).toBe('')
      expect(q('[data-step]').textContent).toBe('Step 1 of 4')
    }

    it('clears itself after 60 seconds', async () => {
      await toStep4()
      await tick(59000)
      expect(q('[data-step]').textContent).toBe('Step 4 of 4')
      await tick(1000)
      nothingLeft()
    })

    it('clears at once on "Start a new one"', async () => {
      await toStep4()
      await click(button(m.flow.startNew))
      nothingLeft()
    })

    it('does not keep the old session: a new start gets its own token', async () => {
      await toStep4()
      await click(button(m.flow.startNew))
      await fillAndPick()
      routes['/place-submissions'] = () =>
        json(
          {
            ok: true,
            reference: 'VD-13',
            sessionToken: 'second-token',
            uploadUrl: 'https://vardenia.test/en/magazine-places/upload#t=second-token',
            expiresAt: 'x',
          },
          201,
        )
      await pressNext()
      await tick(2000)
      const last = bodyOf(calls('/place-submissions/status').at(-1)!)
      expect(last).toEqual({ sessionToken: 'second-token' })
    })
  })

  describe('kiosk idle reset', () => {
    const IDLE = 3 * 60 * 1000

    it('drops a start answer that arrives after an idle reset', async () => {
      await fillAndPick()
      let release!: (r: Response) => void
      routes['/place-submissions'] = () => new Promise<Response>((r) => (release = r))
      await pressNext()
      await tick(IDLE + 31000)
      expect(q('[data-step]').textContent).toBe('Step 1 of 4')
      await act(async () => release(started()))
      expect(q('[data-step]').textContent).toBe('Step 1 of 4')
      expect(q<HTMLInputElement>('input[name="name"]').value).toBe('')
      expect(container.innerHTML).not.toContain(TOKEN)
      expect(calls('/place-submissions/status').length).toBe(0)
    })

    it('drops a finish answer that arrives after a reset', async () => {
      await toStep3()
      let release!: (r: Response) => void
      routes['/place-submissions/finish'] = () => new Promise<Response>((r) => (release = r))
      await click(q('input[name="acceptTerms"]'))
      await click(button(m.flow.submit))
      await tick(IDLE + 31000)
      expect(q('[data-step]').textContent).toBe('Step 1 of 4')
      await act(async () => release(json({ ok: true, reference: 'VD-12' })))
      expect(q('[data-step]').textContent).toBe('Step 1 of 4')
      expect(container.textContent).not.toContain('VD-12')
    })

    it('puts focus on Stay when the warning appears', async () => {
      await fillAndPick()
      await tick(IDLE + 1000)
      expect(document.activeElement).toBe(button(m.flow.idleStay))
    })

    it('warns after 3 idle minutes with a 30 second countdown and a Stay button', async () => {
      await fillAndPick()
      await tick(IDLE - 1000)
      expect(container.querySelector('[role="alertdialog"]')).toBeNull()
      await tick(1000)
      const dialog = q('[role="alertdialog"]')
      expect(dialog.textContent).toContain(m.flow.idleTitle)
      expect(dialog.textContent).toContain('30 seconds')
    })

    it('Stay dismisses the warning and keeps the form', async () => {
      await fillAndPick()
      await tick(IDLE + 1000)
      await click(button(m.flow.idleStay))
      expect(container.querySelector('[role="alertdialog"]')).toBeNull()
      await tick(IDLE - 2000)
      expect(container.querySelector('[role="alertdialog"]')).toBeNull()
      expect(q<HTMLInputElement>('input[name="name"]').value).toBe('Le Petit Jardin')
    })

    it('clears everything when the 30 seconds run out, token included', async () => {
      await toStep2()
      await tick(IDLE + 31000)
      expect(container.querySelector('[role="alertdialog"]')).toBeNull()
      expect(q('[data-step]').textContent).toBe('Step 1 of 4')
      expect(q<HTMLInputElement>('input[name="ownerEmail"]').value).toBe('')
      expect(container.innerHTML).not.toContain(TOKEN)
      expect(container.innerHTML).not.toContain('Rita')
    })

    it('counts input as activity before the warning', async () => {
      await fillAndPick()
      await tick(IDLE - 5000)
      await act(
        async () => void document.dispatchEvent(new Event('pointerdown', { bubbles: true })),
      )
      await tick(IDLE - 5000)
      expect(container.querySelector('[role="alertdialog"]')).toBeNull()
    })

    it('does not run on the thank-you step', async () => {
      await toStep3()
      await click(q('input[name="acceptTerms"]'))
      await click(button(m.flow.submit))
      await tick(30000)
      expect(container.querySelector('[role="alertdialog"]')).toBeNull()
    })
  })
})
