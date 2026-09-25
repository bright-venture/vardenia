import type { AdminViewServerProps } from 'payload'
import Link from 'next/link'
import { Gutter } from '@payloadcms/ui'
import {
  SCAN_WINDOW_DAYS,
  adminHome,
  type AttentionArea,
  type AttentionItem,
} from '../../lib/admin-home'

/**
 * The admin home page.
 *
 * Payload's own home is a grid of every collection, sixteen cards with the
 * same weight, which answers "what exists" - a question nobody arrives with
 * after the second day. This one answers the three that people do:
 *
 * 1. What needs me today? A to-do list, grouped by area, each item saying what
 *    to do. First, because it is the reason to open the admin at all.
 * 2. How are we doing? Four numbers.
 * 3. Where do I go? The everyday jobs as buttons, and every part of the admin
 *    grouped the way the menu is, with one line on what each is for.
 *
 * Every colour is a Payload theme variable, so it follows the admin into dark
 * mode.
 */

const AREA_ORDER: AttentionArea[] = ['Site setup', 'Booking fees', 'Listings', 'Reviews']

const dollars = (amount: number) =>
  `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

interface Destination {
  label: string
  href: string
  hint: string
  /** A file or a printable page outside the admin, opened in a new tab. */
  external?: boolean
}

/** The jobs somebody does every week, one click away. */
const SHORTCUTS: Destination[] = [
  {
    label: 'Add a listing',
    href: '/admin/collections/businesses/create',
    hint: 'A new place in the directory',
  },
  {
    label: 'Import listings',
    href: '/admin/import-listings',
    hint: 'Many at once, from a spreadsheet',
  },
  { label: 'Booking fees', href: '/admin/billing', hint: 'Draw up and send monthly statements' },
  {
    label: 'QR code sheet',
    href: '/qr/sheet',
    hint: 'Every active code, ready to print',
    external: true,
  },
]

/** Every part of the admin, in the same groups as the menu. */
const AREAS: { title: string; items: Destination[] }[] = [
  {
    title: 'Directory',
    items: [
      {
        label: 'Listings',
        href: '/admin/collections/businesses',
        hint: 'Every place: details, tier, fees',
      },
      {
        label: 'QR codes',
        href: '/admin/collections/qr-codes',
        hint: 'Printed codes and where they point',
      },
      { label: 'Reviews', href: '/admin/collections/reviews', hint: 'Approve what guests wrote' },
    ],
  },
  {
    title: 'Bookings',
    items: [
      {
        label: 'Bookings',
        href: '/admin/collections/bookings',
        hint: 'Every request and its status',
      },
      {
        label: 'Fee statements',
        href: '/admin/collections/statements',
        hint: 'Monthly invoices to venues',
      },
      { label: 'Closed dates', href: '/admin/collections/closures', hint: 'When venues are shut' },
    ],
  },
  {
    title: 'Magazine',
    items: [
      { label: 'Articles', href: '/admin/collections/articles', hint: 'Stories on the site' },
      { label: 'Issues', href: '/admin/collections/issues', hint: 'Printed editions' },
      { label: 'Media', href: '/admin/collections/media', hint: 'Photos and files' },
    ],
  },
  {
    title: 'People',
    items: [
      {
        label: 'Partner accounts',
        href: '/admin/collections/business-users',
        hint: 'Venues who sign in',
      },
      { label: 'Guest accounts', href: '/admin/collections/customers', hint: 'People who book' },
      { label: 'Team', href: '/admin/collections/users', hint: 'Vardenia staff' },
    ],
  },
  {
    title: 'Reports',
    items: [
      {
        label: 'Listing gaps',
        href: '/reports/listings',
        hint: 'What each listing is missing (CSV)',
        external: true,
      },
      {
        label: 'Scan report',
        href: '/reports/scans',
        hint: 'QR scans, last 90 days (CSV)',
        external: true,
      },
      { label: 'QR scans', href: '/admin/collections/scan-events', hint: 'Every scan, one by one' },
      {
        label: 'Errors',
        href: '/admin/collections/error-events',
        hint: 'What went wrong on the site',
      },
    ],
  },
]

/**
 * No DefaultTemplate here, unlike the Booking fees view. Payload already wraps
 * the dashboard in the admin menu and header; wrapping it again drew both twice.
 */
export async function AdminHome({ initPageResult }: AdminViewServerProps) {
  const { req } = initPageResult

  const home = req.user ? await adminHome(req.payload, req.user) : null
  const name = String((req.user as { name?: unknown } | null)?.name ?? '').split(' ')[0]
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Beirut',
  })

  const byArea = AREA_ORDER.map((area) => ({
    area,
    items: (home?.attention ?? []).filter((item) => item.area === area),
  })).filter((group) => group.items.length > 0)

  // Notes (tone `info`) are listed but not counted: they ask nothing of anyone.
  const tasks = (home?.attention ?? []).filter((item) => item.tone !== 'info').length

  return (
    <Gutter>
      <div style={styles.page}>
        <header>
          <p style={styles.eyebrow}>{today}</p>
          <h1 style={styles.title}>{name ? `Hello, ${name}` : 'Vardenia'}</h1>
        </header>

        {home ? (
          <section style={styles.numbers} aria-label="Numbers">
            <NumberCard
              value={home.numbers.listingsLive.toLocaleString('en')}
              label="Listings live"
              note={
                home.numbers.listingDrafts > 0 ? `${home.numbers.listingDrafts} drafts` : undefined
              }
            />
            <NumberCard
              value={home.numbers.bookingsThisMonth.toLocaleString('en')}
              label="Bookings this month"
            />
            <NumberCard
              value={home.numbers.scans.toLocaleString('en')}
              label={`QR scans, ${SCAN_WINDOW_DAYS} days`}
            />
            <NumberCard
              value={dollars(home.numbers.feesOwed)}
              label="Booking fees awaiting payment"
            />
          </section>
        ) : null}

        <section style={styles.card}>
          <h2 style={styles.heading}>
            To do {tasks > 0 ? <span style={styles.count}>{tasks}</span> : null}
          </h2>
          {tasks === 0 ? <p style={styles.allClear}>Nothing needs you right now.</p> : null}
          {byArea.map((group) => (
            <div key={group.area} style={styles.group}>
              <h3 style={styles.groupTitle}>{group.area}</h3>
              <ul style={styles.list}>
                {group.items.map((item) => (
                  <Task key={`${item.title}-${item.detail}`} item={item} />
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section>
          <h2 style={styles.heading}>Shortcuts</h2>
          <div style={styles.shortcuts}>
            {SHORTCUTS.map((shortcut) => (
              <Go key={shortcut.href} destination={shortcut} style={styles.shortcut}>
                <span style={styles.shortcutLabel}>{shortcut.label}</span>
                <span style={styles.hint}>{shortcut.hint}</span>
              </Go>
            ))}
          </div>
        </section>

        <section>
          <h2 style={styles.heading}>Everything else</h2>
          <div style={styles.areas}>
            {AREAS.map((area) => (
              <div key={area.title} style={styles.card}>
                <h3 style={styles.areaTitle}>{area.title}</h3>
                <ul style={styles.areaList}>
                  {area.items.map((item) => (
                    <li key={item.href}>
                      <Go destination={item} style={styles.areaLink}>
                        {item.label}
                      </Go>
                      <span style={styles.hint}>{item.hint}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Gutter>
  )
}

function NumberCard({ value, label, note }: { value: string; label: string; note?: string }) {
  return (
    <div style={styles.card}>
      <div style={styles.value}>{value}</div>
      <div style={styles.label}>{label}</div>
      {note ? <div style={styles.hint}>{note}</div> : null}
    </div>
  )
}

function Task({ item }: { item: AttentionItem }) {
  const color =
    item.tone === 'error'
      ? 'var(--theme-error-500)'
      : item.tone === 'warn'
        ? 'var(--theme-warning-500)'
        : 'var(--theme-elevation-300)'
  return (
    <li style={styles.task}>
      <span style={{ ...styles.dot, background: color }} aria-hidden />
      <div style={{ minWidth: 0 }}>
        <div style={styles.taskTitle}>
          {item.href ? (
            <Link href={item.href} style={styles.taskLink}>
              {item.title}
            </Link>
          ) : (
            item.title
          )}
        </div>
        <div style={styles.hint}>{item.detail}</div>
      </div>
    </li>
  )
}

function Go({
  destination,
  style,
  children,
}: {
  destination: Destination
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  return destination.external ? (
    <a href={destination.href} target="_blank" rel="noopener noreferrer" style={style}>
      {children}
    </a>
  ) : (
    <Link href={destination.href} style={style}>
      {children}
    </Link>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(var(--base) * 2)',
    padding: 'calc(var(--base) * 2) 0 calc(var(--base) * 4)',
    maxWidth: '1100px',
  },
  eyebrow: {
    margin: 0,
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--theme-elevation-500)',
  },
  title: { margin: '0.25rem 0 0', fontSize: '2rem', fontWeight: 600 },
  numbers: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
    gap: 'var(--base)',
  },
  card: {
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: '8px',
    padding: 'var(--base)',
    background: 'var(--theme-elevation-0)',
  },
  value: {
    fontSize: '1.9rem',
    lineHeight: 1.1,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--theme-elevation-900)',
  },
  label: { marginTop: '0.35rem', fontSize: '0.85rem', color: 'var(--theme-elevation-700)' },
  heading: {
    margin: '0 0 calc(var(--base) * 0.75)',
    fontSize: '0.8rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--theme-elevation-600)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    lineHeight: 1.4,
  },
  count: {
    display: 'inline-block',
    lineHeight: 1.5,
    fontSize: '0.75rem',
    padding: '0.05rem 0.5rem',
    borderRadius: '999px',
    background: 'var(--theme-elevation-100)',
    color: 'var(--theme-elevation-800)',
    letterSpacing: 0,
  },
  allClear: { margin: 0, color: 'var(--theme-elevation-600)' },
  group: { marginTop: 'calc(var(--base) * 0.75)' },
  groupTitle: {
    margin: '0 0 0.4rem',
    fontSize: '0.95rem',
    fontWeight: 600,
    color: 'var(--theme-elevation-800)',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
  },
  task: { display: 'flex', gap: '0.6rem', alignItems: 'flex-start' },
  dot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, marginTop: '0.45rem' },
  taskTitle: { fontWeight: 500, color: 'var(--theme-elevation-900)' },
  taskLink: {
    color: 'var(--theme-elevation-900)',
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
  },
  hint: {
    display: 'block',
    fontSize: '0.8125rem',
    color: 'var(--theme-elevation-600)',
    marginTop: '0.1rem',
  },
  shortcuts: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
    gap: 'var(--base)',
  },
  shortcut: {
    display: 'block',
    border: '1px solid var(--theme-elevation-200)',
    borderRadius: '8px',
    padding: 'var(--base)',
    textDecoration: 'none',
    color: 'inherit',
    background: 'var(--theme-elevation-50)',
  },
  shortcutLabel: { display: 'block', fontWeight: 600, color: 'var(--theme-elevation-900)' },
  areas: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 'var(--base)',
  },
  areaTitle: { margin: '0 0 0.6rem', fontSize: '1rem', fontWeight: 600 },
  areaList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.55rem',
  },
  areaLink: { fontWeight: 500, color: 'var(--theme-elevation-900)' },
}

export default AdminHome
