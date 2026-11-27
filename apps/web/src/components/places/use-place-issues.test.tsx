// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  issuesUrl,
  parseIssuesReply,
  parsePlacesReply,
  placesUrl,
  useIssuePlaces,
  useOpenIssues,
} from './use-place-issues'

describe('parseIssuesReply', () => {
  it('reads the open issues, All Lebanon without a governorate', () => {
    expect(
      parseIssuesReply({
        ok: true,
        issues: [
          { issueId: 9, title: 'Matn', coverage: 'governorate', governorate: 'matn' },
          { issueId: 7, title: 'Summer', coverage: 'all-lebanon', governorate: 'matn' },
          { issueId: 6, coverage: 'something' },
        ],
      }),
    ).toEqual([
      { issueId: 9, title: 'Matn', coverage: 'governorate', governorate: 'matn' },
      { issueId: 7, title: 'Summer', coverage: 'all-lebanon', governorate: null },
      { issueId: 6, title: '', coverage: 'all-lebanon', governorate: null },
    ])
  })

  it('drops a malformed issue, and a one-governorate issue with no valid governorate', () => {
    expect(
      parseIssuesReply({
        ok: true,
        issues: [
          null,
          { issueId: 'x' },
          { issueId: 0 },
          { issueId: 3, coverage: 'governorate', governorate: null },
          { issueId: 4, coverage: 'governorate', governorate: 'atlantis' },
        ],
      }),
    ).toEqual([])
  })

  it('refuses anything else', () => {
    expect(parseIssuesReply(null)).toBeNull()
    expect(parseIssuesReply('Too many requests')).toBeNull()
    expect(parseIssuesReply({ ok: false })).toBeNull()
    expect(parseIssuesReply({ ok: true, issues: {} })).toBeNull()
  })
})

describe('parsePlacesReply', () => {
  it('reads the places with their free counts; a bad count is full', () => {
    expect(
      parsePlacesReply({
        ok: true,
        places: [
          { governorate: 'matn', city: 'dbayeh', free: 3 },
          { governorate: 'beirut', city: null, free: 0 },
          { governorate: 'chouf', city: '', free: -2 },
          { governorate: 'beqaa', free: 'x' },
          { governorate: 'atlantis', city: null, free: 2 },
        ],
      }),
    ).toEqual([
      { governorate: 'matn', city: 'dbayeh', free: 3 },
      { governorate: 'beirut', city: null, free: 0 },
      { governorate: 'chouf', city: null, free: 0 },
      { governorate: 'beqaa', city: null, free: 0 },
    ])
  })

  it('refuses anything else', () => {
    expect(parsePlacesReply(null)).toBeNull()
    expect(parsePlacesReply({ ok: true, issues: [] })).toBeNull()
  })
})

describe('the URLs', () => {
  it('asks for the issues in the page language, and for one issue by id', () => {
    expect(issuesUrl('ar')).toBe('/place-submissions/issues?locale=ar')
    expect(placesUrl(9)).toBe('/place-submissions/issues?issue=9')
  })
})

describe('useOpenIssues and useIssuePlaces', () => {
  let root: Root
  let issues: ReturnType<typeof useOpenIssues>
  let places: ReturnType<typeof useIssuePlaces>

  function Probe({ issueId }: { issueId: number | null }) {
    issues = useOpenIssues('en')
    places = useIssuePlaces(issueId)
    return null
  }
  const render = (issueId: number | null) =>
    act(async () => {
      root.render(<Probe issueId={issueId} />)
    })

  const reply = (url: string) =>
    new Response(
      JSON.stringify(
        url.includes('issue=')
          ? { ok: true, places: [{ governorate: 'matn', city: url.slice(-1), free: 1 }] }
          : { ok: true, issues: [{ issueId: 9, title: 'Matn', coverage: 'all-lebanon' }] },
      ),
      { status: 200 },
    )

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    root = createRoot(document.createElement('div'))
  })
  afterEach(() => {
    act(() => root.unmount())
    vi.unstubAllGlobals()
  })

  it('loads the issues at once, and the places only once an issue is chosen', async () => {
    const fetchMock = vi.fn(async (url: string) => reply(url))
    vi.stubGlobal('fetch', fetchMock)
    await render(null)
    expect(issues.state).toBe('ready')
    expect(issues.issues.map((i) => i.issueId)).toEqual([9])
    expect(places.state).toBe('idle')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await render(9)
    expect(places.state).toBe('ready')
    expect(places.places).toEqual([{ governorate: 'matn', city: '9', free: 1 }])
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      '/place-submissions/issues?locale=en',
      '/place-submissions/issues?issue=9',
    ])
    const init = (fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1]
    expect(init.cache).toBe('no-store')
  })

  it('reports an error, and fetches again on reload', async () => {
    const fetchMock = vi.fn(async () => new Response('Too many', { status: 429 }))
    vi.stubGlobal('fetch', fetchMock)
    await render(4)
    expect(issues.state).toBe('error')
    expect(places.state).toBe('error')
    await act(async () => places.reload())
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
