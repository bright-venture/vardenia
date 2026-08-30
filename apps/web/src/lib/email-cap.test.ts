import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmailAdapter } from 'payload'
import { SEND_CAP, __resetSendCap, checkSendBudget, recipientsOf, withSendCap } from './email-cap'

vi.mock('./report', () => ({ reportError: vi.fn() }))

/**
 * The ceiling on outbound mail.
 *
 * Every other guard on this path bounds one caller. This is the only thing that
 * bounds the total, and the failure it exists for is not an attacker: it is a
 * bill, and a spent sending reputation that puts ordinary password resets in
 * everybody's junk folder for weeks with no way to undo it.
 */

beforeEach(() => {
  __resetSendCap()
})

describe('reading who a message is going to', () => {
  it('takes a plain address', () => {
    expect(recipientsOf('Someone@Example.com')).toEqual(['someone@example.com'])
  })

  /** Nodemailer accepts all of these shapes, so the cap has to as well. */
  it('takes the other shapes an adapter accepts', () => {
    expect(recipientsOf(['a@x.com', 'B@x.com'])).toEqual(['a@x.com', 'b@x.com'])
    expect(recipientsOf('a@x.com, b@x.com')).toEqual(['a@x.com', 'b@x.com'])
    expect(recipientsOf({ address: 'a@x.com', name: 'A' })).toEqual(['a@x.com'])
    expect(recipientsOf([{ address: 'a@x.com' }, 'b@x.com'])).toEqual(['a@x.com', 'b@x.com'])
  })

  it('is not upset by nothing at all', () => {
    expect(recipientsOf(undefined)).toEqual([])
    expect(recipientsOf(null)).toEqual([])
    expect(recipientsOf('')).toEqual([])
    expect(recipientsOf(42)).toEqual([])
  })
})

describe('the per-recipient ceiling', () => {
  const flood = (address: string, n: number) =>
    Array.from({ length: n }, () => checkSendBudget([address]))

  it('lets a real person through and stops a flood', () => {
    const verdicts = flood('victim@example.com', SEND_CAP.PER_RECIPIENT + 2)

    expect(verdicts.slice(0, SEND_CAP.PER_RECIPIENT).every((v) => v.allowed)).toBe(true)
    expect(verdicts[SEND_CAP.PER_RECIPIENT]?.allowed).toBe(false)
  })

  it('says which address it stopped, since that is the whole point', () => {
    flood('victim@example.com', SEND_CAP.PER_RECIPIENT)
    const blocked = checkSendBudget(['victim@example.com'])

    expect(blocked.allowed).toBe(false)
    if (!blocked.allowed) {
      expect(blocked.reason).toBe('recipient')
      expect(blocked.detail).toContain('victim@example.com')
    }
  })

  /** One mailbox being flooded must not stop mail to anybody else. */
  it('does not punish a bystander', () => {
    flood('victim@example.com', SEND_CAP.PER_RECIPIENT + 3)
    expect(checkSendBudget(['someone-else@example.com']).allowed).toBe(true)
  })

  it('treats the same address in different case as one mailbox', () => {
    flood('Victim@Example.com', SEND_CAP.PER_RECIPIENT)
    expect(checkSendBudget(['victim@example.com']).allowed).toBe(false)
  })

  it('lets the mailbox through again once the window has passed', () => {
    const now = Date.now()
    for (let i = 0; i < SEND_CAP.PER_RECIPIENT; i += 1) {
      checkSendBudget(['victim@example.com'], now)
    }

    expect(checkSendBudget(['victim@example.com'], now).allowed).toBe(false)
    expect(checkSendBudget(['victim@example.com'], now + SEND_CAP.WINDOW_MS + 1).allowed).toBe(true)
  })

  /**
   * A message to two addresses where one is over its limit is refused whole,
   * and must not charge the address that was still under.
   */
  it('does not charge one recipient for another being over', () => {
    for (let i = 0; i < SEND_CAP.PER_RECIPIENT; i += 1) checkSendBudget(['full@example.com'])

    expect(checkSendBudget(['fresh@example.com', 'full@example.com']).allowed).toBe(false)

    // fresh@ was never counted, so it still has its whole allowance.
    for (let i = 0; i < SEND_CAP.PER_RECIPIENT; i += 1) {
      expect(checkSendBudget(['fresh@example.com']).allowed, `send ${i + 1}`).toBe(true)
    }
  })
})

