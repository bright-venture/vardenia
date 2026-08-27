import { colors } from '@vardenia/tokens'

/**
 * The 404 page, served with a 404 status, for paths the middleware rejects.
 *
 * # Why this exists rather than a status on the rewrite
 *
 * The middleware used to answer an unknown path with
 * `NextResponse.rewrite(url, { status: 404 })`. That works on a local
 * production build and does not work on Netlify: its Next runtime performs the
 * rewrite and drops the status, so every invented URL came back 200 in
 * production while returning 404 on the machine it was tested on.
 *
 * Measured on both, the same five paths:
 *
 *                                 local   netlify
 *     /magazine/no-such-article    404     404
 *     /stay/nothing-here           404     404
 *     /nonsense                    404     200   <- the rewrite status
 *
 * The two that agree are ordinary pages calling `notFound()`. So a status that
 * comes from the origin survives Netlify perfectly well, and only a status
 * invented by middleware is lost. This is the origin.
 *
 * # Why the markup is here rather than shared with not-found.tsx
 *
 * `app/not-found.tsx` is a React server component that supplies its own
 * document shell, because the route groups mean there is no root layout. It
 * cannot be rendered from a route handler without pulling in the app router's
 * own rendering, so this writes the same document as a string.
 *
 * They are two copies of one page, which is a real cost. not-found-404.test.ts
 * asserts the things a reader and a crawler actually depend on are present in
 * both, so the copies cannot drift silently into saying different things.
 */

export const dynamic = 'force-dynamic'

const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Both languages, not one guessed.
 *
 * The URL that reached here may never have resolved to a locale, so there is
 * nothing to read a preference from. Printing both is shorter than being wrong.
 */
const COPY = {
  en: { title: 'Page not found', body: 'That page does not exist.', home: 'Go to the homepage' },
  ar: {
    title: 'الصفحة غير موجودة',
    body: 'هذه الصفحة غير موجودة.',
    home: 'العودة إلى الصفحة الرئيسية',
  },
} as const

function page(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(COPY.en.title)} - Vardenia</title>
<meta name="robots" content="noindex">
<style>
  body {
    margin: 0; min-height: 100vh; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 1rem; padding: 2rem;
    font-family: ui-sans-serif, system-ui, sans-serif; text-align: center;
    background: ${colors.surface.raised}; color: ${colors.ink[900]};
  }
  h1 { font-size: 1.5rem; margin: 0; font-weight: 600; }
  p { margin: 0; opacity: 0.75; }
  a { color: inherit; }
  .ar { direction: rtl; }
  hr { width: 3rem; border: 0; border-top: 1px solid currentColor; opacity: 0.2; margin: 1rem 0; }
</style>
</head>
<body>
  <h1>${escape(COPY.en.title)}</h1>
  <p>${escape(COPY.en.body)}</p>
  <p><a href="/">${escape(COPY.en.home)}</a></p>
  <hr>
  <div class="ar" lang="ar">
    <h1>${escape(COPY.ar.title)}</h1>
    <p>${escape(COPY.ar.body)}</p>
    <p><a href="/">${escape(COPY.ar.home)}</a></p>
  </div>
</body>
</html>`
}

export function GET(): Response {
  return new Response(page(), {
    status: 404,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Never cached as a real page: the path that reached here is arbitrary.
      'cache-control': 'no-store',
    },
  })
}
