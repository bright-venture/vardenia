/**
 * Refuses to let the development seed write to a database that is not the
 * development one.
 *
 * The guard this replaces was `NODE_ENV === 'production'`, which never fired.
 * `pnpm seed` runs through tsx and leaves NODE_ENV unset, so it protected
 * against a case that cannot occur while missing the one that can: pointing
 * DATABASE_URL at production to run a migration, forgetting to point it back,
 * and seeding six fictional businesses into the live directory.
 *
 * Three things shape the design.
 *
 * It has to run before `getPayload`. With NODE_ENV unset, `push` is true, so
 * merely initialising Payload against production would sync the schema - a
 * worse outcome than the fake rows. That means the only evidence available is
 * the connection string. Nothing here may touch the database.
 *
 * It cannot be a static flag. A marker like SEED_TARGET=development stays set
 * when someone edits DATABASE_URL, so it would pass at exactly the moment it
 * needed to fail. The check has to name *which* database, not which intent.
 *
 * It fails closed. Unset means refuse, not allow. A guard that has to be
 * configured correctly to work is a guard that is off on every machine where
 * somebody skipped a step.
 */

/**
 * Stable identity of a database, with the password removed.
 *
 * The host alone is useless on Supabase: every project in a region shares one
 * pooler hostname, so dev and prod differ only in the username, which carries
 * the project ref (`postgres.<ref>`). Username and database name are therefore
 * both part of the identity.
 *
 * The port is deliberately excluded. The same project is reached on 6543 for
 * normal work and 5432 for migrations, and those are the same database - a
 * guard that called them different would train people to override it.
 *
 * Returns null for anything unparseable, which the caller treats as unsafe. A
 * password containing characters that break URL parsing is a real possibility
 * here, and guessing at a malformed string is not worth it.
 */
export function databaseIdentity(connectionString: string | undefined): string | null {
  if (!connectionString) return null

  let url: URL
  try {
    url = new URL(connectionString)
  } catch {
    return null
  }

  if (!url.hostname) return null

  const user = decodeURIComponent(url.username)
  const database = url.pathname.replace(/^\//, '')
  if (!user || !database) return null

  return `${user}@${url.hostname}/${database}`.toLowerCase()
}

export type SeedTargetCheck =
  { ok: true; identity: string } | { ok: false; reason: string; identity: string | null }

export interface SeedTargetInput {
  connectionString: string | undefined
  /** Identity the seed is permitted to write to, from SEED_ALLOWED_DB. */
  allowed: string | undefined
  nodeEnv: string | undefined
}

/**
 * Whether the seed may write to this database.
 *
 * Split from the throwing wrapper so the decision can be tested without
 * touching process.env or a real connection.
 */
export function checkSeedTarget({
  connectionString,
  allowed,
  nodeEnv,
}: SeedTargetInput): SeedTargetCheck {
  const identity = databaseIdentity(connectionString)

  // Kept from the original guard. It never fires on its own because tsx leaves
  // NODE_ENV unset, but it costs nothing and it is correct when something does
  // set it.
  if (nodeEnv === 'production') {
    return { ok: false, reason: 'NODE_ENV is production.', identity }
  }

  if (!connectionString) {
    return { ok: false, reason: 'DATABASE_URL is not set.', identity: null }
  }

  if (!identity) {
    return {
      ok: false,
      reason: 'DATABASE_URL could not be parsed, so the target cannot be identified.',
      identity: null,
    }
  }

  const expected = allowed?.trim().toLowerCase()
  if (!expected) {
    return { ok: false, reason: 'SEED_ALLOWED_DB is not set.', identity }
  }

  if (expected !== identity) {
    return {
      ok: false,
      reason:
        `DATABASE_URL points at a database the seed is not allowed to write to.\n` +
        `  allowed: ${expected}\n` +
        `  target:  ${identity}`,
      identity,
    }
  }

  return { ok: true, identity }
}

/**
 * The three variables this reads, rather than the whole environment.
 *
 * Narrower than NodeJS.ProcessEnv on purpose: it states the dependency, and it
 * lets a test describe a situation with an object literal instead of casting a
 * partial environment into a type that requires NODE_ENV.
 */
export interface SeedEnv {
  DATABASE_URL?: string
  SEED_ALLOWED_DB?: string
  NODE_ENV?: string
}

/**
 * Throws unless the current environment points at the permitted database.
 *
 * The message names the current target but never offers it as a line to paste
 * into .env. That distinction is the whole value of the guard: the failure
 * being caught is DATABASE_URL pointing at production, and a message reading
 * "set SEED_ALLOWED_DB=<production>" would be a copy-paste route around the
 * check, arriving at the exact moment somebody is in a hurry. The reader has to
 * look at the identity below and decide it is their development database.
 */
export function assertSeedTarget(
  env: SeedEnv = process.env,
  action: 'seed' | 'reset' = 'seed',
): string {
  const result = checkSeedTarget({
    connectionString: env.DATABASE_URL,
    allowed: env.SEED_ALLOWED_DB,
    nodeEnv: env.NODE_ENV,
  })

  if (result.ok) return result.identity

  /**
   * Reset is the more dangerous of the two, which is not obvious.
   *
   * It looks safer because it only touches ids recorded in the manifest. But
   * ids are per database: a manifest written against dev lists small integers,
   * and production has documents at those same integers. Pointed at the wrong
   * database, "delete exactly what I created" becomes "delete whatever happens
   * to sit at those ids".
   */
  const stakes =
    action === 'reset'
      ? [
          'Reset deletes the ids recorded in the seed manifest. Those ids mean',
          'nothing in another database - production has its own documents at the',
          'same numbers - so run against the wrong one it deletes real work.',
        ]
      : [
          'The seed writes invented businesses, articles and scans, which must',
          'never reach production.',
        ]

  const lines = [
    `Refusing to ${action}.`,
    '',
    result.reason,
    '',
    `DATABASE_URL currently points at: ${result.identity ?? '(unidentifiable)'}`,
    '',
    ...stakes,
    '',
    'This runs only against a database named in .env as:',
    '',
    '  SEED_ALLOWED_DB=<user>@<host>/<database>',
    '',
    'Check the target above really is your development database, then write that',
    'identity out. If it is production, change DATABASE_URL instead.',
  ]

  throw new Error(lines.join('\n'))
}
