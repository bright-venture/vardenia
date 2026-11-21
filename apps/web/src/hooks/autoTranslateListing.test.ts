import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * What a partner's save costs in machine translation (Task 3).
 *
 * The hook runs after every listing save, now including a partner's edit from
 * the dashboard. It must stay bounded: translate only what changed and is
 * still empty in the target, give up on an engine that is failing rather than
 * waiting on it seven times, refuse a description too large to translate node
 * by node, and never turn its own trouble into a failed save.
 */

const translateText = vi.fn()
const translateRichText = vi.fn()

const reportError = vi.fn(async (...args: unknown[]) => void args)

vi.mock('../lib/translate', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/translate')>()
  return {
    ...real,
    translationConfigured: () => true,
    translateText: (...args: unknown[]) => translateText(...args),
    translateRichText: (...args: unknown[]) => translateRichText(...args),
  }
})
vi.mock('../lib/report', () => ({ reportError: (...args: unknown[]) => reportError(...args) }))

const {
  autoTranslateListing,
  MAX_DESCRIPTION_TEXT_NODES,
  TRANSLATE_BUDGET_MS,
  MAX_TRANSLATED_CHARS_PER_SAVE,
} = await import('./autoTranslateListing')
const { TranslateHttpError } = await import('../lib/translate')

const partner = { id: 5, collection: 'business-users', businesses: [10] }

const rich = (count: number) => ({
  root: {
    type: 'root',
    children: Array.from({ length: count }, (_, i) => ({
      type: 'paragraph',
      children: [{ type: 'text', text: `line ${i}` }],
    })),
  },
})

const run = (opts: {
  doc: Record<string, unknown>
  previousDoc?: Record<string, unknown>
  current?: Record<string, unknown> | Error
}) => {
  const update = vi.fn(async () => ({}))
  const error = vi.fn()
  const findByID = vi.fn(async () => {
    if (opts.current instanceof Error) throw opts.current
    return opts.current ?? {}
  })
  const promise = autoTranslateListing({
    doc: opts.doc,
    previousDoc: opts.previousDoc ?? {},
    req: { user: partner, locale: 'en', payload: { findByID, update, logger: { error } } },
    context: {},
    operation: 'update',
    collection: {},
  } as never)
  return { promise: Promise.resolve(promise), update, findByID, error }
}

beforeEach(() => {
  translateText.mockReset()
  translateRichText.mockReset()
  reportError.mockClear()
  vi.restoreAllMocks()
})

describe('a partner edit and auto-translation', () => {
  it('translates a changed tagline once per empty target', async () => {
    translateText.mockResolvedValue('traduit')
    const doc = { id: 10, name: 'Cafe', tagline: 'By the sea' }
    const { promise, update } = run({ doc, current: { tagline: { en: 'By the sea' } } })
    await expect(promise).resolves.toBe(doc)
    expect(translateText.mock.calls.length).toBe(update.mock.calls.length)
    expect(translateText.mock.calls.length).toBeGreaterThan(0)
    expect(translateText.mock.calls.length).toBeLessThanOrEqual(8)
  })

  it('costs nothing when the targets are already filled', async () => {
    const filled = Object.fromEntries(
      ['fr', 'es', 'pt', 'ru', 'zh', 'hi', 'bn', 'ur'].map((l) => [l, 'x']),
    )
    const { promise, update } = run({
      doc: { id: 10, tagline: 'New line' },
      previousDoc: { tagline: 'Old line' },
      current: { tagline: filled },
    })
    await promise
    expect(translateText).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('costs nothing when neither source field changed', async () => {
    const { promise, findByID } = run({
      doc: { id: 10, tagline: 'Same', name: 'New name' },
      previousDoc: { tagline: 'Same' },
    })
    await promise
    expect(findByID).not.toHaveBeenCalled()
  })

  it('moves on to the next language when one pair is refused', async () => {
    translateText.mockRejectedValueOnce(new TranslateHttpError('en', 'fr', 400))
    translateText.mockResolvedValue('ok')
    const { promise, update } = run({ doc: { id: 10, tagline: 'By the sea' } })
    await promise
    expect(translateText.mock.calls.length).toBeGreaterThan(1)
    expect(update).toHaveBeenCalled()
  })

  it('stops when the engine times out, instead of waiting once per language', async () => {
    translateText.mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))
    const { promise, update, error } = run({ doc: { id: 10, tagline: 'By the sea' } })
    await expect(promise).resolves.toBeTruthy()
    expect(translateText).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalled()
  })

  it('skips a description too large to translate node by node', async () => {
    expect(MAX_DESCRIPTION_TEXT_NODES).toBeGreaterThan(0)
    const { promise } = run({
      doc: { id: 10, description: rich(MAX_DESCRIPTION_TEXT_NODES + 1) },
    })
    await promise
    expect(translateRichText).not.toHaveBeenCalled()
  })

  it('translates a description of ordinary size', async () => {
    translateRichText.mockResolvedValue(rich(1))
    const { promise } = run({ doc: { id: 10, description: rich(3) } })
    await promise
    expect(translateRichText).toHaveBeenCalled()
  })

  it('never fails the save when the current values cannot be read', async () => {
    const doc = { id: 10, tagline: 'By the sea' }
    const { promise, error } = run({ doc, current: new Error('db down') })
    await expect(promise).resolves.toBe(doc)
    expect(error).toHaveBeenCalled()
    expect(translateText).not.toHaveBeenCalled()
  })
})

