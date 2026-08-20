import type { Instrumentation } from 'next'

/**
 * Every server-side error Next catches, routed to the error table.
 *
 * `onRequestError` fires for anything thrown while rendering a page or running a
 * route handler - the cases that end up as the `/[locale]/error.tsx` boundary or
 * a 500. Those were previously visible only as a `digest` in the platform logs,
 * which is an id with nothing attached to it.
 *
 * This is the catch-all. It does not replace the explicit `reportError` calls at
 * the places that swallow a failure on purpose: a confirmation email that did
 * not send never throws past its own `catch`, so nothing here would ever see it.
 * The two cover different halves.
 *
 * # The branch is load-bearing, not defensive
 *
 * This file is compiled for every runtime, edge included, and the real work
 * lives in `instrumentation-node.ts` behind a positive check on
 * `NEXT_RUNTIME`. That is the only shape webpack can eliminate, and eliminating
 * it is what stops the Postgres adapter being dragged into an edge bundle that
 * cannot resolve `node:crypto`. Written the obvious way instead, the module
 * failed to compile and nothing was reported at all - see the note in
 * instrumentation-node.ts.
 */

export function register() {
  // Nothing to do at startup. The export has to exist for Next to load this file.
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { reportRequestError } = await import('./instrumentation-node')
    await reportRequestError(error, request, context)
  }
}
