'use client'

import Link from 'next/link'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useAuth } from '@payloadcms/ui'
import { FIRST_WINDOW, nextWindowSize } from './import-window'

/**
 * Import a directory of listings from a spreadsheet, in the admin panel.
 *
 * # What this screen is really doing
 *
 * Uploading nothing. The file is read in the browser and its text is posted to
 * /api/import-listings a window at a time, because a listing takes a couple of
 * seconds to write and a Netlify function is killed at ten. The loop lives here
 * because a browser tab has no such limit. See run.ts for the full reasoning.
 *
 * That is why there is a progress bar rather than a spinner: this is genuinely
 * dozens of requests, and a spinner for eleven minutes is indistinguishable
 * from a hang.
 *
 * # Check before write, and it is not optional
 *
 * The first button is the only one enabled until it has been used. A dry run
 * costs one request, maps every row, and reports what a real run would do -
 * including the rows the file gets wrong. Importing several hundred listings
 * without looking at that first is how a directory ends up full of listings
 * filed in the wrong town.
 *
 * # Everything arrives as a draft
 *
 * Stated on screen rather than only in the code, because it is the thing a
 * person most needs to know before pressing the button, and the thing they
 * would most reasonably assume otherwise.
 */

interface Warning {
  name: string
  warnings: string[]
}

interface Unmappable {
  sourceId: string
  name: string
  reason: string
}

interface ImportResponse {
  parsed: number
  created: number
  skippedExisting: number
  unmappable: Unmappable[]
  warnings: Warning[]
  failures: { name: string; error: string }[]
  nextOffset: number | null
  error?: string
}

interface Totals {
  created: number
  skippedExisting: number
  failures: { name: string; error: string }[]
}

const todayBatch = () => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `import-${now.getFullYear()}-${month}-${day}`
}

async function postWindow(body: Record<string, unknown>): Promise<ImportResponse> {
  const response = await fetch('/api/import-listings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // The admin panel is same-origin and already authenticated by cookie.
    credentials: 'include',
    body: JSON.stringify(body),
  })

  const data = (await response.json()) as ImportResponse

  if (!response.ok) {
    throw new Error(data.error ?? `The server answered ${response.status}.`)
  }

  return data
}

/**
 * Whether to draw the screen at all.
 *
 * # This is not the security boundary, and saying so matters
 *
 * The boundary is in import/endpoint.ts, which reads the role off the session
 * server-side and answers 403. That is what stops anything being written, and
 * it is tested with a positive control.
 *
 * This exists because a custom admin view is not gated the way a collection is.
 * Payload serves the login page to an unauthenticated request, and then the
 * client router renders the view over the top of it - so with no cookies at all
 * a stranger could read this screen: the wording, the batch naming scheme, the
 * shape of the import. Measured in a browser with an empty cookie jar, not
 * assumed.
 *
 * Nothing is exposed by that beyond the copy, but an admin screen a stranger
 * can read is a mistake worth not making, and the fix is four lines.
 */
function useMayImport(): 'yes' | 'no' | 'unknown' {
  const { user } = useAuth()

  if (user === undefined) return 'unknown'
  if (!user) return 'no'

  const roles = (user as { roles?: unknown }).roles
  const staff = Array.isArray(roles) && roles.some((r) => r === 'admin' || r === 'staff')
  return staff ? 'yes' : 'no'
}

