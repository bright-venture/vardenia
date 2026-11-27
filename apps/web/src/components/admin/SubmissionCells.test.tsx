import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildSlots } from '@vardenia/core'
import { IssuePageCell, ReferenceCell } from './SubmissionCells'

const slots = buildSlots([{ layout: 'full-page' }, { layout: 'half-page' }])

const payload = {
  find: async () => ({
    docs: [
      { id: 1, title: 'All Lebanon', slots },
      { id: 2, title: 'Winter 2026', slots: null },
    ],
  }),
}

const render = async (rowData: Record<string, unknown>) =>
  renderToStaticMarkup(
    await IssuePageCell({ rowData, payload } as unknown as Parameters<typeof IssuePageCell>[0]),
  )

describe('IssuePageCell', () => {
  it('shows the layout label and the page of the number', async () => {
    const html = await render({ issue: 1, listingNumber: 3, pageLayout: 'half-page' })
    expect(html).toContain('All Lebanon')
    expect(html).toContain('Half page')
    expect(html).toContain('Page 2, position 2')
  })

  it('shows a dash for the layout of a legacy listing, and its number as the page', async () => {
    const html = await render({ issue: 2, listingNumber: 12 })
    expect(html).toContain('Winter 2026')
    expect(html).toContain('Page 12')
    expect(html).toContain('>-<')
  })
})

describe('ReferenceCell', () => {
  const cell = (props: Record<string, unknown>) =>
    renderToStaticMarkup(
      ReferenceCell({
        payload: { config: { routes: { admin: '/admin' } } },
        collectionSlug: 'businesses',
        ...props,
      } as unknown as Parameters<typeof ReferenceCell>[0]) as React.ReactElement,
    )

  it('links the reference to the listing when it is the first column', () => {
    const html = cell({ link: true, rowData: { id: 7, submission: { reference: 'VD-7' } } })
    expect(html).toContain('href="/admin/collections/businesses/7"')
    expect(html).toContain('VD-7')
  })

  it('still gives a listing with no reference something to click', () => {
    const html = cell({ link: true, rowData: { id: 8 } })
    expect(html).toContain('href="/admin/collections/businesses/8"')
    expect(html).toContain('Open')
  })

  it('opens trashed listings in the trash view', () => {
    const html = cell({ link: true, viewType: 'trash', rowData: { id: 9 } })
    expect(html).toContain('href="/admin/collections/businesses/trash/9"')
  })

  it('is plain text when it is not the first column', () => {
    const html = cell({ link: false, rowData: { id: 7, submission: { reference: 'VD-7' } } })
    expect(html).not.toContain('href')
    expect(html).toContain('VD-7')
  })
})