describe('one budget per save', () => {
  it('stops at the overall deadline and still saves what it has', async () => {
    expect(TRANSLATE_BUDGET_MS).toBe(20_000)
    let now = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    // Each request takes 6 s of the fake clock, inside the per-request timeout.
    translateText.mockImplementation(async () => {
      now += 6_000
      return 'traduit'
    })
    const doc = { id: 10, name: 'Cafe', tagline: 'By the sea' }
    const { promise, update } = run({ doc })
    await expect(promise).resolves.toBe(doc)
    // 20 s at 6 s each: requests start at 0, 6, 12 and 18 s; none after 20.
    expect(translateText).toHaveBeenCalledTimes(4)
    expect(update.mock.calls.length).toBeLessThanOrEqual(4)
    // The deadline is handed to the request, so it cannot overrun it either.
    const deadline = (translateText.mock.calls[0] as unknown[])[3] as { deadline: number }
    expect(deadline.deadline).toBe(1_000_000 + TRANSLATE_BUDGET_MS)
  })

  it('passes the same deadline to rich text translation', async () => {
    translateRichText.mockResolvedValue(rich(1))
    const { promise } = run({ doc: { id: 10, description: rich(2) } })
    await promise
    const opts = (translateRichText.mock.calls[0] as unknown[])[3] as { deadline: number }
    expect(typeof opts.deadline).toBe('number')
  })

  it('caps the characters sent per save', async () => {
    const big = {
      root: {
        type: 'root',
        children: Array.from({ length: 10 }, () => ({
          type: 'paragraph',
          children: [{ type: 'text', text: 'x'.repeat(1000) }],
        })),
      },
    }
    translateRichText.mockResolvedValue(rich(1))
    const { promise } = run({ doc: { id: 10, description: big } })
    await promise
    const perTarget = 10_000
    expect(translateRichText.mock.calls.length).toBe(
      Math.floor(MAX_TRANSLATED_CHARS_PER_SAVE / perTarget),
    )
    expect(translateRichText.mock.calls.length).toBeLessThan(7)
  })

  it('reports an unexpected error instead of hiding it, and still saves', async () => {
    translateText.mockRejectedValueOnce(new RangeError('bug in our code'))
    translateText.mockResolvedValue('ok')
    const doc = { id: 10, tagline: 'By the sea' }
    const { promise } = run({ doc })
    await expect(promise).resolves.toBe(doc)
    expect(reportError).toHaveBeenCalledTimes(1)
  })

  it('does not report an engine refusal or a timeout as a bug', async () => {
    translateText.mockRejectedValueOnce(new TranslateHttpError('en', 'fr', 400))
    translateText.mockRejectedValueOnce(Object.assign(new Error('t'), { name: 'TimeoutError' }))
    const { promise } = run({ doc: { id: 10, tagline: 'By the sea' } })
    await promise
    expect(reportError).not.toHaveBeenCalled()
    expect(translateText).toHaveBeenCalledTimes(2)
  })

  it('treats a plain TypeError that is not a fetch failure as a bug', async () => {
    translateText.mockRejectedValueOnce(new TypeError('cannot read properties of undefined'))
    translateText.mockResolvedValue('ok')
    const { promise } = run({ doc: { id: 10, tagline: 'By the sea' } })
    await promise
    expect(reportError).toHaveBeenCalledTimes(1)
    expect(translateText.mock.calls.length).toBeGreaterThan(1)
  })
})