describe('the global ceiling', () => {
  it('stops a runaway loop sending to a thousand different addresses', () => {
    for (let i = 0; i < SEND_CAP.GLOBAL_PER_WINDOW; i += 1) {
      expect(checkSendBudget([`person-${i}@example.com`]).allowed, `send ${i}`).toBe(true)
    }

    const blocked = checkSendBudget(['one-more@example.com'])
    expect(blocked.allowed).toBe(false)
    if (!blocked.allowed) expect(blocked.reason).toBe('global')
  })

  /**
   * The per-recipient limit alone would let this through: a thousand messages to
   * a thousand mailboxes is one each. That is exactly the accidental case - a
   * loop over every listing - and it is why there are two ceilings rather than
   * one.
   */
  it('catches what the per-recipient ceiling cannot', () => {
    const perRecipientWouldAllow = SEND_CAP.GLOBAL_PER_WINDOW + 50
    let allowed = 0

    for (let i = 0; i < perRecipientWouldAllow; i += 1) {
      if (checkSendBudget([`unique-${i}@example.com`]).allowed) allowed += 1
    }

    expect(allowed).toBe(SEND_CAP.GLOBAL_PER_WINDOW)
  })

  it('does not spend the global budget on a message it refused', () => {
    for (let i = 0; i < SEND_CAP.PER_RECIPIENT; i += 1) checkSendBudget(['full@example.com'])

    const before = SEND_CAP.GLOBAL_PER_WINDOW - SEND_CAP.PER_RECIPIENT
    for (let i = 0; i < 10; i += 1) checkSendBudget(['full@example.com'])

    // Those ten were all refused, so the remaining global budget is untouched.
    let sent = 0
    while (checkSendBudget([`x-${sent}@example.com`]).allowed) sent += 1

    expect(sent).toBe(before)
  })
})

describe('the wrapper around the adapter', () => {
  /**
   * Typed as Payload's own adapter, not as a convenient shape. A looser type
   * here would let the wrapper drift away from what Payload actually calls and
   * the tests would keep passing.
   */
  const adapterSending =
    (sent: unknown[]): EmailAdapter<unknown> =>
    () => ({
      name: 'test',
      defaultFromAddress: 'a@vardenia.com',
      defaultFromName: 'Vardenia',
      sendEmail: async (message) => {
        sent.push(message)
        return { id: 'sent' }
      },
    })

  const init = (adapter: EmailAdapter<unknown>) => withSendCap(adapter)({ payload: {} as never })

  it('passes an ordinary message straight through', async () => {
    const sent: unknown[] = []
    const send = init(adapterSending(sent))

    await send.sendEmail({ to: 'someone@example.com', subject: 'Hello' })
    expect(sent).toHaveLength(1)
  })

  it('stops the message once the mailbox is over its limit', async () => {
    const sent: unknown[] = []
    const send = init(adapterSending(sent))

    for (let i = 0; i < SEND_CAP.PER_RECIPIENT + 3; i += 1) {
      await send.sendEmail({ to: 'victim@example.com', subject: 'Reset your password' })
    }

    expect(sent).toHaveLength(SEND_CAP.PER_RECIPIENT)
  })

  /** The adapter keeps its identity, or Payload cannot use it. */
  it('leaves the rest of the adapter alone', () => {
    const send = init(adapterSending([]))

    expect(send.name).toBe('test')
    expect(send.defaultFromAddress).toBe('a@vardenia.com')
    expect(send.defaultFromName).toBe('Vardenia')
  })

  /**
   * The property that decides whether this wrapper is safe to ship at all.
   *
   * A spending cap that can break every password reset on the site is worse
   * than no spending cap: one costs money, the other costs the product. So a
   * failure inside the accounting sends the message anyway.
   */
  it('sends the message anyway if its own accounting throws', async () => {
    const sent: unknown[] = []
    const send = init(adapterSending(sent))

    // A `to` that makes recipientsOf throw when it walks the value.
    const hostile = {
      get address() {
        throw new Error('exploded while being read')
      },
    }

    await send.sendEmail({ to: hostile, subject: 'Important' })
    expect(sent, 'the message must still go out').toHaveLength(1)
  })

  /** A refusal must not become an exception in the caller's request. */
  it('does not throw at the caller when it refuses', async () => {
    const send = init(adapterSending([]))

    for (let i = 0; i < SEND_CAP.PER_RECIPIENT; i += 1) {
      await send.sendEmail({ to: 'victim@example.com' })
    }

    await expect(send.sendEmail({ to: 'victim@example.com' })).resolves.toBeUndefined()
  })
})
