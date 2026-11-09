import { describe, expect, it, vi } from 'vitest'
import { Settings } from '../globals/Settings'
import { signupsPaused } from './signups'

/**
 * The switch that pauses new accounts. It must be off unless an admin ticks
 * it, and a setting that cannot be read must leave sign-up open rather than
 * quietly shut it.
 */

const payloadWith = (settings: unknown) =>
  ({
    findGlobal: vi.fn(async () => {
      if (settings instanceof Error) throw settings
      return settings
    }),
  }) as never

describe('pausing new accounts', () => {
  it('is paused only when the box is ticked', async () => {
    await expect(signupsPaused(payloadWith({ signupsPaused: true }))).resolves.toBe(true)
    await expect(signupsPaused(payloadWith({ signupsPaused: false }))).resolves.toBe(false)
    await expect(signupsPaused(payloadWith({}))).resolves.toBe(false)
    await expect(signupsPaused(payloadWith(null))).resolves.toBe(false)
  })

  it('stays open when the setting cannot be read', async () => {
    await expect(signupsPaused(payloadWith(new Error('Test: database down')))).resolves.toBe(false)
  })

  it('reads the setting with access overridden, for signed-out readers', async () => {
    const payload = payloadWith({ signupsPaused: true })
    await signupsPaused(payload)
    expect((payload as { findGlobal: ReturnType<typeof vi.fn> }).findGlobal).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'settings', overrideAccess: true }),
    )
  })

  it('is a box on the Settings page, unticked by default, that only an admin can change', () => {
    const json = JSON.stringify(Settings.fields)
    expect(json).toContain('"name":"signupsPaused"')
    expect(json).toContain('"defaultValue":false')
    expect(Settings.access?.update).toBeDefined()
  })
})