export function ImportListings() {
  const permitted = useMayImport()
  const [fileName, setFileName] = useState<string | null>(null)
  const [csv, setCsv] = useState('')
  const [batch, setBatch] = useState(todayBatch)

  const [checked, setChecked] = useState<ImportResponse | null>(null)
  const [totals, setTotals] = useState<Totals | null>(null)
  const [done, setDone] = useState(0)
  /** Milliseconds per listing on the last window, for the estimate on screen. */
  const [rate, setRate] = useState(0)
  const [busy, setBusy] = useState<'checking' | 'importing' | null>(null)
  const [error, setError] = useState<string | null>(null)

  /** Set by the Stop button. Read between windows, never mid-window. */
  const stopped = useRef(false)

  const onFile = useCallback(async (file: File | undefined) => {
    if (!file) return

    setError(null)
    setChecked(null)
    setTotals(null)
    setDone(0)
    setRate(0)
    setFileName(file.name)
    setCsv(await file.text())
  }, [])

  const check = useCallback(async () => {
    setBusy('checking')
    setError(null)

    try {
      // limit 0 so the dry run describes the whole file rather than one window.
      setChecked(await postWindow({ csv, batch, dryRun: true, offset: 0, limit: 0 }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(null)
    }
  }, [csv, batch])

  const start = useCallback(async () => {
    setBusy('importing')
    setError(null)
    stopped.current = false

    const running: Totals = { created: 0, skippedExisting: 0, failures: [] }
    let offset = 0
    let window = FIRST_WINDOW

    try {
      for (;;) {
        const startedAt = Date.now()
        const result = await postWindow({ csv, batch, offset, limit: window })
        const elapsed = Date.now() - startedAt

        running.created += result.created
        running.skippedExisting += result.skippedExisting
        running.failures.push(...result.failures)

        setTotals({ ...running, failures: [...running.failures] })
        setDone(result.nextOffset ?? result.parsed)
        setRate(elapsed / Math.max(window, 1))

        window = nextWindowSize(window, elapsed)

        if (result.nextOffset === null) break

        /**
         * Checked between windows rather than inside one. A window that has
         * begun writing finishes; stopping mid-write would leave a listing
         * without the QR code its hook was about to mint.
         */
        if (stopped.current) break

        offset = result.nextOffset
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(null)
    }
  }, [csv, batch])

  const total = checked?.parsed ?? 0
  const percent = total > 0 ? Math.round((done / total) * 100) : 0
  const finished = totals !== null && busy === null && done >= total && total > 0

  /**
   * Rounded to the minute and always approximate. A countdown to the second on
   * a job whose speed depends on a database on another continent would be a
   * confident lie.
   */
  const remaining = useMemo(() => {
    const seconds = Math.round(((total - done) * rate) / 1000)
    if (seconds < 60) return 'less than a minute'
    return `${Math.max(1, Math.round(seconds / 60))} min`
  }, [total, done, rate])

  /**
   * Warnings grouped by kind, with real examples kept.
   *
   * The grouping key blanks out the quoted values so that nineteen variations
   * of the same problem count as one line. The first version then rendered only
   * that key, which read `name ends in "..." but the location column says
   * "..."` - a count of a problem with every detail removed, and nothing a
   * person could act on. The examples are the part that makes the list useful.
   */
  const warningGroups = useMemo(() => {
    const groups = new Map<string, { count: number; examples: string[] }>()

    for (const entry of checked?.warnings ?? []) {
      for (const warning of entry.warnings) {
        const key = warning.replace(/"[^"]*"/g, '"..."')
        const group = groups.get(key) ?? { count: 0, examples: [] }

        group.count += 1
        if (group.examples.length < 4) group.examples.push(`${entry.name} - ${warning}`)

        groups.set(key, group)
      }
    }

    return [...groups.entries()].sort((a, b) => b[1].count - a[1].count)
  }, [checked])

  // Nothing at all while the session is still resolving, so the screen does not
  // flash into view for somebody who is about to be refused.
  if (permitted === 'unknown') return null

  if (permitted === 'no') {
    return (
      <div style={styles.page}>
        <h1 style={styles.h1}>Import listings</h1>
        <p style={styles.lede}>You need a staff account to use this. Sign in to the admin panel.</p>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>Import listings</h1>

      <p style={styles.lede}>
        Turns a spreadsheet into listings, each with its own QR code. Everything arrives as a{' '}
        <strong>draft</strong>, so nothing appears on the site until somebody publishes it.
      </p>

      <ol style={styles.steps}>
        <li>
          Save your sheet from Excel as <strong>CSV UTF-8</strong>.
        </li>
        <li>Check it here first. Nothing is written by a check.</li>
        <li>Import. Then find the codes on the QR code sheet.</li>
      </ol>

      <section style={styles.card}>
        <label style={styles.label} htmlFor="import-file">
          The spreadsheet
        </label>
        <input
          id="import-file"
          type="file"
          accept=".csv,text/csv"
          disabled={busy !== null}
          onChange={(event) => void onFile(event.target.files?.[0])}
          style={styles.file}
        />
        {fileName ? (
          <p style={styles.hint}>
            {fileName} - {(csv.length / 1024).toFixed(0)}KB
          </p>
        ) : null}

        <label style={{ ...styles.label, marginTop: '1.25rem' }} htmlFor="import-batch">
          Batch name
        </label>
        <input
          id="import-batch"
          type="text"
          value={batch}
          disabled={busy !== null}
          onChange={(event) => setBatch(event.target.value)}
          style={styles.text}
        />
        <p style={styles.hint}>
          This is what lets the whole import be removed again later, in one go. Give each import its
          own name.
        </p>

        <div style={styles.actions}>
          <button
            type="button"
            onClick={() => void check()}
            disabled={!csv || busy !== null || !batch}
            style={styles.secondary}
          >
            {busy === 'checking' ? 'Checking...' : 'Check the file'}
          </button>

          <button
            type="button"
            onClick={() => void start()}
            disabled={!checked || busy !== null}
            /*
             * Dimmed when disabled, because it spends most of its life that way
             * - the file has to be checked first - and a filled button that
             * looks identical whether or not it does anything reads as broken.
             */
            style={{
              ...styles.primary,
              ...(!checked || busy !== null ? styles.disabled : {}),
            }}
            title={checked ? undefined : 'Check the file first'}
          >
            {busy === 'importing' ? 'Importing...' : `Import ${total || ''} listings`.trim()}
          </button>

          {busy === 'importing' ? (
            <button
              type="button"
              onClick={() => {
                stopped.current = true
              }}
              style={styles.secondary}
            >
              Stop after this batch
            </button>
          ) : null}
        </div>
      </section>

      {error ? (
        <section style={{ ...styles.card, ...styles.errorCard }}>
          <strong>The import stopped.</strong>
          <p style={{ margin: '0.5rem 0 0' }}>{error}</p>
          <p style={styles.hint}>
            Nothing is lost. Anything already written stays, and importing the same file again with
            the same batch name skips what exists and carries on.
          </p>
        </section>
      ) : null}

      {checked ? (
        <section style={styles.card}>
          <h2 style={styles.h2}>What is in the file</h2>

          <dl style={styles.stats}>
            <Stat label="Listings" value={checked.parsed} />
            <Stat label="Rows we cannot use" value={checked.unmappable.length} />
            <Stat label="Rows needing a look" value={checked.warnings.length} />
          </dl>

          {checked.unmappable.length > 0 ? (
            <>
              <h3 style={styles.h3}>These rows will be skipped</h3>
              <ul style={styles.list}>
                {checked.unmappable.slice(0, 20).map((row) => (
                  <li key={row.sourceId}>
                    {row.name || `row ${row.sourceId}`} - {row.reason}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {warningGroups.length > 0 ? (
            <>
              <h3 style={styles.h3}>Worth checking afterwards</h3>
              <ul style={styles.list}>
                {warningGroups.map(([warning, group]) => (
                  <li key={warning} style={{ marginBottom: '0.5rem' }}>
                    <strong>{group.count}</strong> {group.count === 1 ? 'listing' : 'listings'}:{' '}
                    {/*
                     * The blanked value becomes an ellipsis rather than being
                     * deleted. Removing it left the preposition dangling -
                     * "name ends in but the location column says" - which reads
                     * as a truncated sentence rather than a heading.
                     */}
                    {warning.replace(/"\.\.\."/g, '…')}
                    <ul style={styles.examples}>
                      {group.examples.map((example) => (
                        <li key={example}>{example}</li>
                      ))}
                      {group.count > group.examples.length ? (
                        <li>and {group.count - group.examples.length} more</li>
                      ) : null}
                    </ul>
                  </li>
                ))}
              </ul>
              <p style={styles.hint}>
                None of these stops the import. They are places the spreadsheet is unclear or
                contradicts itself, left for a person rather than guessed at.
              </p>
            </>
          ) : null}
        </section>
      ) : null}

      {totals ? (
        <section style={styles.card}>
          <h2 style={styles.h2}>{finished ? 'Done' : 'Importing'}</h2>

          <div style={styles.barOuter}>
            <div style={{ ...styles.barInner, width: `${percent}%` }} />
          </div>
          <p style={styles.hint}>
            {done} of {total} - {percent}%
            {rate > 0 && !finished ? ` - about ${remaining} left` : ''}
          </p>

          <dl style={styles.stats}>
            <Stat label="Created" value={totals.created} />
            <Stat label="Already there" value={totals.skippedExisting} />
            <Stat label="Failed" value={totals.failures.length} />
          </dl>

          {totals.failures.length > 0 ? (
            <>
              <h3 style={styles.h3}>These did not save</h3>
              <ul style={styles.list}>
                {totals.failures.slice(0, 20).map((failure) => (
                  <li key={failure.name}>
                    {failure.name} - {failure.error}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {finished ? (
            <p style={{ marginTop: '1rem' }}>
              <a href="/qr/sheet" target="_blank" rel="noopener noreferrer" style={styles.link}>
                Open the QR code sheet
              </a>{' '}
              to print or send the codes. The listings are drafts in{' '}
              <Link href="/admin/collections/businesses" style={styles.link}>
                Businesses
              </Link>
              .
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt style={styles.statLabel}>{label}</dt>
      <dd style={styles.statValue}>{value}</dd>
    </div>
  )
}

/**
 * Inline styles, matching the other admin components in this folder.
 *
 * Payload's admin CSS is not exposed as classes we can rely on across versions,
 * and a stylesheet that drifts from the panel is worse than plain inline rules
 * that inherit its colours. `currentColor` and `inherit` do most of the work, so
 * this follows the panel's own light and dark themes without knowing them.
 */
const styles: Record<string, React.CSSProperties> = {
  page: { padding: '2rem', maxWidth: '48rem' },
  h1: { fontSize: '1.5rem', margin: '0 0 0.5rem' },
  h2: { fontSize: '1.05rem', margin: '0 0 0.75rem' },
  h3: { fontSize: '0.875rem', margin: '1.25rem 0 0.5rem', opacity: 0.75 },
  lede: { margin: '0 0 1rem', lineHeight: 1.6, opacity: 0.85 },
  steps: { margin: '0 0 1.5rem', paddingInlineStart: '1.25rem', lineHeight: 1.9, opacity: 0.85 },
  card: {
    border: '1px solid currentColor',
    borderRadius: '0.375rem',
    padding: '1.25rem',
    marginBottom: '1.25rem',
    opacity: 0.99,
  },
  errorCard: { borderWidth: '2px' },
  label: { display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.375rem' },
  file: { display: 'block', width: '100%' },
  text: {
    display: 'block',
    width: '100%',
    padding: '0.5rem',
    font: 'inherit',
    color: 'inherit',
    background: 'transparent',
    border: '1px solid currentColor',
    borderRadius: '0.25rem',
  },
  hint: { fontSize: '0.8125rem', opacity: 0.7, margin: '0.5rem 0 0', lineHeight: 1.5 },
  actions: { display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' },
  /**
   * The filled button, and why it is not `currentColor`.
   *
   * It was `background: currentColor` with `color: inherit`, which are the same
   * colour by definition - so the button rendered as a solid black rectangle
   * with its label invisible inside it. `mixBlendMode: difference` was meant to
   * rescue the text and cannot: it blends the whole element against what is
   * behind it, not the label against its own background.
   *
   * Payload's own elevation variables give a background and a foreground that
   * are guaranteed to contrast and that swap in the dark theme. The fallbacks
   * carry the same contrast if the names ever change, so the worst case is a
   * button that looks slightly foreign rather than one nobody can read.
   */
  primary: {
    padding: '0.5rem 1rem',
    font: 'inherit',
    cursor: 'pointer',
    border: '1px solid transparent',
    borderRadius: '0.25rem',
    background: 'var(--theme-elevation-800, #111827)',
    color: 'var(--theme-elevation-0, #ffffff)',
  },
  disabled: { opacity: 0.45, cursor: 'not-allowed' },
  secondary: {
    padding: '0.5rem 1rem',
    font: 'inherit',
    cursor: 'pointer',
    border: '1px solid currentColor',
    borderRadius: '0.25rem',
    background: 'transparent',
    color: 'inherit',
  },
  stats: { display: 'flex', gap: '2rem', margin: '0 0 0.5rem', flexWrap: 'wrap' },
  statLabel: {
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    opacity: 0.6,
  },
  statValue: { fontSize: '1.5rem', margin: '0.125rem 0 0', fontVariantNumeric: 'tabular-nums' },
  list: { margin: 0, paddingInlineStart: '1.25rem', lineHeight: 1.7, fontSize: '0.875rem' },
  examples: {
    margin: '0.25rem 0 0',
    paddingInlineStart: '1rem',
    listStyle: 'none',
    fontSize: '0.8125rem',
    opacity: 0.7,
    lineHeight: 1.6,
  },
  barOuter: {
    height: '0.5rem',
    borderRadius: '0.25rem',
    border: '1px solid currentColor',
    overflow: 'hidden',
  },
  barInner: { height: '100%', background: 'currentColor', transition: 'width 200ms ease' },
  link: { color: 'inherit', textDecoration: 'underline' },
}

export default ImportListings
