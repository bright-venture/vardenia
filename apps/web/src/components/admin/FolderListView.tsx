import type { ListViewServerProps } from 'payload'
import Link from 'next/link'
import { DefaultListView, Gutter } from '@payloadcms/ui'
import { findEvery } from '../../lib/find-every'

/**
 * A folder per listing, in front of the lists staff get lost in.
 *
 * Reviews, bookings, fee statements, closed dates and QR codes all belong to a
 * listing, and as one long list they read as a pile. This view opens on one
 * folder per listing - its name, how many it holds, and the latest date - and
 * a folder opens Payload's own list, filtered to that listing, with a way back.
 *
 * It replaces the collection's list view, and hands back to the stock list as
 * soon as the address asks for anything more specific than "everything":
 *
 * - a filter or a search  the list, as normal (opening a folder is a filter)
 * - `?view=all`           the list, unfiltered, for somebody who wants it
 * - nothing               the folders
 *
 * So paging, sorting and every filter keep working exactly as before inside a
 * folder, because that part is still Payload's list.
 */

/** Props that exist only on the server and must not reach the client list. */
const SERVER_ONLY = new Set([
  'payload',
  'i18n',
  'locale',
  'params',
  'permissions',
  'searchParams',
  'user',
  'visibleEntities',
  'collectionConfig',
  'data',
  'limit',
  'listSearchableFields',
  'importMap',
  'clientConfig',
  'viewActions',
  'documentSubViewType',
  'id',
])

/** What each collection's folders are called, and what one item is. */
const NOUNS: Record<string, { title: string; one: string; many: string }> = {
  reviews: { title: 'Reviews', one: 'review', many: 'reviews' },
  bookings: { title: 'Bookings', one: 'booking', many: 'bookings' },
  statements: { title: 'Fee statements', one: 'statement', many: 'statements' },
  closures: { title: 'Closed dates', one: 'closure', many: 'closures' },
  'qr-codes': { title: 'QR codes', one: 'code', many: 'codes' },
}

type Params = Record<string, string | string[] | undefined>

/** The listing id a folder was opened with, whichever way the filter was written. */
function folderId(params: Params): string | null {
  const direct = params['where[business][equals]']
  if (typeof direct === 'string') return direct
  for (const [key, value] of Object.entries(params)) {
    if (/\[business\]\[equals\]$/.test(key) && typeof value === 'string') return value
  }
  // Already parsed into an object, when it arrives that way.
  const nested = (params as { where?: { business?: { equals?: unknown } } }).where?.business?.equals
  return typeof nested === 'string' || typeof nested === 'number' ? String(nested) : null
}

/** Anything more specific than "everything" hands over to Payload's list. */
function wantsList(params: Params): boolean {
  if (params.view === 'all') return true
  return Object.keys(params).some(
    (key) => key.startsWith('where') || key === 'search' || key === 'groupBy',
  )
}

interface Row {
  business?: number | { id: number } | null
  createdAt?: string
}

interface Folder {
  id: number | null
  name: string
  count: number
  latest: string | null
}

const day = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : ''

