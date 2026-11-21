import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { revokeOtherSessions } from './sessions'

const fake = (sessions: { id: string }[]) => {
  const updateOne = vi.fn(async () => ({}))
  const payload = {
    db: { findOne: vi.fn(async () => ({ id: 7, sessions })), updateOne },
  } as unknown as Payload
  return { payload, updateOne }
}

describe('revokeOtherSessions', () => {
  it('keeps the current device and signs out the others', async () => {
    const { payload, updateOne } = fake([{ id: 'phone' }, { id: 'laptop' }, { id: 'tablet' }])
    expect(await revokeOtherSessions(payload, 'customers', 7, 'phone')).toBe(2)
    expect(updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 7,
        data: expect.objectContaining({ sessions: [{ id: 'phone' }] }),
      }),
    )
  })

  it('signs out every device when the current one is unknown', async () => {
    const { payload, updateOne } = fake([{ id: 'phone' }, { id: 'laptop' }])
    expect(await revokeOtherSessions(payload, 'customers', 7, undefined)).toBe(2)
    expect(updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sessions: [] }) }),
    )
  })

  it('writes nothing when there is nothing to sign out', async () => {
    const { payload, updateOne } = fake([{ id: 'phone' }])
    expect(await revokeOtherSessions(payload, 'customers', 7, 'phone')).toBe(0)
    expect(updateOne).not.toHaveBeenCalled()
  })
})
