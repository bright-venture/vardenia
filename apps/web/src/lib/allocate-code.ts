import type { Payload } from 'payload'
import { generateCode } from '@vardenia/core'

/**
 * Mint a short code that no other QR code is using.
 *
 * There are two ways a code comes into existence and they used to disagree.
 * `ensureQrCode` mints one for every listing and had this loop inline; creating
 * a code by hand in the admin panel had nothing at all, so the Code field sat
 * there required, read-only and empty, and the form could not be saved. That
 * only mattered once there was a reason to create a code that belongs to no
 * listing - a `home` code for the site itself is the first.
 *
 * # Why it retries
 *
 * Seven characters of a 32-symbol alphabet is about 34 billion codes, so a
 * collision is not a real expectation. It is handled anyway because the failure
 * it prevents is not "the save failed" - it is two records sharing one code,
 * which on paper means two listings behind one symbol and no way to tell them
 * apart afterwards.
 *
 * # What it does not promise
 *
 * Check-then-insert is not atomic, so two allocations running at the same
 * millisecond can still pick the same code. The unique constraint on the column
 * is what actually guarantees this, and it fails the second insert loudly. This
 * loop is here to make that essentially never happen, not to replace it.
 */

const MAX_ATTEMPTS = 5

export async function allocateCode(payload: Payload): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generateCode()

    const taken = await payload.find({
      collection: 'qr-codes',
      where: { code: { equals: code } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    if (taken.totalDocs === 0) return code
  }

  // Null rather than a throw: the two callers want different things. The listing
  // hook reports it and lets the save through, because a listing without a code
  // is recoverable. The admin field refuses, because a code without a code is not.
  return null
}
