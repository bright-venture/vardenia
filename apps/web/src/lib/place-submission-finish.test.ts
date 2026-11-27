import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./report', () => ({ reportError: vi.fn(async () => {}) }))
vi.mock('./place-payment-notify', () => ({ notifyAfterChange: vi.fn(async () => {}) }))
vi.mock('./branches', async () => ({
  runInTransaction: (await import('./place-submission-fake')).runInFakeTransaction,
}))
vi.mock('./partner-lock', async () => ({
  advisoryLock: (await import('./place-submission-fake')).fakeAdvisoryLock,
  placeSubmissionLockKey: (id: number | string) => `lock-${id}`,
}))

import { reportError } from './report'
import { notifyAfterChange } from './place-payment-notify'
import { bindFakeLog, fakePayload, type FakePayload } from './place-submission-fake'
import { finishPlaceSubmission } from './place-submission-finish'
import { hashSessionToken } from './place-submission'

const TOKEN = 'tok-secret-123'
interface Sub {
  status: string
  terms: Record<string, unknown>
}
const sub = (f: FakePayload) => f.row('businesses').submission as Sub
const NOW = new Date('2026-11-23T12:00:00.000Z')

function world(
  over: {
    business?: Record<string, unknown>
    session?: Record<string, unknown>
    issue?: Record<string, unknown>
  } = {},
) {
  const f = fakePayload({
    businesses: [
      {
        id: 5,
        name: 'Cafe <b>Nour</b>',
        governorate: 'beirut',
        listingNumber: 12,
        issue: 7,
        tier: 'silver',
        heroImage: 100,
        logo: 101,
        submission: {
          status: 'incomplete',
          reference: 'VD-5',
          ownerName: 'Nour',
          ownerEmail: 'nour@example.com',
          ownerPhone: '+9617',
        },
        ...over.business,
      },
    ],
    'place-upload-sessions': [
      {
        id: 9,
        tokenHash: hashSessionToken(TOKEN),
        business: 5,
        expiresAt: '2026-11-23T12:30:00.000Z',
        logoReceived: true,
        heroReceived: true,
        ...over.session,
      },
    ],
    issues: [{ id: 7, title: 'Summer 2027', ...over.issue }],
  })
  return f
}

const finish = (f: FakePayload, over: Record<string, unknown> = {}) =>
  finishPlaceSubmission({
    payload: f.payload,
    token: TOKEN,
    acceptedTerms: true,
    now: NOW,
    ...over,
  })

beforeEach(() => {
  vi.mocked(reportError).mockClear()
  vi.mocked(notifyAfterChange).mockClear()
  process.env.PLACE_SUBMISSION_ALERT_TO = 'team@example.com'
})

