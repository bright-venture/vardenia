// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SavedProvider, useSaved } from './SavedProvider'

/**
 * The shortlist provider, driven through the states a session actually moves
 * through. The parts worth pinning down are the ones that cannot be read off a
 * static render: that a signed-out or partner reader fires no request at all,
 * that the hint is read *reactively* so a sign-in or sign-out in the same tab
 * turns the hearts on and off without a reload, and that the server's answer
 * wins over a hint that has drifted.
 *
 * The session hint is mocked because in the app it is a cookie the middleware
 * writes; here the test plays the middleware, moving `audience` and then poking
 * the provider the two ways the real app does - a window focus (the cross-tab
 * path) and a plain re-render (what router.refresh does after a same-tab login).
 *
 * A small Probe renders the context into the DOM and toggles through a real
 * button, so the test reads and drives it the way a page would rather than
 * reaching into the hook.
 */

// Tells React's `act` it is running in a test, so it batches and flushes rather
// than warning that the environment is not configured for it.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const hoisted = vi.hoisted(() => ({ audience: null as 'customer' | 'partner' | null }))

vi.mock('../lib/session-hint', () => ({
  SESSION_HINT: 'vd_session',
  sessionAudience: () => hoisted.audience,
}))

// A GET /save answer carrying the saved slugs, and its 401.
const okSlugs = (slugs: string[]) => ({ status: 200, ok: true, json: async () => ({ slugs }) })
const unauth = () => ({ status: 401, ok: false, json: async () => ({ ok: false }) })
// A POST /save answer, reporting the new saved state of the one listing.
const okToggle = (saved: boolean) => ({
  status: 200,
  ok: true,
  json: async () => ({ ok: true, saved }),
})

const fetchMock = vi.fn()

function Probe({ slug }: { slug: string }) {
  const { isSaved, toggle, signedIn, count } = useSaved()
  return (
    <div>
      <span data-testid="signedIn">{String(signedIn)}</span>
      <span data-testid="count">{count}</span>
      <span data-testid="saved">{String(isSaved(slug))}</span>
      <button data-testid="toggle" onClick={() => toggle(slug)}>
        toggle
      </button>
    </div>
  )
}

let container: HTMLDivElement
let root: Root
// goSignIn calls window.location.assign, which jsdom leaves non-configurable and
// refuses to spy. Replacing the whole location with a stub URL (pathname '/',
// search '') lets us both observe the redirect and silence jsdom's "navigation
// not implemented" error.
let locationAssign: ReturnType<typeof vi.fn>

const tree = (slug: string) => (
  <SavedProvider loginPath="/en/account/login" saveLabel="Save" savedLabel="Saved">
    <Probe slug={slug} />
  </SavedProvider>
)

async function mount(slug = 'le-royal') {
  container = document.createElement('div')
  document.body.appendChild(container)
  await act(async () => {
    root = createRoot(container)
    root.render(tree(slug))
  })
}

const at = (id: string) => container.querySelector(`[data-testid="${id}"]`)?.textContent ?? ''
const signedIn = () => at('signedIn')
const count = () => Number(at('count'))
const saved = () => at('saved') === 'true'

const clickToggle = () =>
  act(async () => {
    container.querySelector<HTMLButtonElement>('[data-testid="toggle"]')?.click()
  })

// Let the fetch .then chains settle inside act, so the state they set is committed.
const flush = () =>
  act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })

const postCall = () =>
  fetchMock.mock.calls.find((c) => (c[1] as { method?: string } | undefined)?.method === 'POST')

beforeEach(() => {
  hoisted.audience = null
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(okSlugs([]))
  globalThis.fetch = fetchMock as unknown as typeof fetch
  locationAssign = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: Object.assign(new URL('http://localhost/'), { assign: locationAssign }),
  })
})

afterEach(async () => {
  await act(async () => {
    root?.unmount()
  })
  container?.remove()
  vi.restoreAllMocks()
})

describe('SavedProvider', () => {
  it('makes no request when signed out, and reports signed out', async () => {
    hoisted.audience = null
    await mount()
    await flush()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(signedIn()).toBe('false')
  })

  it('treats a signed-in partner as unable to save, with no request', async () => {
    // A partner holds a session, but not one that can save. The heart should
    // send them to sign in as a customer, not light up.
    hoisted.audience = 'partner'
    await mount()
    await flush()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(signedIn()).toBe('false')
  })

  it('sends a signed-out reader to sign in on a press, without saving', async () => {
    hoisted.audience = null
    await mount('le-royal')

    await clickToggle()

    expect(locationAssign).toHaveBeenCalledOnce()
    expect(String(locationAssign.mock.calls[0]?.[0])).toContain('/en/account/login?next=')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("loads a customer's saved set on mount and lights those hearts", async () => {
    hoisted.audience = 'customer'
    fetchMock.mockResolvedValueOnce(okSlugs(['le-royal']))
    await mount('le-royal')
    await flush()

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/save')
    expect(signedIn()).toBe('true')
    expect(saved()).toBe(true)
    expect(count()).toBe(1)
  })

  it('trusts the GET over a drifted hint: a customer hint with a 401 is signed out', async () => {
    hoisted.audience = 'customer'
    fetchMock.mockResolvedValueOnce(unauth())
    await mount('le-royal')
    await flush()

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(signedIn()).toBe('false')
    expect(saved()).toBe(false)
  })

  it('lights the hearts when a customer signs in in the same tab, on focus alone', async () => {
    hoisted.audience = null
    await mount('le-royal')
    await flush()
    expect(signedIn()).toBe('false')
    expect(fetchMock).not.toHaveBeenCalled()

    // The sign-in: the hint now names a customer, as markSignedIn writes it.
    hoisted.audience = 'customer'
    fetchMock.mockResolvedValueOnce(okSlugs(['le-royal']))
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    await flush()

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(signedIn()).toBe('true')
    expect(saved()).toBe(true)
  })

  it('reacts to a same-tab sign-in on a re-render alone (what router.refresh does)', async () => {
    hoisted.audience = null
    await mount('le-royal')
    await flush()
    expect(signedIn()).toBe('false')

    hoisted.audience = 'customer'
    fetchMock.mockResolvedValueOnce(okSlugs(['le-royal']))
    // No cookie event: just re-render the tree, the way a navigation/refresh
    // after login re-renders the layout the provider sits in.
    await act(async () => {
      root.render(tree('le-royal'))
    })
    await flush()

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(signedIn()).toBe('true')
    expect(saved()).toBe(true)
  })

  it('empties the hearts when the customer signs out in the same tab', async () => {
    hoisted.audience = 'customer'
    fetchMock.mockResolvedValueOnce(okSlugs(['le-royal']))
    await mount('le-royal')
    await flush()
    expect(saved()).toBe(true)
    expect(count()).toBe(1)

    // Sign out: the hint is cleared, and the provider should drop the loaded set.
    hoisted.audience = null
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    await flush()

    expect(signedIn()).toBe('false')
    expect(saved()).toBe(false)
    expect(count()).toBe(0)
  })

  it('saves on a press and confirms with a POST to /save', async () => {
    hoisted.audience = 'customer'
    fetchMock.mockResolvedValueOnce(okSlugs([])) // GET: nothing saved yet
    await mount('le-royal')
    await flush()
    expect(saved()).toBe(false)

    fetchMock.mockResolvedValueOnce(okToggle(true)) // POST: the save
    await clickToggle()
    await flush()

    expect(postCall()).toBeTruthy()
    expect(postCall()![0]).toBe('/save')
    expect(saved()).toBe(true)
  })
})
