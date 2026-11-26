import type { Payload } from 'payload'
import { recordSubmissionHistory } from '../hooks/recordSubmissionHistory'
import { releaseListingNumber } from '../hooks/releaseListingNumber'

/**
 * Test double: a small in-memory Payload for the finish and abandon services.
 * Only what they call is implemented (find/findByID/update/delete/findGlobal/
 * sendEmail), with a where evaluator for the shapes they use. It runs the real
 * releaseListingNumber hook on a business update, so "the number is freed in
 * the same write" is tested against the hook itself, not assumed.
 */

type Doc = Record<string, unknown> & { id: number }

/** A path's values; an array on the way gives one value per row (like a SQL join). */
const values = (doc: unknown, path: string): unknown[] =>
  path.split('.').reduce<unknown[]>(
    (vs, k) =>
      vs.flatMap((v) => {
        if (v == null) return [undefined]
        if (Array.isArray(v)) return v.map((row) => (row == null ? undefined : (row as never)[k]))
        return [(v as never)[k]]
      }),
    [doc],
  )

const cmp = (a: unknown, b: unknown) =>
  new Date(a as string).getTime() - new Date(b as string).getTime()

function matches(doc: Doc, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'and') return (cond as never[]).every((w) => matches(doc, w))
    if (key === 'or') return (cond as never[]).some((w) => matches(doc, w))
    // Any row matching is enough, as for Payload's query on an array field.
    return values(doc, key).some((value) =>
      Object.entries(cond as Record<string, unknown>).every(([op, arg]) => {
        if (op === 'equals') return value === arg
        if (op === 'not_equals') return value !== arg
        if (op === 'exists') return (value != null) === arg
        if (op === 'less_than') return value != null && cmp(value, arg) < 0
        if (op === 'greater_than_equal') return value != null && cmp(value, arg) >= 0
        if (op === 'in') return (arg as unknown[]).includes(value)
        throw new Error(`fake payload: unsupported operator ${op}`)
      }),
    )
  })
}

export type { Doc }

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * What Payload 3 does to an update's data before any collection hook
 * (fields/hooks/beforeValidate/promise.js + getFallbackValue.js): a key that is
 * undefined takes the stored value; a group is filled key by key, recursively;
 * an array or a null is kept as sent.
 */
export function fillFromStored(data: unknown, stored: unknown): unknown {
  if (!isPlainObject(data) || !isPlainObject(stored)) return data
  const out: Record<string, unknown> = { ...data }
  for (const [key, value] of Object.entries(stored)) {
    if (out[key] === undefined) out[key] = structuredClone(value)
    else if (isPlainObject(out[key]) && isPlainObject(value)) {
      out[key] = fillFromStored(out[key], value)
    }
  }
  return out
}

export interface FakePayload {
  payload: Payload
  tables: Record<string, Doc[]>
  /** The nth row of a table; throws when absent. */
  row: (collection: string, index?: number) => Doc
  emails: Array<{ to: string; subject: string; html: string; text: string }>
  /** Collection -> ids whose update or delete should throw. */
  failUpdate: Set<string>
  failDelete: Set<string>
  /** Collections whose create should throw. */
  failCreate: Set<string>
  /** Every create call, for asserting what was stored. */
  creates: Array<{ collection: string; data: Record<string, unknown>; file?: unknown }>
  failSend: { value: boolean }
  /** `collection:id` of where-updates that should come back with an errors array. */
  errorUpdate: Set<string>
  /** Order of lock and read calls, for ordering tests. */
  log: string[]
  settings: { value: unknown }
  updates: Array<{ collection: string; id?: number; data: Record<string, unknown> }>
}

