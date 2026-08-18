import type { Payload, TypedUser } from 'payload'
import { tierOf } from '@vardenia/core'
import { dashboardCounts } from '../../lib/dashboard-stats'
import { indexingWarning } from '../../lib/indexing'

/**
 * The panel above Payload's collection cards on the admin dashboard.
 *
 * The stock dashboard lists which collections exist, which everyone already
 * knows by the second day. It answers no question anyone actually arrives with:
 * how many listings are live, is anything expiring, did last month's scans move.
 *
 * Everything here is chosen because somebody has to act on it. The counts frame
 * the week; "needs attention" is a work queue. Nothing decorative - if a section
 * has nothing in it, it does not render at all, so an empty panel means there is
 * genuinely nothing to do.
 *
 * Queries run with `overrideAccess: false` and the signed-in user, so the same
 * field rules apply here as anywhere else. Contract dates reach this panel
 * because the reader is staff, not because the dashboard is special.
 */

const DAY = 86_400_000

/** Contracts inside this window are worth chasing now. */
const EXPIRING_SOON_DAYS = 30

/** How far back the headline scan figure looks. */
const SCAN_WINDOW_DAYS = 30

interface Props {
  payload: Payload
  user?: TypedUser | null
}

interface Attention {
  label: string
  /**
   * Optional, because not everything needing attention is a document.
   *
   * Every entry used to be a listing, so a link was always the right thing.
   * Configuration problems have no page to open - they are fixed in the hosting
   * dashboard - and inventing a destination would be worse than not linking.
   */
  href?: string
  detail: string
  tone: 'warn' | 'error'
}

