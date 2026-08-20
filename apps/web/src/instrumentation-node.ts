import type { Instrumentation } from 'next'
import { reportError } from './lib/report'

/**
 * The Node half of instrumentation, kept in its own file so that edge never
 * sees it.
 *
 * This exists because of a build failure rather than for tidiness, and the
 * failure was silent in the worst way. `instrumentation.ts` is compiled for
 * every runtime Next supports, edge included. The first version put the
 * reporting inline behind an early `return` when the runtime was not Node:
 *
 *     if (process.env.NEXT_RUNTIME !== 'nodejs') return
 *     const { reportError } = await import('./lib/report')
 *
 * That reads as lazy, and is not. Webpack still traces a dynamic import with a
 * static specifier, so the whole chain - report.ts, payload.config, the Postgres
 * adapter - was pulled into the edge bundle, where `node:crypto` cannot resolve.
 * The module failed to compile, `onRequestError` was therefore never registered,
 * and the only symptom was that nothing was ever reported. A monitoring system
 * that silently does not monitor.
 *
 * Moving the import inside a positive `process.env.NEXT_RUNTIME === 'nodejs'`
 * branch is what lets Next eliminate it: that value is substituted per bundle at
 * build time, so for edge the branch is dead code and the import goes with it.
 */
export const reportRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  await reportError(error, {
    source: `request.${context.routerKind === 'App Router' ? 'app' : 'pages'}`,
    path: request.path,
    extra: {
      method: request.method,
      // Which boundary the reader ended up seeing.
      routeType: context.routeType,
      routePath: context.routePath,
      // Next's own id for this failure, and the one thing already in the
      // platform logs - so a row here can be tied back to a log line.
      digest: (error as { digest?: string })?.digest,
    },
  })
}
