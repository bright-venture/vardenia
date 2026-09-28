// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/** The review card: the guest's words up front, and the two decisions. */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const form = vi.hoisted(() => ({
  fields: {} as Record<string, { value: unknown }>,
  set: vi.fn(),
}))

vi.mock('@payloadcms/ui', () => ({
  useFormFields: <T,>(select: (context: [Record<string, { value: unknown }>]) => T) =>
    select([form.fields]),
  useField: ({ path }: { path: string }) => ({
    value: form.fields[path]?.value,
    setValue: (value: unknown) => form.set(path, value),
  }),
}))

const { ReviewCard } = await import('./ReviewCard')

let container: HTMLDivElement
let root: Root

const render = () => {
  act(() => root.render(<ReviewCard />))
  return container
}
const button = (label: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === label)

beforeEach(() => {
  form.fields = {
    rating: { value: 4 },
    title: { value: 'Wonderful stay' },
    body: { value: 'Beautiful rooms and warm service.' },
    authorName: { value: 'Rania H.' },
    status: { value: 'pending' },
  }
  form.set.mockReset()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('ReviewCard', () => {
  it("leads with the guest's title and message, and the stars", () => {
    const view = render()
    expect(view.querySelector('h2')?.textContent).toBe('Wonderful stay')
    expect(view.querySelector('blockquote')?.textContent).toBe('Beautiful rooms and warm service.')
    expect(view.querySelector('[aria-label="4 out of 5 stars"]')).not.toBeNull()
    expect(view.textContent).toContain('Rania H.')
    expect(view.textContent).toContain('Waiting for approval')
  })

  it('publishes or rejects through the status field', () => {
    render()
    act(() => button('Publish')!.click())
    expect(form.set).toHaveBeenLastCalledWith('status', 'published')
    act(() => button('Reject')!.click())
    expect(form.set).toHaveBeenLastCalledWith('status', 'rejected')
  })

  it('offers only the other choice once one is made', () => {
    form.fields.status = { value: 'published' }
    render()
    expect(button('Publish')).toBeUndefined()
    expect(button('Reject')).toBeDefined()
  })
})