export async function DashboardOverview({ payload, user }: Props) {
  if (!user) return null

  const now = new Date()
  const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * DAY)
  const windowStart = new Date(now.getTime() - SCAN_WINDOW_DAYS * DAY)

  const opts = { depth: 0, limit: 1, overrideAccess: false, user } as const

  /**
   * Counts in one query, lists in three.
   *
   * Six separate `payload.count()` calls held six of the pool's ten connections
   * for the length of the render; with the three lookups below that was nine.
   * Two staff on the dashboard at once could leave nothing for the public site.
   * See lib/dashboard-stats.ts for why the counts may use raw SQL and the lists
   * may not.
   */
  const [counts, expired, expiring, codeless] = await Promise.all([
    dashboardCounts(payload, windowStart),

    // Lapsed, but still carrying a paid tier. Nothing expires on its own (see
    // packages/core/src/tiers.ts), so this is the only thing that notices.
    payload.find({
      ...opts,
      collection: 'businesses',
      limit: 5,
      where: { contractEndsAt: { less_than: now.toISOString() } },
      sort: 'contractEndsAt',
    }),
    payload.find({
      ...opts,
      collection: 'businesses',
      limit: 5,
      where: {
        and: [
          { contractEndsAt: { greater_than_equal: now.toISOString() } },
          { contractEndsAt: { less_than: soon.toISOString() } },
        ],
      },
      sort: 'contractEndsAt',
    }),

    // A published listing with no code cannot go in the magazine. The hook
    // mints one automatically, so anything here means the hook failed.
    payload.find({
      ...opts,
      collection: 'businesses',
      limit: 5,
      where: { and: [{ qrCode: { exists: false } }, { _status: { equals: 'published' } }] },
    }),
  ])

  const attention: Attention[] = []

  /**
   * First, because it affects the whole site rather than one listing.
   *
   * The indexing switch fails closed, which is right for launch but has an
   * invisible failure mode: forget to turn it on and Vardenia simply never
   * appears in search, with no error anywhere. This is the place that failure
   * becomes visible, since the dashboard is opened far more often than the
   * hosting configuration is read.
   */
  const indexing = indexingWarning()
  if (indexing) {
    attention.push({
      label: 'Not indexed by search engines',
      detail: indexing,
      tone: 'warn',
    })
  }

  for (const doc of expired.docs) {
    const record = doc as { id: number | string; name?: string | null; contractEndsAt?: string }
    if (tierOf((doc as { tier?: unknown }).tier) === 'free') continue
    attention.push({
      label: record.name ?? `Listing ${record.id}`,
      href: `/admin/collections/businesses/${record.id}`,
      detail: `Contract ended ${formatDate(record.contractEndsAt)} and the tier has not changed`,
      tone: 'error',
    })
  }

  for (const doc of expiring.docs) {
    const record = doc as { id: number | string; name?: string | null; contractEndsAt?: string }
    attention.push({
      label: record.name ?? `Listing ${record.id}`,
      href: `/admin/collections/businesses/${record.id}`,
      detail: `Contract ends ${formatDate(record.contractEndsAt)}`,
      tone: 'warn',
    })
  }

  for (const doc of codeless.docs) {
    const record = doc as { id: number | string; name?: string | null }
    attention.push({
      label: record.name ?? `Listing ${record.id}`,
      href: `/admin/collections/businesses/${record.id}`,
      detail: 'Published with no QR code, so it cannot go to print',
      tone: 'error',
    })
  }

  return (
    <section style={styles.wrap}>
      <div style={styles.stats}>
        <Stat
          label="Listings live"
          value={counts.publishedListings}
          note={draftNote(counts.draftListings)}
        />
        <Stat label={`Scans, ${SCAN_WINDOW_DAYS} days`} value={counts.recentScans} />
        <Stat label="Articles live" value={counts.publishedArticles} />
        <Stat label="Issues" value={counts.issues} />
        <Stat label="Codes in circulation" value={counts.activeCodes} />
      </div>

      {attention.length > 0 ? (
        <div style={styles.panel}>
          <h2 style={styles.heading}>Needs attention</h2>
          <ul style={styles.list}>
            {attention.map((item) => (
              <li key={`${item.label}-${item.detail}`} style={styles.row}>
                <span style={{ ...styles.dot, background: toneColor(item.tone) }} aria-hidden />
                {item.href ? (
                  <a href={item.href} style={styles.rowLink}>
                    {item.label}
                  </a>
                ) : (
                  <span style={styles.rowLink}>{item.label}</span>
                )}
                <span style={styles.rowDetail}>{item.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div style={styles.actions}>
        <a href="/reports/scans" target="_blank" rel="noopener noreferrer" style={styles.action}>
          Scan report (CSV)
        </a>
        <a href="/qr/sheet" target="_blank" rel="noopener noreferrer" style={styles.action}>
          QR code sheet
        </a>
      </div>
    </section>
  )
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statValue}>{value.toLocaleString('en')}</div>
      <div style={styles.statLabel}>{label}</div>
      {note ? <div style={styles.statNote}>{note}</div> : null}
    </div>
  )
}

const draftNote = (count: number) =>
  count > 0 ? `${count} draft${count === 1 ? '' : 's'}` : undefined

/** Dates only. A contract does not end at a time of day. */
function formatDate(value?: string | null): string {
  if (!value) return 'an unknown date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'an unknown date'
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const toneColor = (tone: Attention['tone']) =>
  tone === 'error' ? 'var(--theme-error-500)' : 'var(--theme-warning-500)'

/**
 * Inline styles, and every colour is a Payload theme variable.
 *
 * A stylesheet would need importing into the admin bundle, which is more moving
 * parts than this earns. The variables matter more than the technique: hardcode
 * a hex here and the panel looks broken the moment somebody switches the admin
 * to dark mode.
 */
const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(var(--base) * 1.5)',
    marginBottom: 'calc(var(--base) * 2)',
  },
  stats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 'var(--base)',
  },
  stat: {
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: '4px',
    padding: 'calc(var(--base) * 0.75)',
    background: 'var(--theme-elevation-0)',
  },
  statValue: {
    fontSize: '1.75rem',
    lineHeight: 1.1,
    fontWeight: 600,
    color: 'var(--theme-elevation-900)',
    fontVariantNumeric: 'tabular-nums',
  },
  statLabel: {
    marginTop: '0.35rem',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--theme-elevation-600)',
  },
  statNote: {
    marginTop: '0.2rem',
    fontSize: '0.75rem',
    color: 'var(--theme-elevation-500)',
  },
  panel: {
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: '4px',
    padding: 'calc(var(--base) * 0.75)',
    background: 'var(--theme-elevation-0)',
  },
  heading: {
    margin: 0,
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--theme-elevation-600)',
  },
  list: {
    listStyle: 'none',
    margin: 'calc(var(--base) * 0.5) 0 0',
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  row: { display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' },
  dot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    flexShrink: 0,
    transform: 'translateY(-1px)',
  },
  rowLink: { color: 'var(--theme-elevation-900)', fontWeight: 500 },
  rowDetail: { color: 'var(--theme-elevation-600)', fontSize: '0.8125rem' },
  actions: { display: 'flex', gap: 'var(--base)', flexWrap: 'wrap' },
  action: { color: 'var(--theme-elevation-700)', fontSize: '0.875rem' },
}

export default DashboardOverview
