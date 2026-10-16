import type { Payload } from 'payload'
import { isStaffUser } from '../access/index'

/**
 * The checks the staff-only routes share: the caller is staff, and a form post
 * came from this site. Used by billing, the invoice, the reports and the QR
 * sheet and export, so "who is staff" is decided in one place: isStaffUser,
 * which also checks the account is a staff account and not merely one with a
 * `roles` field.
 */

type AuthUser = Awaited<ReturnType<Payload['auth']>>['user']

/** The signed-in staff member, or null for anybody else. */
export async function staffUser(payload: Payload, headers: Headers): Promise<AuthUser | null> {
  const { user } = await payload.auth({ headers }).catch(() => ({ user: null }))
  return isStaffUser(user) ? user : null
}

export async function isStaffRequest(payload: Payload, headers: Headers): Promise<boolean> {
  return (await staffUser(payload, headers)) !== null
}

/**
 * Same-origin check for the two staff form posts.
 *
 * The session cookie is SameSite, which already keeps a cross-site form from
 * carrying it. This is the second lock: a POST whose Origin is another site is
 * refused before anything is read from it.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}