export async function FolderListView(props: ListViewServerProps) {
  const { collectionSlug, payload, user } = props
  const params = (props.searchParams ?? {}) as Params
  const noun = NOUNS[collectionSlug] ?? { title: collectionSlug, one: 'item', many: 'items' }
  const base = `/admin/collections/${collectionSlug}`

  // Inside a folder, or asked for the plain list: Payload's own list view, with
  // a line above it naming the folder and leading back to all of them.
  if (wantsList(params)) {
    const clientProps = Object.fromEntries(
      Object.entries(props).filter(([key]) => !SERVER_ONLY.has(key)),
    ) as React.ComponentProps<typeof DefaultListView>

    const id = folderId(params)
    const listing =
      id !== null
        ? ((await payload
            .findByID({
              collection: 'businesses',
              id: Number(id),
              depth: 0,
              draft: true,
              overrideAccess: false,
              user,
              select: { name: true },
            })
            .catch(() => null)) as { name?: string | null } | null)
        : null

    return (
      <>
        <Gutter>
          <nav style={styles.crumbs} aria-label="Folders">
            <Link href={base} style={styles.crumbLink}>
              All {noun.title.toLowerCase()} folders
            </Link>
            {listing?.name ? (
              <>
                <span aria-hidden>/</span>
                <span style={styles.crumbHere}>{listing.name}</span>
              </>
            ) : null}
          </nav>
        </Gutter>
        <DefaultListView {...clientProps} />
      </>
    )
  }

  // The folders: every listing that has at least one, most recent first.
  const rows = await findEvery<Row>(payload, {
    collection: collectionSlug as 'reviews',
    depth: 0,
    overrideAccess: false,
    user,
    select: { business: true, createdAt: true } as never,
  })

  const byListing = new Map<number | null, { count: number; latest: string | null }>()
  for (const row of rows.docs) {
    const id =
      typeof row.business === 'object' && row.business ? row.business.id : (row.business ?? null)
    const entry = byListing.get(id) ?? { count: 0, latest: null }
    entry.count += 1
    if (row.createdAt && (!entry.latest || row.createdAt > entry.latest))
      entry.latest = row.createdAt
    byListing.set(id, entry)
  }

  const ids = [...byListing.keys()].filter((id): id is number => id !== null)
  const names = new Map<number, string>()
  if (ids.length > 0) {
    const found = await findEvery<{ id: number; name?: string | null }>(payload, {
      collection: 'businesses',
      where: { id: { in: ids } },
      depth: 0,
      draft: true,
      overrideAccess: false,
      user,
      select: { name: true },
    })
    for (const doc of found.docs) names.set(doc.id, doc.name ?? `Listing ${doc.id}`)
  }

  const query = typeof params.q === 'string' ? params.q.trim().toLowerCase() : ''
  const folders: Folder[] = [...byListing.entries()]
    .map(([id, entry]) => ({
      id,
      name: id === null ? 'Not linked to a listing' : (names.get(id) ?? `Listing ${id}`),
      ...entry,
    }))
    .filter((folder) => !query || folder.name.toLowerCase().includes(query))
    .sort((a, b) => (b.latest ?? '').localeCompare(a.latest ?? ''))

  const total = rows.docs.length

  return (
    <Gutter>
      <div style={styles.page}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>{noun.title}</h1>
            <p style={styles.muted}>
              {total} {total === 1 ? noun.one : noun.many} in {byListing.size}{' '}
              {byListing.size === 1 ? 'folder' : 'folders'}, one per listing. Most recent first.
            </p>
          </div>
          <div style={styles.actions}>
            <form method="get" action={base} style={styles.search}>
              <input
                name="q"
                defaultValue={query}
                placeholder="Find a listing"
                aria-label="Find a listing"
                style={styles.input}
              />
            </form>
            <Link href={`${base}?view=all`} style={styles.button}>
              Show all as one list
            </Link>
            <Link href={`${base}/create`} style={styles.buttonPrimary}>
              Create new
            </Link>
          </div>
        </header>

        {rows.complete ? null : (
          <p style={styles.note}>
            There are more than the folders can count at once. Use Show all as one list to see
            everything.
          </p>
        )}

        {folders.length === 0 ? (
          <p style={styles.muted}>
            {query ? `No listing matches "${query}".` : `No ${noun.many} yet.`}
          </p>
        ) : (
          <div style={styles.grid}>
            {folders.map((folder) => (
              <Link
                key={String(folder.id)}
                href={
                  folder.id === null
                    ? `${base}?where[business][exists]=false`
                    : `${base}?where[business][equals]=${folder.id}`
                }
                style={styles.folder}
              >
                <FolderIcon />
                <span style={styles.folderName}>{folder.name}</span>
                <span style={styles.muted}>
                  {folder.count} {folder.count === 1 ? noun.one : noun.many}
                  {folder.latest ? ` · latest ${day(folder.latest)}` : ''}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Gutter>
  )
}

function FolderIcon() {
  return (
    <svg width="28" height="22" viewBox="0 0 28 22" aria-hidden style={{ marginBottom: '0.4rem' }}>
      <path
        d="M2 4a2 2 0 0 1 2-2h6l2.5 3H24a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4z"
        fill="var(--theme-elevation-100)"
        stroke="var(--theme-elevation-400)"
        strokeWidth="1.5"
      />
    </svg>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(var(--base) * 1.5)',
    padding: 'calc(var(--base) * 2) 0 calc(var(--base) * 3)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 'var(--base)',
    flexWrap: 'wrap',
  },
  title: { margin: 0, fontSize: '2rem', fontWeight: 600 },
  muted: { margin: 0, fontSize: '0.8125rem', color: 'var(--theme-elevation-600)' },
  note: {
    margin: 0,
    padding: '0.6rem 0.9rem',
    borderLeft: '3px solid var(--theme-warning-500)',
    background: 'var(--theme-elevation-50)',
  },
  actions: { display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' },
  search: { margin: 0 },
  input: {
    padding: '0.5rem 0.7rem',
    border: '1px solid var(--theme-elevation-250)',
    borderRadius: '4px',
    background: 'var(--theme-input-bg)',
    color: 'var(--theme-elevation-900)',
    width: '14rem',
  },
  button: {
    padding: '0.5rem 0.9rem',
    border: '1px solid var(--theme-elevation-300)',
    borderRadius: '4px',
    color: 'var(--theme-elevation-900)',
    textDecoration: 'none',
  },
  buttonPrimary: {
    padding: '0.5rem 0.9rem',
    border: '1px solid var(--theme-elevation-900)',
    background: 'var(--theme-elevation-900)',
    color: 'var(--theme-elevation-0)',
    borderRadius: '4px',
    textDecoration: 'none',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 'var(--base)',
  },
  folder: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem',
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: '8px',
    padding: 'var(--base)',
    textDecoration: 'none',
    color: 'inherit',
    background: 'var(--theme-elevation-0)',
  },
  folderName: { fontWeight: 600, color: 'var(--theme-elevation-900)' },
  crumbs: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
    paddingTop: 'var(--base)',
    fontSize: '0.875rem',
    color: 'var(--theme-elevation-600)',
  },
  crumbLink: { color: 'var(--theme-elevation-800)', textDecoration: 'underline' },
  crumbHere: { color: 'var(--theme-elevation-900)', fontWeight: 600 },
}

export default FolderListView
