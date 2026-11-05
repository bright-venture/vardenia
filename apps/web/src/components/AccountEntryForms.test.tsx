// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, type ComponentProps, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import type { Locale } from '@vardenia/i18n'
import { LoginForm } from './LoginForm'
import { PartnerLoginForm } from './PartnerLoginForm'
import { SignupForm } from './SignupForm'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const { refresh, push, markSignedIn } = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  markSignedIn: vi.fn(),
}))
vi.mock('../i18n/routing', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
  useRouter: () => ({ refresh, push }),
}))
vi.mock('../lib/session-hint', () => ({ markSignedIn }))
vi.mock('./Turnstile', () => ({ Turnstile: () => null }))
let root: Root | undefined
let container: HTMLDivElement
const response = (status: number, body: unknown = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})
async function mount(component: ReactNode, locale: Locale = 'en') {
  container = document.createElement('div')
  document.body.append(container)
  await act(async () => {
    root = createRoot(container)
    root.render(
      <NextIntlClientProvider locale={locale} messages={getMessages(locale)}>
        {component}
      </NextIntlClientProvider>,
    )
  })
}
function fireSubmit() {
  container
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}
async function submit() {
  await act(async () => fireSubmit())
}
async function edit(selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(selector)!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function resendButton() {
  return container.querySelector<HTMLButtonElement>('button[type="button"]')
}
afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('account entry request state', () => {
  it.each(['customer', 'partner', 'signup'])(
    'prevents duplicate %s requests and permits a retry',
    async (kind) => {
      let resolve!: (value: ReturnType<typeof response>) => void
      const fetchMock = vi.fn().mockImplementation(
        () =>
          new Promise((done) => {
            resolve = done
          }),
      )
      vi.stubGlobal('fetch', fetchMock)
      await mount(
        kind === 'customer' ? (
          <LoginForm />
        ) : kind === 'partner' ? (
          <PartnerLoginForm />
        ) : (
          <SignupForm locale="en" />
        ),
      )
      await act(async () => {
        fireSubmit()
        fireSubmit()
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(container.querySelector('form')?.getAttribute('aria-busy')).toBe('true')
      expect([...container.querySelectorAll('input')].every((input) => input.disabled)).toBe(true)
      expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
        true,
      )
      await act(async () => resolve(response(500)))
      expect(container.querySelector('form')?.getAttribute('aria-busy')).toBe('false')
      expect([...container.querySelectorAll('input')].every((input) => !input.disabled)).toBe(true)
      await submit()
      expect(fetchMock).toHaveBeenCalledTimes(2)
      await act(async () => resolve(response(500)))
    },
  )

  it.each([
    { next: '/account/saved', expected: '/account/saved' },
    { next: '//outside.example.test', expected: '/account' },
  ])('keeps the safe customer return destination $expected', async ({ next, expected }) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200)))
    await mount(<LoginForm next={next} />)
    await submit()
    expect(markSignedIn).toHaveBeenCalledWith('customer')
    expect(refresh).toHaveBeenCalledOnce()
    expect(push).toHaveBeenCalledWith(expected)
  })

  it('keeps partner authentication separate from customer accounts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200))
    vi.stubGlobal('fetch', fetchMock)
    await mount(<PartnerLoginForm />)
    await submit()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/business-users/login')
    expect(markSignedIn).toHaveBeenCalledWith('partner')
    expect(push).toHaveBeenCalledWith('/partner')
    expect(container.querySelector('a[href="/account/signup"]')).toBeNull()
  })
})

describe('verification resend recovery', () => {
  it('clears verification advice when the reader changes the email address', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(403)))
    await mount(<LoginForm />)
    await edit('input[type="email"]', 'first@example.test')
    await submit()
    expect(resendButton()).not.toBeNull()
    await edit('input[type="email"]', 'second@example.test')
    expect(resendButton()).toBeNull()
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('does not carry verification advice into a later ordinary sign-in failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(response(403)).mockResolvedValueOnce(response(401)),
    )
    await mount(<LoginForm />)
    await edit('input[type="email"]', 'guest@example.test')
    await submit()
    expect(resendButton()).not.toBeNull()
    await submit()
    expect(resendButton()).toBeNull()
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      getMessages('en').account.signInFailed,
    )
  })

  it.each(['network', 'server'])('allows resend recovery after a %s failure', async (failure) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(403))
    if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('offline'))
    else fetchMock.mockResolvedValueOnce(response(429, { message: 'Try again shortly.' }))
    fetchMock.mockResolvedValueOnce(response(202, { message: 'Check your email.' }))
    vi.stubGlobal('fetch', fetchMock)
    await mount(<LoginForm />)
    await edit('input[type="email"]', 'guest@example.test')
    await submit()
    await act(async () => resendButton()!.click())
    expect(container.querySelector('[role="status"]')).toBeNull()
    expect(resendButton()?.disabled).toBe(false)
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(2)
    await act(async () => resendButton()!.click())
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Check your email.')
    expect(resendButton()).toBeNull()
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/auth/verify/resend')
    expect(JSON.parse(fetchMock.mock.calls[2]?.[1].body)).toEqual({ email: 'guest@example.test' })
  })

  it('sends one resend request while pending and prevents a concurrent sign-in', async () => {
    let resolve!: (value: ReturnType<typeof response>) => void
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(403))
      .mockImplementation(
        () =>
          new Promise((done) => {
            resolve = done
          }),
      )
    vi.stubGlobal('fetch', fetchMock)
    await mount(<LoginForm />)
    await edit('input[type="email"]', 'guest@example.test')
    await submit()
    await act(async () => {
      resendButton()!.click()
      resendButton()!.click()
      fireSubmit()
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(container.querySelector('form')?.getAttribute('aria-busy')).toBe('true')
    expect(container.querySelector<HTMLInputElement>('input[type="email"]')?.disabled).toBe(true)
    await act(async () => resolve(response(202)))
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      getMessages('en').account.checkEmail,
    )
  })
})

describe('signup feedback', () => {
  it('announces and focuses invalid fields, including the optional phone', async () => {
    const errors = {
      name: 'Check your name.',
      email: 'Check your email.',
      password: 'Choose a longer password.',
      phone: 'Check your phone.',
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(400, { errors })))
    await mount(<SignupForm locale="en" />)
    await submit()
    const fields = [...container.querySelectorAll<HTMLInputElement>('input')]
    expect(document.activeElement).toBe(fields[0])
    for (const [index, field] of fields.entries()) {
      expect(field.getAttribute('aria-invalid')).toBe('true')
      const descriptions = field
        .getAttribute('aria-describedby')!
        .split(' ')
        .map((id) => document.getElementById(id))
      const error = descriptions.find(
        (description) => description?.getAttribute('role') === 'alert',
      )
      expect(error?.textContent).toBe(Object.values(errors)[index])
      if (field.type === 'password')
        expect(descriptions[0]?.textContent).toBe(getMessages('en').account.passwordHint)
      if (field.type === 'tel')
        expect(descriptions[0]?.textContent).toBe(getMessages('en').account.phoneOptional)
    }
  })

  it.each(['en', 'ar'] as const)(
    'focuses neutral success in %s without exposing account existence',
    async (locale) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(202, { ok: true })))
      await mount(<SignupForm locale={locale} />, locale)
      await submit()
      const success = container.querySelector('[role="status"]')!
      expect(document.activeElement).toBe(success)
      expect(success.textContent).toContain(getMessages(locale).account.checkEmail)
      expect(success.querySelector('a')?.getAttribute('href')).toBe('/account/login')
      expect(container.querySelector('form')).toBeNull()
    },
  )
})
