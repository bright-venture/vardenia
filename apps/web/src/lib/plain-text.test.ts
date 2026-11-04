import { describe, expect, it } from 'vitest'
import { listingSummary, richTextToPlain, summarise } from './plain-text'

/** What a listing tells search engines about itself, now that taglines are empty. */

const paragraph = (text: string) => ({
  type: 'paragraph',
  children: [{ type: 'text', text }],
})
const doc = (...texts: string[]) => ({ root: { type: 'root', children: texts.map(paragraph) } })

describe('rich text as plain text', () => {
  it('reads every paragraph in order, one space between them', () => {
    expect(richTextToPlain(doc('Ba3d mashwar bel jabal.', 'Fenjen ahwe 7add el shibbak.'))).toBe(
      'Ba3d mashwar bel jabal. Fenjen ahwe 7add el shibbak.',
    )
  })

  it('gives nothing for nothing', () => {
    expect(richTextToPlain(null)).toBe('')
    expect(richTextToPlain({ root: { children: [] } })).toBe('')
  })
})

describe('the summary', () => {
  it('leaves a short text whole', () => {
    expect(summarise('A short line.')).toBe('A short line.')
  })

  it('cuts a long one at a word, within the limit, with an ellipsis', () => {
    const long = 'word '.repeat(60).trim()
    const out = summarise(long, 155)
    expect(out.length).toBeLessThanOrEqual(155)
    expect(out.endsWith('word…')).toBe(true)
  })
})

describe('what a listing gives search engines', () => {
  it('uses the tagline when there is one', () => {
    expect(listingSummary({ tagline: 'By the sea', description: doc('Long text') })).toBe(
      'By the sea',
    )
  })

  it('falls back to the opening of the description when the tagline is empty', () => {
    expect(listingSummary({ tagline: '', description: doc('Fenjen ahwe 7add el shibbak.') })).toBe(
      'Fenjen ahwe 7add el shibbak.',
    )
  })

  it('gives no description rather than an empty one', () => {
    expect(listingSummary({ tagline: null, description: null })).toBeUndefined()
  })
})
