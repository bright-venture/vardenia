// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, type ComponentProps, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import { ForgotPasswordForm } from './ForgotPasswordForm'
import { ResetPasswordForm } from './ResetPasswordForm'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
vi.mock('../i18n/routing', () => ({ Link: (props: ComponentProps<'a'>) => <a {...props} /> }))
let root: Root | undefined
let container: HTMLDivElement
async function mount(component: ReactNode) {
  container = document.createElement('div')
  document.body.append(container)
  await act(async () => {
    root = createRoot(container)
    root.render(
      <NextIntlClientProvider locale="en" messages={getMessages('en')}>
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
const response = (ok: boolean, body: unknown) => ({ ok, json: async () => body })
afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  vi.unstubAllGlobals()
})

describe('password recovery feedback', () => {
  it('announces password errors and retains the associated requirement hint', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          response(false, { errors: { password: 'Use at least 10 characters.' } }),
        ),
    )
    await mount(<ResetPasswordForm token="test-only" />)
    await submit()
    const input = container.querySelector('input')!
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const descriptions = input
      .getAttribute('aria-describedby')!
      .split(' ')
      .map((id) => document.getElementById(id))
    expect(descriptions).toHaveLength(2)
    expect(descriptions[0]?.textContent).toBe(getMessages('en').account.passwordHint)
    expect(descriptions[1]?.getAttribute('role')).toBe('alert')
    expect(descriptions[1]?.textContent).toBe('Use at least 10 characters.')
  })

  it('surfaces token field-map errors with a new-link recovery path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(false, { errors: { token: 'This link is invalid.' } })),
    )
    await mount(<ResetPasswordForm token="test-only" />)
    await submit()
    const alert = container.querySelector('[role="alert"]')!
    expect(alert.textContent).toContain('This link is invalid.')
    expect(alert.querySelector('a')?.getAttribute('href')).toBe('/account/forgot')
  })

  it('preserves partner error-array details and partner recovery destination', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(false, { errors: [{ message: 'Link expired.' }] })),
    )
    await mount(
      <ResetPasswordForm
        token="test-only"
        endpoint="/api/business-users/reset-password"
        signInHref="/partner/login"
        forgotHref="/partner/forgot"
      />,
    )
    await submit()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Link expired.')
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/partner/forgot')
  })

  it.each(['customer', 'partner'])(
    'focuses %s reset success and preserves the sign-in destination',
    async (audience) => {
      const partner = audience === 'partner'
      const fetchMock = vi
        .fn()
        .mockResolvedValue(response(true, partner ? { user: { id: 1 } } : { ok: true }))
      vi.stubGlobal('fetch', fetchMock)
      const endpoint = partner ? '/api/business-users/reset-password' : '/auth/reset'
      const signInHref = partner ? '/partner/login' : '/account/login'
      await mount(
        <ResetPasswordForm token="test-only" endpoint={endpoint} signInHref={signInHref} />,
      )
      await submit()
      const success = container.querySelector('[role="status"]')!
      expect(document.activeElement).toBe(success)
      expect(success.querySelector('a')?.getAttribute('href')).toBe(signInHref)
      expect(fetchMock.mock.calls[0]?.[0]).toBe(endpoint)
      expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toEqual({
        token: 'test-only',
        password: '',
      })
      expect(container.querySelector('form')).toBeNull()
    },
  )

  it('focuses the neutral forgot-password success without exposing account existence', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(true, {})))
    await mount(<ForgotPasswordForm collection="business-users" signInHref="/partner/login" />)
    await submit()
    const success = container.querySelector('[role="status"]')!
    expect(document.activeElement).toBe(success)
    expect(success.textContent).toContain(getMessages('en').account.forgotSent)
    expect(success.querySelector('a')?.getAttribute('href')).toBe('/partner/login')
  })

  it.each(['forgot', 'reset'])(
    'prevents repeated %s submissions while pending and permits retry after failure',
    async (kind) => {
      let resolve!: (value: ReturnType<typeof response>) => void
      const fetchMock = vi.fn().mockImplementation(
        () =>
          new Promise((r) => {
            resolve = r
          }),
      )
      vi.stubGlobal('fetch', fetchMock)
      await mount(
        kind === 'forgot' ? <ForgotPasswordForm /> : <ResetPasswordForm token="test-only" />,
      )
      await act(async () => {
        fireSubmit()
        fireSubmit()
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(container.querySelector('form')?.getAttribute('aria-busy')).toBe('true')
      expect(container.querySelector('button')?.disabled).toBe(true)
      await act(async () => resolve(response(false, { message: 'Try again.' })))
      expect(container.querySelector('form')?.getAttribute('aria-busy')).toBe('false')
      expect(container.querySelector('button')?.disabled).toBe(false)
      await submit()
      expect(fetchMock).toHaveBeenCalledTimes(2)
      await act(async () => resolve(response(false, {})))
    },
  )
})
