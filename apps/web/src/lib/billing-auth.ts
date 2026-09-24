import type { Payload } from 'payload'

/**
 * The two checks the billing routes share: the caller is staff, and a form post
 * came from this site. The page itself is an admin view, components/admin/
 * BillingView.
 */

export async function isStaffRequest(payload: Payload, headers: Headers): Promise<boolean> {
  const { user } = await payload.auth({ headers }).catch(() => ({ user: null }))
  const roles = ((user as { roles?: string[] } | null)?.roles ?? []) as string[]
  return (
    (user as { collection?: string } | null)?.collection === 'users' &&
    roles.some((role) => role === 'admin' || role === 'staff')
  )
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
