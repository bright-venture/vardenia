/**
 * What a page looks like while the server is still rendering it.
 *
 * # The problem this solves
 *
 * Eight routes read `searchParams` - the directory, the seven sections, search,
 * the article list, the account and partner pages. Reading the query string
 * makes a route dynamic, and Next cannot prefetch a dynamic route's output. With
 * no loading boundary it also has nothing to show while it waits, so a click
 * leaves the reader on the old page, with no spinner and no change, until the
 * server replies. Measured against production that is around 450ms of a page
 * that appears to have ignored the click.
 *
 * A `loading.tsx` changes what Next does on both ends: it prefetches this
 * skeleton with the route, and paints it the instant a link is clicked. The
 * server render then streams in behind it. The total time is the same; the
 * difference is whether anything happens when you press the thing.
 *
 * # Why the shapes are approximate
 *
 * Close enough that the page does not jump when the real content lands, not so
 * close that it looks like content and gets read. `aria-hidden` and
 * `aria-busy` on the wrapper, because a screen reader should be told the page is
 * loading rather than have a description of grey rectangles.
 */

function Bar({ className }: { className: string }) {
  return <div className={`bg-surface-sunken rounded ${className}`} />
}

/** The heading block every page opens with. */
function Header({ wide }: { wide?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <Bar className="h-3 w-28" />
      <Bar className={wide ? 'h-10 w-72' : 'h-9 w-56'} />
    </div>
  )
}

/** A grid of listing or article cards. */
function CardGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-3">
          <Bar className="aspect-[4/3] w-full" />
          <Bar className="h-4 w-3/4" />
          <Bar className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}

/** Rows of filter chips, as the directory and the sections show. */
function ChipRows({ rows = 2 }: { rows?: number }) {
  const widths = ['w-16', 'w-24', 'w-20', 'w-28', 'w-20', 'w-24']
  return (
    <div className="mt-8 flex flex-col gap-3">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex flex-wrap gap-2">
          {widths.map((w, i) => (
            <Bar key={i} className={`h-9 rounded-full ${w}`} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** The browse pages: a heading, filters, and a grid. */
export function ListingsSkeleton({ filters = 2 }: { filters?: number }) {
  return (
    <main aria-hidden aria-busy className="mx-auto max-w-6xl animate-pulse px-6 py-16">
      <Header wide />
      <Bar className="mt-4 h-3 w-20" />
      <ChipRows rows={filters} />
      <CardGrid />
    </main>
  )
}

/** Search: a heading, the box, and nothing else until a query runs. */
export function SearchSkeleton() {
  return (
    <main aria-hidden aria-busy className="mx-auto max-w-6xl animate-pulse px-6 py-16">
      <Header />
      <Bar className="mt-6 h-11 w-full max-w-xl rounded-md" />
      <CardGrid count={3} />
    </main>
  )
}

/** The account and partner pages: a heading and a stack of booking cards. */
export function RecordsSkeleton() {
  return (
    <main aria-hidden aria-busy className="mx-auto max-w-3xl animate-pulse px-6 py-16">
      <Header />
      <div className="mt-12 flex flex-col gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="border-ink-100 flex flex-col gap-3 rounded-lg border p-5">
            <Bar className="h-4 w-40" />
            <Bar className="h-3 w-56" />
            <Bar className="h-3 w-32" />
          </div>
        ))}
      </div>
    </main>
  )
}
