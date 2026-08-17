import { describe, expect, it } from 'vitest'
import { assertSeedTarget, checkSeedTarget, databaseIdentity } from './guard'

/**
 * The guard exists for one specific accident: DATABASE_URL is pointed at
 * production to run a migration, is not pointed back, and the next `pnpm seed`
 * writes invented businesses into the live directory.
 *
 * So the tests are written against that accident rather than against the
 * function signature. The important cases are the ones where the seed *must
 * not* run, and the case where the failure message itself would do harm.
 */

const DEV =
  'postgresql://postgres.devref123:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres'
const PROD =
  'postgresql://postgres.prodref456:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres'

const DEV_ID = 'postgres.devref123@aws-0-eu-central-1.pooler.supabase.com/postgres'
const PROD_ID = 'postgres.prodref456@aws-0-eu-central-1.pooler.supabase.com/postgres'

describe('databaseIdentity', () => {
  it('identifies a database by user, host and name', () => {
    expect(databaseIdentity(DEV)).toBe(DEV_ID)
  })

  /**
   * The reason the host alone is not enough. Every Supabase project in a region
   * shares one pooler hostname, so two projects differ only in the user, which
   * carries the project ref.
   */
  it('separates two projects that share a pooler hostname', () => {
    expect(databaseIdentity(DEV)).not.toBe(databaseIdentity(PROD))
  })

  /**
   * Migrations use the session pooler on 5432 and everything else uses 6543.
   * Same database. Treating them as different would train people to override
   * the guard, which is worse than not having one.
   */
  it('treats the session and transaction poolers as the same database', () => {
    const session = DEV.replace(':6543', ':5432')
    expect(databaseIdentity(session)).toBe(databaseIdentity(DEV))
  })

  it('ignores case', () => {
    expect(databaseIdentity(DEV.toUpperCase())).toBe(DEV_ID)
  })

  it('never includes the password', () => {
    const identity = databaseIdentity(DEV)
    expect(identity).not.toContain('pw')
  })

  it('returns null for anything it cannot read', () => {
    expect(databaseIdentity(undefined)).toBeNull()
    expect(databaseIdentity('')).toBeNull()
    expect(databaseIdentity('not a url')).toBeNull()
    // No database name.
    expect(databaseIdentity('postgresql://user:pw@host:5432')).toBeNull()
    // No user, so two projects on one host would be indistinguishable.
    expect(databaseIdentity('postgresql://host:5432/postgres')).toBeNull()
  })
})

describe('checkSeedTarget', () => {
  it('allows the database it was told to allow', () => {
    const result = checkSeedTarget({
      connectionString: DEV,
      allowed: DEV_ID,
      nodeEnv: undefined,
    })
    expect(result.ok).toBe(true)
  })

  it('allows it regardless of surrounding whitespace or case in the setting', () => {
    const result = checkSeedTarget({
      connectionString: DEV,
      allowed: `  ${DEV_ID.toUpperCase()}  `,
      nodeEnv: undefined,
    })
    expect(result.ok).toBe(true)
  })

  /** The accident this whole file is about. */
  it('refuses production while .env still allows dev', () => {
    const result = checkSeedTarget({
      connectionString: PROD,
      allowed: DEV_ID,
      nodeEnv: undefined,
    })
    expect(result.ok).toBe(false)
  })

  /**
   * The old guard was `NODE_ENV === 'production'`, and `pnpm seed` runs through
   * tsx with NODE_ENV unset. It passed. That is the bug.
   */
  it('refuses production even with NODE_ENV unset, which is how the seed runs', () => {
    const result = checkSeedTarget({
      connectionString: PROD,
      allowed: DEV_ID,
      nodeEnv: undefined,
    })
    expect(result.ok).toBe(false)
  })

  it('fails closed when nothing has been configured', () => {
    // Unset must mean refuse. A guard that is only on once someone configures
    // it is off on every machine where a step was skipped.
    expect(
      checkSeedTarget({ connectionString: DEV, allowed: undefined, nodeEnv: undefined }).ok,
    ).toBe(false)
    expect(checkSeedTarget({ connectionString: DEV, allowed: '', nodeEnv: undefined }).ok).toBe(
      false,
    )
    expect(checkSeedTarget({ connectionString: DEV, allowed: '   ', nodeEnv: undefined }).ok).toBe(
      false,
    )
  })

  it('refuses when there is no connection string at all', () => {
    expect(
      checkSeedTarget({ connectionString: undefined, allowed: DEV_ID, nodeEnv: undefined }).ok,
    ).toBe(false)
  })

  it('refuses a connection string it cannot identify rather than guessing', () => {
    // A password containing characters that break URL parsing is realistic here.
    expect(
      checkSeedTarget({ connectionString: 'postgres//broken', allowed: DEV_ID, nodeEnv: undefined })
        .ok,
    ).toBe(false)
  })

  it('still refuses when NODE_ENV says production', () => {
    expect(
      checkSeedTarget({ connectionString: DEV, allowed: DEV_ID, nodeEnv: 'production' }).ok,
    ).toBe(false)
  })
})

describe('assertSeedTarget', () => {
  it('returns the identity and does not throw when the target is allowed', () => {
    expect(assertSeedTarget({ DATABASE_URL: DEV, SEED_ALLOWED_DB: DEV_ID })).toBe(DEV_ID)
  })

  it('throws when the target is not allowed', () => {
    expect(() => assertSeedTarget({ DATABASE_URL: PROD, SEED_ALLOWED_DB: DEV_ID })).toThrow(
      /Refusing to seed/,
    )
  })

  it('names the target so the reader can see what went wrong', () => {
    expect(() => assertSeedTarget({ DATABASE_URL: PROD, SEED_ALLOWED_DB: DEV_ID })).toThrow(
      new RegExp(PROD_ID),
    )
  })

  /**
   * The message must not hand over a working override.
   *
   * An error reading `SEED_ALLOWED_DB=<production identity>` is a copy-paste
   * route around the guard, offered at the exact moment somebody is in a hurry
   * and has just been interrupted. The identity may be shown; it may not be
   * shown as a line to paste.
   */
  it('does not offer the rejected target as a setting to paste', () => {
    let message = ''
    try {
      assertSeedTarget({ DATABASE_URL: PROD, SEED_ALLOWED_DB: DEV_ID })
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).toContain(PROD_ID)
    expect(message).not.toContain(`SEED_ALLOWED_DB=${PROD_ID}`)
  })

  it('names the action, so a refused reset does not read as a refused seed', () => {
    expect(() =>
      assertSeedTarget({ DATABASE_URL: PROD, SEED_ALLOWED_DB: DEV_ID }, 'reset'),
    ).toThrow(/Refusing to reset/)
  })

  /**
   * Reset looks like the safer script because it only touches manifest ids, and
   * that is exactly the misconception worth correcting in the message: ids are
   * per database, so against the wrong one it deletes whatever sits there.
   */
  it('explains that manifest ids mean nothing in another database', () => {
    let message = ''
    try {
      assertSeedTarget({ DATABASE_URL: PROD, SEED_ALLOWED_DB: DEV_ID }, 'reset')
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toMatch(/ids/i)
    expect(message).toMatch(/real work/i)
  })

  it('does not offer a paste-ready setting when nothing is configured either', () => {
    let message = ''
    try {
      assertSeedTarget({ DATABASE_URL: PROD })
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).not.toContain(`SEED_ALLOWED_DB=${PROD_ID}`)
  })
})
