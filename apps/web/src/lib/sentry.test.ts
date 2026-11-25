import { describe, expect, it } from 'vitest'
import { scrubEvent, sentryEnabled, sentryIngestOrigin } from './sentry'
import { publicCsp, adminCsp } from './security-headers'

const DSN = 'https://abc123@o456.ingest.de.sentry.io/789'

describe('sentryEnabled', () => {
  it('reports only from a Netlify build with a DSN', () => {
    expect(sentryEnabled(DSN, 'production', 'production')).toBe(true)
    expect(sentryEnabled(DSN, 'staging', 'production')).toBe(true)
    expect(sentryEnabled('', 'production', 'production')).toBe(false)
    expect(sentryEnabled(DSN, 'development', 'production')).toBe(false)
    expect(sentryEnabled(DSN, 'production', 'development')).toBe(false)
  })
})

describe('scrubEvent', () => {
  it('cleans secrets and emails and drops personal request data', () => {
    const event = scrubEvent({
      message: 'Login failed for maya@example.com',
      exception: { values: [{ value: 'connect postgres://user:pw@db.host/prod failed' }] },
      breadcrumbs: [
        { message: 'token=abcdefghijk', data: { url: '/account/reset?token=secret123' } },
      ],
      request: {
        url: 'https://vardenia.com/visit?token=abc',
        query_string: 'token=abc',
        cookies: { session: 'x' },
        headers: { cookie: 'x' },
        data: { password: 'x' },
      },
      user: { ip_address: '1.2.3.4' },
      extra: { note: 'sent to rita@example.com' },
    })

    expect(event.message).toBe('Login failed for [email]')
    expect(event.exception!.values![0]!.value).toContain('postgres://[redacted]')
    expect(event.breadcrumbs![0]!.message).toContain('[redacted]')
    expect(event.breadcrumbs![0]!.data!.url).toBe('/account/reset')
    expect(event.request).toEqual({ url: 'https://vardenia.com/visit' })
    expect(event.user).toBeUndefined()
    expect(event.extra!.note).toBe('sent to [email]')
  })
})

describe('the security policy and Sentry', () => {
  it('lets the browser send to Sentry only when a DSN is set', () => {
    expect(sentryIngestOrigin(DSN)).toEqual(['https://o456.ingest.de.sentry.io'])
    expect(sentryIngestOrigin('')).toEqual([])
    expect(sentryIngestOrigin('not a url')).toEqual([])

    expect(publicCsp(undefined, true, undefined, DSN)).toContain('https://o456.ingest.de.sentry.io')
    expect(publicCsp(undefined, true, undefined, '')).not.toContain('sentry.io')
    expect(adminCsp({ NEXT_PUBLIC_SENTRY_DSN: DSN })).toContain('https://o456.ingest.de.sentry.io')
  })
})
