import { DB_SCHEMA } from '../lib/db'

/**
 * The permanence layer, exported and restored.
 *
 * # What this is insuring against
 *
 * A printed code is minted once and cannot be reissued - the paper is already in
 * airport lounges. `protectPrintedCodes` refuses to delete one, and the `code`
 * field is immutable on update (see collections/QrCodes.ts), so the running app
 * cannot lose a code by accident. What the running app does not protect against
 * is the database itself going away, and the free Supabase plan takes no
 * backups. This is that backup, narrowed to the only rows that are irreplaceable.
 *
 * A listing can be re-imported from the designer's sheet. A scan count can be
 * rebuilt from the scan log, or simply started again. The one thing that cannot
 * be recreated is the mapping from a printed code to what it opens: that code was
 * random, minted once, and is now on paper. So this exports exactly that mapping
 * and nothing else.
 *
 * # Why by slug and not by id
 *
 * A restore rebuilds the database, and ids are assigned fresh on the way in - the
 * business that was id 42 may come back as id 7. Slugs survive a rebuild because
 * they are chosen, not assigned, so the file records a code's target by slug and
 * `restorePermanence` resolves the slug back to whatever id the target now has.
 *
 * # Why the repo, and why no timestamp in the file
 *
 * Everything here is public: a code and a slug are both printed on paper. So the
 * file is committed to the repo, which makes git the backup history - offsite
 * from Supabase, free, and diffable. The diff is half the value: a code is not
 * supposed to change what it points at without someone deciding to, so a line
 * changing in this file is itself an alarm.
 *
 * That only works if a day where nothing changed produces no diff, which is why
 * there is no `generatedAt` in the file. The commit carries the date; putting one
 * inside the file would rewrite it every night and bury the real changes.
 *
 * # What it deliberately leaves out
 *
 * Bookings and customers, which are personal data and have no business in a
 * public repo - those wait for Supabase's own backups once there is anything to
 * lose. The scan log, which is renewal evidence but is many rows and rebuildable.
 * And `scan_count`, which changes constantly and would defeat the no-change-no-
 * diff property above; a restore starts it at zero and the log is the record.
 */

/**
 * Anything that can run a query - a `pg` Pool, a pooled client mid-transaction,
 * or the pool Payload's adapter exposes. Kept to this shape on purpose so the
 * core can be driven from the integration test with `rawDb(payload).pool` and
 * from the CLI with a plain Pool, and so restore leaves the transaction to its
 * caller (the CLI commits or rolls back; the test always rolls back).
 */
export interface SqlExecutor {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>
}

/**
 * Bumped only if the shape below changes in a way a restore has to know about.
 * `restorePermanence` refuses a file it does not recognise rather than guessing.
 */
export const PERMANENCE_VERSION = 1

/** Where the committed backup lives, relative to the repo root. */
export const BACKUP_RELATIVE = 'backups/qr-permanence.json'

/** One printed code and where it points, by slug. Null fields are omitted. */
export interface PermanenceCode {
  code: string
  targetType: string
  placement: string
  active: boolean
  /** Set when the code opens a listing. */
  businessSlug?: string
  /** Set when the code opens a magazine article. */
  articleSlug?: string
  /**
   * The issue the code opens (target type `issue`) and, for every other type,
   * the printed issue that carries it. Recorded whenever the code is tied to an
   * issue, because that tie is what marks the code as permanent.
   */
  issueSlug?: string
  /** The taxonomy slug a `category` code filters the directory to. */
  category?: string
  /** The address an `external` code opens. */
  externalUrl?: string
}

export interface PermanenceFile {
  version: number
  count: number
  codes: PermanenceCode[]
}

interface CodeRow {
  code: string
  target_type: string | null
  placement: string | null
  active: boolean | null
  category: string | null
  external_url: string | null
  business_slug: string | null
  article_slug: string | null
  issue_slug: string | null
}

/**
 * One query, three left joins. The joins turn the target ids into the target
 * slugs; `category` and `external_url` are stored on the code row itself and need
 * no join. Ordered by code so the file is byte-stable run to run - that is what
 * makes the diff meaningful.
 */