describe('finishPlaceSubmission', () => {
  it.each([
    ['logoReceived', { logoReceived: false }],
    ['heroReceived', { heroReceived: false }],
    ['both flags missing', { logoReceived: undefined, heroReceived: undefined }],
  ])(
    'needs the session flags as well as the photos: %s unset => photos-missing',
    async (_n, flags) => {
      const f = world({ session: flags })
      expect(await finish(f)).toEqual({ ok: false, code: 'photos-missing' })
      expect(sub(f).status).toBe('incomplete')
      expect(f.row('place-upload-sessions').closedAt).toBeUndefined()
      expect(f.emails).toHaveLength(0)
    },
  )

  it('both flags on but the listing holds no logo => photos-missing', async () => {
    const f = world({ business: { logo: null } })
    expect(await finish(f)).toEqual({ ok: false, code: 'photos-missing' })
  })

  it('moves the business to awaiting_downpayment, stamps the terms, closes the session, alerts the team and asks for E1', async () => {
    const f = world()
    const r = await finish(f)
    expect(r).toEqual({ ok: true, reference: 'VD-5' })

    const s = sub(f)
    expect(s).toMatchObject({
      status: 'awaiting_downpayment',
      submittedAt: NOW.toISOString(),
      reference: 'VD-5',
      ownerEmail: 'nour@example.com',
      terms: {
        version: '2026-11-24',
        priceAtAcceptance: 1000,
        currency: 'USD',
        termMonths: 12,
        acceptedAt: NOW.toISOString(),
      },
    })
    expect(f.row('place-upload-sessions').closedAt).toBe(NOW.toISOString())
    // The number stays reserved while the downpayment is awaited.
    expect(f.row('businesses').listingNumber).toBe(12)

    // The owner's only email is E1 (lib/place-payment-notify): the first
    // version's confirmation is no longer sent here.
    expect(f.emails.map((e) => e.to)).toEqual(['team@example.com'])
    expect(notifyAfterChange).toHaveBeenCalledWith('E1', expect.objectContaining({ businessId: 5 }))
    const team = f.emails.find((e) => e.to === 'team@example.com')!
    expect(team.html).toContain('/admin/collections/businesses/5')
    expect(team.html).toContain('Summer 2027')
    // Escaped.
    expect(team.html).not.toContain('<b>Nour</b>')
  })

  it('writes only staff fields: nothing but submission changes, no request data', async () => {
    const f = world()
    await finish(f)
    const write = f.updates.find((u) => u.collection === 'businesses')!
    expect(Object.keys(write.data)).toEqual(['submission'])
    expect(f.row('businesses').tier).toBe('silver')
  })

  it('a second finish with the same token replays the answer and sends no second email', async () => {
    const f = world()
    await finish(f)
    const again = await finish(f)
    expect(again).toEqual({ ok: true, reference: 'VD-5' })
    expect(f.emails).toHaveLength(1)
    expect(notifyAfterChange).toHaveBeenCalledTimes(1)
  })

  it('two finishes at once: only the one that claims the business sends emails', async () => {
    const f = world()
    const [a, b] = await Promise.all([finish(f), finish(f)])
    // Both are told the same thing; only the one that claimed it sent emails.
    expect(a).toEqual({ ok: true, reference: 'VD-5' })
    expect(b).toEqual({ ok: true, reference: 'VD-5' })
    expect(f.emails).toHaveLength(1)
    expect(notifyAfterChange).toHaveBeenCalledTimes(1)
  })

  it('refuses without accepted terms and changes nothing', async () => {
    const f = world()
    for (const acceptedTerms of [false, 'true', 1, undefined]) {
      expect(await finish(f, { acceptedTerms })).toEqual({ ok: false, code: 'terms-not-accepted' })
    }
    expect(f.row('businesses').submission).toMatchObject({ status: 'incomplete' })
    expect(f.row('place-upload-sessions').closedAt).toBeUndefined()
    expect(f.emails).toHaveLength(0)
  })

  it('refuses when the main photo or the logo is missing', async () => {
    for (const missing of ['heroImage', 'logo']) {
      const f = world({ business: { [missing]: null } })
      expect(await finish(f)).toEqual({ ok: false, code: 'photos-missing' })
      expect(f.row('businesses').submission).toMatchObject({ status: 'incomplete' })
      expect(f.emails).toHaveLength(0)
    }
  })

  it('wrong, expired and closed tokens, and a business no longer incomplete, are all the same not-found', async () => {
    const notFound = { ok: false, code: 'not-found' }
    expect(await finish(world(), { token: 'wrong' })).toEqual(notFound)
    expect(await finish(world(), { token: '' })).toEqual(notFound)
    expect(await finish(world({ session: { expiresAt: '2026-11-23T11:59:59.000Z' } }))).toEqual(
      notFound,
    )
    expect(await finish(world({ session: { closedAt: '2026-11-23T11:00:00.000Z' } }))).toEqual(
      notFound,
    )
    for (const status of ['awaiting_downpayment', 'pending', 'abandoned', 'accepted', 'rejected']) {
      const f = world({ business: { submission: { status } } })
      expect(await finish(f)).toEqual(notFound)
      expect(f.emails).toHaveLength(0)
    }
  })

  it('checks the token before the terms, so a wrong token learns nothing from the refusal', async () => {
    expect(await finish(world(), { token: 'wrong', acceptedTerms: false })).toEqual({
      ok: false,
      code: 'not-found',
    })
  })

  it('snapshots the Settings at that moment and keeps them when Settings change later', async () => {
    const f = world()
    f.settings.value = {
      magazinePlaces: { pricePerYear: 35, currency: 'eur', termMonths: 6, termsVersion: 'v9' },
    }
    await finish(f)
    const terms = sub(f).terms
    expect(terms).toMatchObject({
      version: 'v9',
      priceAtAcceptance: 35,
      currency: 'EUR',
      termMonths: 6,
    })
    f.settings.value = { magazinePlaces: { pricePerYear: 99 } }
    expect(sub(f).terms.priceAtAcceptance).toBe(35)
  })

  it('uses the price snapshot of the draft, not Settings, and records layout and issue in the terms', async () => {
    const f = world({
      business: {
        pageLayout: 'full-page',
        submission: {
          status: 'incomplete',
          reference: 'VD-5',
          ownerName: 'Nour',
          ownerEmail: 'nour@example.com',
          payment: { price: 500, downpaymentAmount: 250 },
        },
      },
    })
    f.settings.value = { magazinePlaces: { pricePerYear: 35, downpaymentPercent: 10 } }
    await finish(f)
    const s = f.row('businesses').submission as Record<string, Record<string, unknown>>
    expect(s.terms).toMatchObject({
      priceAtAcceptance: 500,
      layout: 'Full page',
      issue: 'Summer 2027',
    })
    expect(s.payment).toMatchObject({ price: 500, downpaymentAmount: 250, stillToPay: 500 })
  })

  it('records the page of the slot held in the terms, as text', async () => {
    const f = world({
      business: {
        pageLayout: 'quarter-page',
        listingNumber: 12,
        submission: {
          status: 'incomplete',
          reference: 'VD-5',
          ownerName: 'Nour',
          ownerEmail: 'nour@example.com',
          payment: { price: 100, downpaymentAmount: 50 },
        },
      },
      issue: {
        slots: [
          { number: 11, page: 62, position: 2, layout: 'quarter-page' },
          { number: 12, page: 62, position: 3, layout: 'quarter-page' },
        ],
      },
    })
    await finish(f)
    expect(sub(f).terms).toMatchObject({
      layout: '1/4',
      issue: 'Summer 2027',
      page: 'Page 62, position 3',
    })
  })

  it('records both pages of a spread', async () => {
    const f = world({
      business: { pageLayout: 'full-spread' },
      issue: { slots: [{ number: 12, page: 62, position: null, layout: 'full-spread' }] },
    })
    await finish(f)
    expect(sub(f).terms.page).toBe('Pages 62-63')
  })

  it('a legacy draft without a snapshot uses the Settings price and has no layout in the terms', async () => {
    const f = world()
    f.settings.value = { magazinePlaces: { pricePerYear: 35, downpaymentPercent: 50 } }
    await finish(f)
    const s = f.row('businesses').submission as Record<string, Record<string, unknown>>
    expect(s.terms?.priceAtAcceptance).toBe(35)
    expect(s.terms).not.toHaveProperty('layout')
    expect(s.terms).not.toHaveProperty('page')
    expect(s.payment).toMatchObject({ price: 35, downpaymentAmount: 17.5, stillToPay: 35 })
  })

  it('snapshots the two-stage payment: price, downpayment, deadlines, no money yet', async () => {
    const f = world()
    f.settings.value = {
      magazinePlaces: {
        pricePerYear: 999.99,
        downpaymentPercent: 50,
        downpaymentDeadlineDays: 10,
        balanceDeadlineDays: 45,
      },
    }
    await finish(f)
    const s = f.row('businesses').submission as Record<string, unknown>
    expect(s.payments).toEqual([])
    expect(s.payment).toEqual({
      stage: 'none',
      price: 999.99,
      downpaymentAmount: 500,
      currency: 'USD',
      received: 0,
      refunded: 0,
      stillToPay: 999.99,
      downpaymentDueAt: '2026-12-03T12:00:00.000Z',
      balanceDeadlineDays: 45,
    })
    // Changing the settings later does not touch it.
    f.settings.value = { magazinePlaces: { pricePerYear: 5 } }
    expect((f.row('businesses').submission as { payment: { price: number } }).payment.price).toBe(
      999.99,
    )
  })

  it('asks for E1 once, after the write, and never on a replay', async () => {
    const f = world()
    await finish(f, { locale: 'ar' })
    expect(notifyAfterChange).toHaveBeenCalledTimes(1)
    expect(notifyAfterChange).toHaveBeenCalledWith(
      'E1',
      expect.objectContaining({ businessId: 5, locale: 'ar' }),
    )
    await finish(f)
    expect(notifyAfterChange).toHaveBeenCalledTimes(1)
  })

  it('records the step in the history, with nobody as the actor', async () => {
    const f = world()
    await finish(f)
    const history = (f.row('businesses').submission as { history: Record<string, unknown>[] })
      .history
    expect(history).toMatchObject([{ step: 'awaiting_downpayment', by: null }])
  })

  it('passes the language to the owner email (E1) without storing it', async () => {
    const f = world()
    await finish(f, { locale: 'ar' })
    expect(notifyAfterChange).toHaveBeenCalledWith('E1', expect.objectContaining({ locale: 'ar' }))
    expect(JSON.stringify(f.row('businesses'))).not.toContain('"ar"')
  })

  it('still succeeds when an email cannot be sent, and reports it', async () => {
    const f = world()
    f.failSend.value = true
    expect(await finish(f)).toEqual({ ok: true, reference: 'VD-5' })
    expect(f.row('businesses').submission).toMatchObject({ status: 'awaiting_downpayment' })
    expect(reportError).toHaveBeenCalled()
  })

  it('leaves the form open when the write fails', async () => {
    const f = world()
    f.failUpdate.add('businesses:5')
    expect(await finish(f)).toEqual({ ok: false, code: 'error' })
    expect(f.emails).toHaveLength(0)
  })

  it('takes the submission lock before re-reading, and a caller that finds the session closed after the lock sends nothing', async () => {
    const f = world()
    bindFakeLog(f)
    // The other finish closes the session between this caller's first look and
    // its lock: only a read after the lock can notice.
    const find = f.payload.find.bind(f.payload)
    vi.spyOn(f.payload, 'find').mockImplementation(async (args) => {
      const found = await find(args)
      f.row('place-upload-sessions').closedAt = NOW.toISOString()
      f.row('businesses').submission = {
        ...(f.row('businesses').submission as object),
        status: 'pending',
      }
      return found
    })
    // The other finish got there first: this one replays it and sends nothing.
    expect(await finish(f)).toEqual({ ok: true, reference: 'VD-5' })
    const lock = f.log.indexOf('lock:lock-5')
    expect(lock).toBeGreaterThanOrEqual(0)
    expect(f.log.slice(lock + 1)).toContain('read:place-upload-sessions')
    expect(f.emails).toHaveLength(0)
  })

  it('reports an update that comes back with errors, and returns error rather than not-found', async () => {
    const f = world()
    f.errorUpdate.add('businesses:5')
    expect(await finish(f)).toEqual({ ok: false, code: 'error' })
    expect(reportError).toHaveBeenCalled()
    expect(f.emails).toHaveLength(0)
    expect(f.row('place-upload-sessions').closedAt).toBeUndefined()
  })

  describe('replay', () => {
    it.each(['awaiting_downpayment', 'pending', 'accepted', 'paid', 'approved', 'expired'])(
      'a closed session whose business is %s answers ok with the reference, sending nothing',
      async (status) => {
        const f = world({
          business: { submission: { status, reference: 'VD-5' } },
          session: { closedAt: '2026-11-23T11:00:00.000Z' },
        })
        expect(await finish(f)).toEqual({ ok: true, reference: 'VD-5' })
        expect(f.emails).toHaveLength(0)
        expect(f.updates).toHaveLength(0)
      },
    )

    it.each(['abandoned', 'rejected', 'incomplete'])(
      'a closed session whose business is %s stays not-found',
      async (status) => {
        const f = world({
          business: { submission: { status, reference: 'VD-5' } },
          session: { closedAt: '2026-11-23T11:00:00.000Z' },
        })
        expect(await finish(f)).toEqual({ ok: false, code: 'not-found' })
      },
    )

    it('a wrong token never replays', async () => {
      const f = world({
        business: { submission: { status: 'pending', reference: 'VD-5' } },
        session: { closedAt: '2026-11-23T11:00:00.000Z' },
      })
      expect(await finish(f, { token: 'wrong' })).toEqual({ ok: false, code: 'not-found' })
    })
  })

  describe('idle and hard cap (lib/place-session)', () => {
    const MIN = 60_000
    const at = (minutesBeforeNow: number) =>
      new Date(NOW.getTime() - minutesBeforeNow * MIN).toISOString()

    it('is not found once the session has been idle longer than holdMinutes', async () => {
      const f = world({ session: { updatedAt: at(31) } })
      expect(await finish(f)).toEqual({ ok: false, code: 'not-found' })
      expect(f.emails).toHaveLength(0)
    })

    it('is alive when the last activity was within holdMinutes, even long after the start', async () => {
      // Started two hours ago; a photo arrived at minute 29 of the hold, finish at minute 31 of the
      // first activity: updatedAt moved, so it is alive.
      const f = world({ session: { createdAt: at(120), updatedAt: at(2) } })
      expect(await finish(f)).toEqual({ ok: true, reference: 'VD-5' })
    })

    it('upload at minute 29, finish at minute 31 of the session: alive', async () => {
      const start = new Date('2026-11-23T10:00:00.000Z')
      const f = world({
        session: {
          createdAt: start.toISOString(),
          updatedAt: new Date(start.getTime() + 29 * MIN).toISOString(),
          expiresAt: new Date(start.getTime() + 24 * 60 * MIN).toISOString(),
        },
      })
      const r = await finish(f, { now: new Date(start.getTime() + 31 * MIN) })
      expect(r).toEqual({ ok: true, reference: 'VD-5' })
    })

    it('the hard cap ends the session whatever the activity', async () => {
      const f = world({ session: { updatedAt: at(1), expiresAt: at(0) } })
      expect(await finish(f)).toEqual({ ok: false, code: 'not-found' })
    })
  })
})
