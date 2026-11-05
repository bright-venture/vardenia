// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import { LOCALES, type Locale } from '@vardenia/i18n'
import { ChangeEmail, ChangeName, ChangePassword } from './ProfileForms'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const refresh = vi.hoisted(() => vi.fn())
vi.mock('../i18n/routing', () => ({ useRouter: () => ({ refresh }) }))
let root: Root | undefined
let container: HTMLDivElement
async function mount(component: React.ReactNode, locale: Locale = 'en') {
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
async function submit() {
  await act(async () => {
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}
afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
describe('profile form feedback', () => {
  it('associates name errors with their field and marks it invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ errors: { name: 'Enter your name.' } }),
      }),
    )
    await mount(<ChangeName current="Guest" />)
    await submit()
    const input = container.querySelector('input')!
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const message = container.querySelector(`#${input.getAttribute('aria-describedby')}`)
    expect(message?.textContent).toBe('Enter your name.')
    expect(message?.getAttribute('role')).toBe('alert')
  })

  it('keeps email and password errors tied to distinct inputs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          errors: { email: 'Check this email.', currentPassword: 'Check this password.' },
        }),
      }),
    )
    await mount(<ChangeEmail current="guest@example.test" />)
    await submit()
    for (const input of container.querySelectorAll('input')) {
      expect(input.getAttribute('aria-invalid')).toBe('true')
      expect(
        container.querySelector(`#${input.getAttribute('aria-describedby')}`)?.textContent,
      ).toBe(input.type === 'email' ? 'Check this email.' : 'Check this password.')
    }
  })

  it('exposes password requirements before validation and announces success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, message: 'Password saved.' }),
      }),
    )
    await mount(<ChangePassword />)
    const input = container.querySelector('#profile-new-password')!
    expect(input.getAttribute('aria-describedby')).toBe('profile-new-password-hint')
    expect(container.querySelector('#profile-new-password-hint')?.textContent).toContain(
      '10 characters',
    )
    await submit()
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Password saved.')
    expect(container.querySelector('form')?.getAttribute('aria-busy')).toBe('false')
    expect(refresh).toHaveBeenCalledOnce()
  })
})

describe('profile catalog integration', () => {
  it.each(LOCALES)('uses existing localized profile labels and actions in %s', async (locale) => {
    const messages = getMessages(locale)
    await mount(
      <>
        <ChangeName current="Guest" />
        <ChangeEmail current="guest@example.test" />
        <ChangePassword />
      </>,
      locale,
    )
    expect(container.querySelector('label[for="profile-name"]')?.textContent).toBe(
      messages.account.name,
    )
    expect(container.querySelector('label[for="profile-new-password"]')?.textContent).toBe(
      messages.account.newPassword,
    )
    expect(container.querySelector('#profile-new-password-hint')?.textContent).toBe(
      messages.account.rule_length,
    )
    expect([...container.querySelectorAll('button')].map((button) => button.textContent)).toEqual([
      messages.common.save,
      messages.common.save,
      messages.common.save,
    ])
    expect(
      [...container.querySelectorAll('summary')].map((summary) => summary.textContent),
    ).toEqual([
      `${messages.account.name}Guest+`,
      `${messages.account.email}guest@example.test+`,
      `${messages.account.password}+`,
    ])
  })

  it('uses the localized network error while preserving server-provided detail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await mount(<ChangeName current="Guest" />, 'ar')
    await submit()
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      getMessages('ar').common.error,
    )
  })
})

describe('mixed-script profile summaries', () => {
  it('separates Arabic labels from Latin values and isolates their text direction', async () => {
    const name = 'Alex Example'
    const email = 'alex.with.a.long.address@example.test'
    await mount(
      <div dir="rtl">
        <ChangeName current={name} />
        <ChangeEmail current={email} />
      </div>,
      'ar',
    )
    const summaries = [...container.querySelectorAll('summary')]
    for (const [index, summary] of summaries.entries()) {
      const group = summary.firstElementChild!
      expect(group.className).toContain('grid')
      expect(group.className).toContain('gap-1.5')
      expect(group.children).toHaveLength(2)
      expect(group.children[0]?.textContent).toBe(
        index === 0 ? getMessages('ar').account.name : getMessages('ar').account.email,
      )
      const value = group.children[1]!
      expect(value.className).toContain('break-all')
      expect(value.querySelector('bdi')?.getAttribute('dir')).toBe('auto')
      expect(value.querySelector('bdi')?.textContent).toBe(index === 0 ? name : email)
    }
  })
})
