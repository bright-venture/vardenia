import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { bookingRequestSchema } from './booking-request'

/**
 * The site's security policy forbids building code at runtime, so Zod must
 * never try (see ./zod). Importing any schema from this package is enough.
 */
describe('zod setup', () => {
  it('runs without generating code, so no page trips the security policy', () => {
    expect(bookingRequestSchema).toBeDefined()
    expect(z.config().jitless).toBe(true)
  })
})
