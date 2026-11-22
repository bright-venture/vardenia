import { passwordProblem } from '@vardenia/core'

/**
 * The password rule on Payload's built-in reset (20 November 2026).
 *
 * `/api/{customers,business-users,users}/reset-password` hashes the new
 * password without ever passing it to collection hooks, so hooks/
 * enforcePasswordRule cannot see it. In the audit this address accepted "abc".
 * Partners and the team reset through it, so it cannot simply be closed.
 *
 * Checked here before Payload sees the request, in Payload's own error shape so
 * the admin and partner reset pages show the message under the field.
 */

export const isResetPasswordRequest = (request: Request): boolean => {
  if (request.method !== 'POST') return false
  try {
    return new URL(request.url).pathname.endsWith('/reset-password')
  } catch {
    return false
  }
}

const passwordOf = (body: unknown): unknown => (body as { password?: unknown } | null)?.password

/**
 * The new password, whichever shape the body has.
 *
 * The partner page sends JSON. The admin's own reset page (/admin/reset) sends
 * a form, with the fields as JSON inside a `_payload` entry - Payload's Form
 * component does that for every submit, and Payload reads it back the same
 * way. Reading only JSON let the admin page set a 7-character password (QA
 * case R9, 22 November 2026).
 */
async function readPassword(request: Request): Promise<unknown> {
  const type = request.headers.get('content-type') ?? ''
  try {
    if (
      type.includes('multipart/form-data') ||
      type.includes('application/x-www-form-urlencoded')
    ) {
      const form = await request.formData()
      const wrapped = form.get('_payload')
      if (typeof wrapped === 'string') return passwordOf(JSON.parse(wrapped))
      return form.get('password') ?? undefined
    }
    return passwordOf(await request.json())
  } catch {
    return undefined
  }
}

type Handler = (request: Request, context: unknown) => Promise<Response>

export function passwordRuleOnReset<H extends Handler>(handler: H): H {
  return (async (request: Request, context: unknown) => {
    if (!isResetPasswordRequest(request)) return handler(request, context)

    // Read from a copy: Payload still needs the original body.
    const password = await readPassword(request.clone())

    // A missing password is Payload's to answer; a weak one is ours.
    if (typeof password === 'string' && password !== '') {
      const problem = passwordProblem(password)
      if (problem) {
        return Response.json(
          {
            errors: [
              {
                name: 'ValidationError',
                message: `Password ${problem}. Spaces alone do not count.`,
                data: {
                  errors: [
                    {
                      message: `Password ${problem}. Spaces alone do not count.`,
                      path: 'password',
                    },
                  ],
                },
              },
            ],
          },
          { status: 400 },
        )
      }
    }
    return handler(request, context)
  }) as H
}
