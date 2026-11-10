import { z } from 'zod'

/**
 * Zod, set up once for every schema in this package. Import `z` from here,
 * never from 'zod' directly.
 *
 * `jitless` stops Zod testing whether it may build code at runtime. To find
 * out, it calls `Function("")` the first time a schema is parsed, and the
 * site's security policy forbids that (no 'unsafe-eval'), so every page that
 * validated a form logged a Content-Security-Policy violation, which Chrome
 * and Lighthouse report as an issue (found 10 November 2026). The compiled
 * fast path it would have used is never allowed here anyway, so nothing is
 * lost: the forms validate exactly as before.
 *
 * The setting is global to Zod, so it also covers any other code in the same
 * bundle that imports Zod after this module has run.
 */
z.config({ jitless: true })

export { z }