export function fakePayload(initial: Record<string, Doc[]> = {}): FakePayload {
  const tables: Record<string, Doc[]> = {
    businesses: [],
    'place-upload-sessions': [],
    media: [],
    issues: [],
    ...structuredClone(initial),
  }
  const f: FakePayload = {
    payload: undefined as never,
    tables,
    row: (collection, index = 0) => {
      const found = tables[collection]?.[index]
      if (!found) throw new Error(`no row ${index} in ${collection}`)
      return found
    },
    emails: [],
    failUpdate: new Set(),
    failDelete: new Set(),
    failCreate: new Set(),
    creates: [],
    failSend: { value: false },
    errorUpdate: new Set(),
    log: [],
    settings: { value: { magazinePlaces: {} } },
    updates: [],
  }
  const table = (c: string) => (tables[c] ??= [])

  const payload = {
    logger: { error: () => {}, warn: () => {} },
    findGlobal: async () => f.settings.value,
    find: async ({ collection, where }: { collection: string; where?: never }) => {
      const docs = table(collection).filter((d) => matches(d, where))
      return { docs: structuredClone(docs), totalDocs: docs.length }
    },
    findByID: async ({ collection, id }: { collection: string; id: number }) => {
      f.log.push(`read:${collection}`)
      const doc = table(collection).find((d) => d.id === id)
      if (!doc) throw new Error('Not found')
      return structuredClone(doc)
    },
    create: async (args: { collection: string; data: Record<string, unknown>; file?: unknown }) => {
      if (f.failCreate.has(args.collection)) throw new Error('create failed')
      f.creates.push({
        collection: args.collection,
        data: structuredClone(args.data),
        file: args.file,
      })
      const rows = table(args.collection)
      const id = rows.reduce((max, d) => Math.max(max, d.id), 100) + 1
      const doc = { id, ...structuredClone(args.data) } as Doc
      rows.push(doc)
      return structuredClone(doc)
    },
    update: async (args: {
      collection: string
      id?: number
      where?: never
      data: Record<string, unknown>
      req?: { context?: Record<string, unknown>; user?: unknown }
      user?: unknown
      context?: Record<string, unknown>
    }) => {
      f.updates.push({ collection: args.collection, id: args.id, data: structuredClone(args.data) })
      const targets = table(args.collection).filter((d) =>
        args.id !== undefined ? d.id === args.id : matches(d, args.where),
      )
      const done: Doc[] = []
      for (const doc of targets) {
        if (f.failUpdate.has(`${args.collection}:${doc.id}`)) throw new Error('update failed')
        if (args.id === undefined && f.errorUpdate.has(`${args.collection}:${doc.id}`)) {
          return { docs: [], errors: [{ message: 'could not update', id: doc.id }] }
        }
        // Like Payload's field-level beforeValidate on update: every key left
        // out (undefined) is filled from the stored document, group by group,
        // BEFORE the collection hooks run. Arrays and null are taken as given.
        let data = fillFromStored(structuredClone(args.data), doc) as Record<string, unknown>
        if (args.collection === 'businesses') {
          // Like Payload: a local call's context is merged into req.context.
          const req = args.req ?? {}
          req.context = { ...(req.context ?? {}), ...(args.context ?? {}) }
          if (args.user !== undefined && req.user === undefined) req.user = args.user
          // Synchronous, like a database row lock: the claim and the write are one step.
          data = releaseListingNumber({ data, originalDoc: doc } as never) as never
          data = recordSubmissionHistory({ data, originalDoc: doc, req } as never) as never
        }
        Object.assign(doc, data)
        done.push(structuredClone(doc))
      }
      return args.id !== undefined ? done[0] : { docs: done, errors: [] }
    },
    delete: async ({
      collection,
      id,
      where,
    }: {
      collection: string
      id?: number
      where?: never
    }) => {
      const rows = table(collection)
      if (id === undefined) {
        // Where-delete: removes every match, like Payload's.
        const gone = rows.filter((d) => matches(d, where))
        for (const d of gone) rows.splice(rows.indexOf(d), 1)
        return { docs: gone, errors: [] }
      }
      if (f.failDelete.has(`${collection}:${id}`)) throw new Error('delete failed')
      const i = rows.findIndex((d) => d.id === id)
      if (i < 0) throw new Error('Not found')
      return rows.splice(i, 1)[0]
    },
    sendEmail: async (message: { to: string; subject: string; html: string; text: string }) => {
      if (f.failSend.value) throw new Error('send failed')
      f.emails.push(message)
    },
  }
  f.payload = payload as unknown as Payload
  return f
}

/**
 * Stand-ins for runInTransaction and advisoryLock that behave like the real
 * pair: a lock is held per key until the transaction that took it ends, and the
 * next caller waits. Wire them with vi.mock('./branches') and
 * vi.mock('./partner-lock').
 */
type FakeReq = { release: Array<() => void>; log?: string[]; held?: Set<string> }
const queues = new Map<string, Promise<void>>()
let activeLog: string[] | undefined

export function bindFakeLog(f: FakePayload) {
  activeLog = f.log
}

export async function runInFakeTransaction<T>(
  _payload: unknown,
  fn: (req: FakeReq) => Promise<T>,
): Promise<T> {
  const req: FakeReq = { release: [] }
  try {
    return await fn(req)
  } finally {
    for (const r of req.release) r()
  }
}

export async function fakeAdvisoryLock(req: FakeReq, key: string): Promise<void> {
  activeLog?.push(`lock:${key}`)
  // Re-entrant within one transaction, like pg_advisory_xact_lock on one connection.
  const held = (req.held ??= new Set())
  if (held.has(key)) return
  held.add(key)
  const previous = queues.get(key) ?? Promise.resolve()
  let release!: () => void
  const mine = new Promise<void>((resolve) => (release = resolve))
  queues.set(
    key,
    previous.then(() => mine),
  )
  req.release.push(release)
  await previous
}