const exportSql = (schema: string) => `
  select
    q.code, q.target_type, q.placement, q.active, q.category, q.external_url,
    b.slug as business_slug,
    a.slug as article_slug,
    i.slug as issue_slug
  from "${schema}"."qr_codes" q
  left join "${schema}"."businesses" b on b.id = q.business_id
  left join "${schema}"."articles"   a on a.id = q.article_id
  left join "${schema}"."issues"     i on i.id = q.issue_id
  order by q.code asc
`

const text = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined
  const s = String(value)
  return s === '' ? undefined : s
}

function toCode(row: CodeRow): PermanenceCode {
  // Keys are added in a fixed order so JSON.stringify produces a stable file.
  const code: PermanenceCode = {
    code: String(row.code),
    targetType: String(row.target_type ?? ''),
    placement: String(row.placement ?? ''),
    // The column is nullable and defaults to true; a null there means the
    // default was never overridden, which is "active", not "inactive".
    active: row.active === null || row.active === undefined ? true : Boolean(row.active),
  }

  const businessSlug = text(row.business_slug)
  if (businessSlug) code.businessSlug = businessSlug

  const articleSlug = text(row.article_slug)
  if (articleSlug) code.articleSlug = articleSlug

  const issueSlug = text(row.issue_slug)
  if (issueSlug) code.issueSlug = issueSlug

  const category = text(row.category)
  if (category) code.category = category

  const externalUrl = text(row.external_url)
  if (externalUrl) code.externalUrl = externalUrl

  return code
}

export async function exportPermanence(
  exec: SqlExecutor,
  schema: string = DB_SCHEMA,
): Promise<PermanenceFile> {
  const { rows } = await exec.query(exportSql(schema))
  const codes = (rows as unknown as CodeRow[]).map(toCode)
  return { version: PERMANENCE_VERSION, count: codes.length, codes }
}

/** The file exactly as it is written to disk: two-space JSON, trailing newline. */
export function serialize(file: PermanenceFile): string {
  return JSON.stringify(file, null, 2) + '\n'
}

export interface DriftEntry {
  code: string
  targetType: string
  /** What the code needs to resolve and does not have. */
  missing: string
}

/**
 * Codes that no longer resolve to what they claim.
 *
 * Runs on the exported file, not the database - the export already left-joined
 * the targets, so a code whose business was deleted comes back with a null slug
 * and shows up here. This is the alarm the nightly job trips on: a printed code
 * that has quietly stopped pointing anywhere is exactly the failure the whole
 * product cannot have, and it should stop the backup and shout rather than
 * commit a file that records the breakage as normal.
 *
 * `home` needs nothing. A target type with no case here is itself drift - it
 * means the enum grew without this function or the resolver growing with it.
 */
export function findDrift(file: PermanenceFile): DriftEntry[] {
  const drift: DriftEntry[] = []
  const miss = (c: PermanenceCode, missing: string) =>
    drift.push({ code: c.code, targetType: c.targetType, missing })

  for (const c of file.codes) {
    switch (c.targetType) {
      case 'business':
        if (!c.businessSlug) miss(c, 'business')
        break
      case 'article':
        if (!c.articleSlug) miss(c, 'article')
        break
      case 'issue':
        if (!c.issueSlug) miss(c, 'issue')
        break
      case 'category':
        if (!c.category) miss(c, 'category')
        break
      case 'external':
        if (!c.externalUrl) miss(c, 'external URL')
        break
      case 'home':
        break
      default:
        miss(c, `a resolver case for target type "${c.targetType}"`)
    }
  }

  return drift
}

export interface RestoreResult {
  inserted: number
  updated: number
  /** Business codes whose back-reference (businesses.qr_code_id) was reattached. */
  relinked: number
  /**
   * Codes skipped because a slug in the file matches no listing in the database.
   * Non-empty means the listings were not restored first: the caller should roll
   * back rather than commit a half-restore.
   */
  unresolved: { code: string; targetType: string; slug: string }[]
}

async function idBySlug(
  exec: SqlExecutor,
  schema: string,
  table: 'businesses' | 'articles' | 'issues',
  slug: string,
): Promise<number | null> {
  const { rows } = await exec.query(
    `select id from "${schema}"."${table}" where slug = $1 limit 1`,
    [slug],
  )
  const id = rows[0]?.id
  if (id === null || id === undefined) return null
  return typeof id === 'number' ? id : Number(id)
}

