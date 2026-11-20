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

type Handler = (request: Request, context: unknown) => Promise<Response>

export function passwordRuleOnReset<H extends Handler>(handler: H): H {
  return (async (request: Request, context: unknown) => {
    if (!isResetPasswordRequest(request)) return handler(request, context)

    // Read from a copy: Payload still needs the original body.
    const password = await request
      .clone()
      .json()
      .then((body: unknown) => (body as { password?: unknown } | null)?.password)
      .catch(() => undefined)

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
