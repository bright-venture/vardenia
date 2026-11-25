import type { Access, Where } from 'payload'
import { Brands } from '../../collections/Brands'
import { mediaRead, publishedStaffOrOwned } from '../../access/index'

/**
 * A small in-memory stand-in for the Payload local API, for the brand and
 * branch tests (Task 9). Not a database: it stores plain rows per collection
 * and answers `find`, `findByID`, `count`, `create` and `update` with the
 * `where` operators those modules use (equals, not_equals, in, not_in, exists,
 * greater_than, greater_than_equal, and, or).
 *
 * What makes it worth having: with `overrideAccess: false` it applies the REAL
 * read rule of the collection (brandsRead, publishedStaffOrOwned) to the
 * request's user, as Payload does, so a test of a public read proves the rule
 * hides what it should. Trashed rows (`deletedAt`) are hidden unless
 * `trash: true`, as in Payload. Unique slugs are enforced per collection and a
 * clash throws an error shaped like Payload's (path `slug`).
 *
 * `transaction()` gives the all-or-nothing behaviour of a database
 * transaction: each write made with that transaction's `req` records how to
 * undo it, and the undo runs if the callback throws. Writes of other
 * transactions are kept, so two transactions can run interleaved. Callbacks in
 * `req.afterEnd` run once the transaction has committed or rolled back (a
 * test's lock release). There is no isolation: a read sees every write at once,
 * committed or not.
 */

export type Row = Record<string, unknown> & { id: number }

const READ_RULES: Record<string, Access | undefined> = {
  brands: Brands.access?.read as Access,
  businesses: publishedStaffOrOwned,
  media: mediaRead,
}

const getPath = (row: Row, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => {
    if (value === null || value === undefined) return undefined
    return (value as Record<string, unknown>)[key]
  }, row)

const idOf = (value: unknown): unknown => {
  if (value && typeof value === 'object' && 'id' in value) return (value as { id: unknown }).id
  return value
}

const eq = (a: unknown, b: unknown) => String(idOf(a)) === String(idOf(b))

export function matches(row: Row, where: Where | undefined): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'and') return (condition as Where[]).every((w) => matches(row, w))
    if (key === 'or') return (condition as Where[]).some((w) => matches(row, w))
    const value = getPath(row, key)
    return Object.entries(condition as Record<string, unknown>).every(([op, operand]) => {
      switch (op) {
        case 'equals':
          if (Array.isArray(value)) return value.some((v) => eq(v, operand))
          return value !== undefined && value !== null && eq(value, operand)
        case 'not_equals':
          return !eq(value, operand)
        case 'in':
          return (operand as unknown[]).some((o) => eq(value, o))
        case 'not_in':
          return !(operand as unknown[]).some((o) => eq(value, o))
        case 'exists':
          return (value !== undefined && value !== null) === Boolean(operand)
        case 'greater_than':
          return String(value) > String(operand)
        case 'greater_than_equal':
          return String(value) >= String(operand)
        default:
          throw new Error(`memory-payload: operator ${op} not supported`)
      }
    })
  })
}

/** Shaped like Payload's rethrow of a unique-index refusal (lib/db-errors). */
export class SlugTaken extends Error {
  data: { errors: { path: string; message: string; tableName: string }[] }
  constructor(collection = 'businesses') {
    super('The following field is invalid: slug')
    this.name = 'ValidationError'
    this.data = {
      errors: [{ path: 'slug', message: 'Value must be unique', tableName: collection }],
    }
  }
}

interface Options {
  collection: string
  where?: Where
  overrideAccess?: boolean
  trash?: boolean
  req?: { user?: unknown }
  user?: unknown
  limit?: number
  sort?: string
}