const upsertSql = (schema: string) => `
  insert into "${schema}"."qr_codes"
    (code, target_type, placement, active, category, external_url,
     business_id, article_id, issue_id, updated_at, created_at)
  values (
    $1,
    $2::text::"${schema}"."enum_qr_codes_target_type",
    $3::text::"${schema}"."enum_qr_codes_placement",
    $4,
    $5::text::"${schema}"."enum_qr_codes_category",
    $6, $7, $8, $9, now(), now()
  )
  on conflict (code) do update set
    target_type  = excluded.target_type,
    placement    = excluded.placement,
    active       = excluded.active,
    category     = excluded.category,
    external_url = excluded.external_url,
    business_id  = excluded.business_id,
    article_id   = excluded.article_id,
    issue_id     = excluded.issue_id,
    updated_at   = now()
  returning id, (xmax = 0) as inserted
`

/**
 * Rebuild the code rows from a backup file, keyed by the code.
 *
 * # The caller owns the transaction
 *
 * Nothing here runs BEGIN or COMMIT. The CLI wraps the whole thing in a
 * transaction and commits it, or rolls it back for a dry run; the integration
 * test wraps it and always rolls back. That is deliberate: it means the dry run
 * and the real run walk the identical path, and the test proves the real one.
 *
 * # Why it goes straight to SQL and not through Payload
 *
 * Because the whole point is to set a code that already exists, and Payload will
 * not let you: the `code` field's beforeChange hook returns the original value on
 * every update, which is correct for the app and exactly wrong for a restore.
 * Raw SQL is the one legitimate way past that guard, which is why it lives here
 * and nowhere else. The enum casts match lib/qr-fast.ts: the driver sends a
 * parameter as an unknown type and an INSERT that only runs during a disaster is
 * not the place to rely on Postgres inferring it.
 *
 * # Idempotent, and it reattaches the back-reference
 *
 * `on conflict (code) do update` means running it twice changes nothing the
 * second time, and `scan_count` is left out of the update so a re-run never
 * resets a counter. For a business code it also sets businesses.qr_code_id back
 * to the row it just wrote, because the dashboard and the QR download read the
 * code through that back-reference, not through the forward join the scan uses.
 *
 * A slug that resolves to nothing is recorded and skipped rather than written as
 * a code pointing nowhere: that state means the listings were not restored
 * first, and the caller is expected to roll back on it.
 */
export async function restorePermanence(
  exec: SqlExecutor,
  file: PermanenceFile,
  schema: string = DB_SCHEMA,
): Promise<RestoreResult> {
  if (file.version !== PERMANENCE_VERSION) {
    throw new Error(
      `This backup is version ${file.version}; this build restores version ${PERMANENCE_VERSION}. ` +
        'Restore with a matching build, or migrate the file first.',
    )
  }

  const result: RestoreResult = { inserted: 0, updated: 0, relinked: 0, unresolved: [] }
  const upsert = upsertSql(schema)

  for (const c of file.codes) {
    let businessId: number | null = null
    let articleId: number | null = null
    let issueId: number | null = null
    let unresolved = false

    const resolve = async (
      table: 'businesses' | 'articles' | 'issues',
      slug: string | undefined,
    ): Promise<number | null> => {
      if (!slug) return null
      const id = await idBySlug(exec, schema, table, slug)
      if (id === null) {
        result.unresolved.push({ code: c.code, targetType: c.targetType, slug })
        unresolved = true
      }
      return id
    }

    businessId = await resolve('businesses', c.businessSlug)
    articleId = await resolve('articles', c.articleSlug)
    issueId = await resolve('issues', c.issueSlug)

    // A slug in the file that matches no row means the listings are not in place
    // yet. Writing the code now would point a printed symbol at nothing, so skip
    // it and let the caller decide (the CLI rolls back on any unresolved).
    if (unresolved) continue

    const { rows } = await exec.query(upsert, [
      c.code,
      c.targetType,
      c.placement,
      c.active,
      c.category ?? null,
      c.externalUrl ?? null,
      businessId,
      articleId,
      issueId,
    ])

    const row = rows[0]
    const qrId = row?.id
    if (row?.inserted) result.inserted += 1
    else result.updated += 1

    if (businessId !== null && qrId !== null && qrId !== undefined) {
      await exec.query(`update "${schema}"."businesses" set qr_code_id = $1 where id = $2`, [
        qrId,
        businessId,
      ])
      result.relinked += 1
    }
  }

  return result
}
