import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildSlots } from '@vardenia/core'
import { IssuePageCell } from './SubmissionCells'

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