export function memoryPayload(
  seed: Record<string, Row[]> = {},
  /** `slowWrites`: every create and update first waits a macrotask, so two
   *  concurrent transactions really interleave between a read and a write. */
  options: { now?: Date; slowWrites?: boolean } = {},
) {
  const db: Record<string, Row[]> = structuredClone(seed)
  let txCount = 0
  const journals = new Map<string, (() => void)[]>()
  const journalOf = (req: unknown) =>
    journals.get(String((req as { transactionID?: unknown } | undefined)?.transactionID))
  let nextId = 1000
  const calls: { op: string; args: Record<string, unknown> }[] = []
  /** Throw from a write: (op, args) => an error to throw, or undefined. */
  let failWith: ((op: string, args: Record<string, unknown>) => Error | undefined) | null = null

  const rows = (collection: string) => (db[collection] ??= [])

  const visible = async (opts: Options): Promise<Row[]> => {
    let list = rows(opts.collection).filter((row) => opts.trash === true || !row.deletedAt)
    if (opts.overrideAccess === false) {
      const rule = READ_RULES[opts.collection]
      if (!rule) throw new Error(`memory-payload: no read rule for ${opts.collection}`)
      const user = opts.user ?? opts.req?.user ?? null
      const verdict = await rule({ req: { user } } as never)
      if (verdict === false) return []
      if (verdict !== true) list = list.filter((row) => matches(row, verdict as Where))
    }
    list = list.filter((row) => matches(row, opts.where))
    if (opts.sort) {
      const key = opts.sort.replace(/^-/, '')
      const sign = opts.sort.startsWith('-') ? -1 : 1
      list = [...list].sort((a, b) => (String(a[key]) > String(b[key]) ? sign : -sign))
    }
    return list
  }

  const payload = {
    calls,
    get db() {
      return db
    },
    failOn(fn: typeof failWith) {
      failWith = fn
    },
    async find(opts: Options) {
      calls.push({ op: 'find', args: opts as never })
      const list = await visible(opts)
      const limited = opts.limit ? list.slice(0, opts.limit) : list
      return { docs: structuredClone(limited), totalDocs: list.length }
    },
    async count(opts: Options) {
      calls.push({ op: 'count', args: opts as never })
      return { totalDocs: (await visible(opts)).length }
    },
    async findByID(opts: Options & { id: number | string }) {
      calls.push({ op: 'findByID', args: opts as never })
      const list = await visible({ ...opts, where: { id: { equals: opts.id } } })
      if (!list[0]) throw Object.assign(new Error('Not Found'), { status: 404 })
      return structuredClone(list[0])
    },
    async create(
      opts: { collection: string; data: Record<string, unknown> } & Record<string, unknown>,
    ) {
      calls.push({ op: 'create', args: opts })
      if (options.slowWrites) await new Promise((resolve) => setTimeout(resolve, 0))
      const error = failWith?.('create', opts)
      if (error) throw error
      const data = structuredClone(opts.data)
      if (
        typeof data.slug === 'string' ||
        opts.collection === 'brands' ||
        opts.collection === 'businesses'
      ) {
        const slug =
          (data.slug as string | undefined) ??
          String(data.name ?? 'x')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
        if (rows(opts.collection).some((row) => row.slug === slug))
          throw new SlugTaken(opts.collection)
        data.slug = slug
      }
      const row = {
        ...data,
        id: nextId++,
        createdAt: (options.now ?? new Date()).toISOString(),
      } as Row
      const list = rows(opts.collection)
      list.push(row)
      journalOf(opts.req)?.push(() => {
        const at = list.indexOf(row)
        if (at >= 0) list.splice(at, 1)
      })
      return structuredClone(row)
    },
    async update(
      opts: { collection: string; id: number | string; data: Record<string, unknown> } & Record<
        string,
        unknown
      >,
    ) {
      calls.push({ op: 'update', args: opts })
      if (options.slowWrites) await new Promise((resolve) => setTimeout(resolve, 0))
      const error = failWith?.('update', opts)
      if (error) throw error
      const row = rows(opts.collection).find((r) => String(r.id) === String(opts.id))
      if (!row) throw Object.assign(new Error('Not Found'), { status: 404 })
      const before = structuredClone(row)
      journalOf(opts.req)?.push(() => {
        for (const key of Object.keys(row)) delete row[key]
        Object.assign(row, before)
      })
      Object.assign(row, structuredClone(opts.data))
      return structuredClone(row)
    },
    /** All or nothing, like a database transaction. */
    async transaction<T>(fn: (req: Record<string, unknown>) => Promise<T>): Promise<T> {
      const transactionID = `tx${++txCount}`
      const journal: (() => void)[] = []
      journals.set(transactionID, journal)
      const afterEnd: (() => void)[] = []
      const req = { transactionID, payload, afterEnd }
      try {
        return await fn(req)
      } catch (error) {
        for (const undo of journal.reverse()) undo()
        throw error
      } finally {
        journals.delete(transactionID)
        for (const done of afterEnd) done()
      }
    },
  }
  return payload
}

export type MemoryPayload = ReturnType<typeof memoryPayload>
