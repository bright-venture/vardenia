import type { CollectionConfig } from 'payload'

/**
 * One row per rate-limit bucket, so the limit means something on serverless.
 *
 * # Why this table exists
 *
 * `lib/rate-limit` kept its counters in a module-level Map. That works on one
 * long-lived server and does almost nothing on Netlify, where each warm
 * container holds its own copy: the real budget is the configured one
 * multiplied by however many instances happen to be running, and an attacker
 * gets a fresh allowance simply by arriving at a different one.
 *
 * Postgres is the only state every instance already shares, so the counter goes
 * here. Only the tight auth budget uses it - login, sign-up, password reset and
 * the rest. The general budget stays in memory, because putting a round trip in
 * front of every API request would cost more than it protects.
 *
 * # Why it is a collection rather than a bare table
 *
 * Nothing here needs Payload. It is a collection so that the schema tooling
 * knows the table exists: development and CI build their schema with drizzle
 * push from the collection list, and a table push has never heard of is a table
 * push is entitled to remove. Declaring it is what stops that.
 *
 * Every row is written by raw SQL in lib/rate-limit-store, in one atomic
 * statement. Reading or writing it through Payload would need two round trips
 * and would race exactly where it must not.
 */
export const RateLimits: CollectionConfig = {
  slug: 'rate-limits',
  labels: { singular: 'Rate Limit', plural: 'Rate Limits' },

  admin: {
    // Machine state. Nothing on this screen would help anybody, and a table that
    // grows a row per address is noise in a sidebar meant for editorial work.
    hidden: true,
    useAsTitle: 'key',
  },

  /**
   * Closed to everyone, including staff.
   *
   * The route handlers write with `overrideAccess`, the same arrangement as scan
   * events. A rate-limit counter that can be edited through an API is not a rate
   * limit, and one that can be read tells an attacker exactly how much budget
   * they have left.
   */
  access: {
    read: () => false,
    create: () => false,
    update: () => false,
    delete: () => false,
  },

  // No hooks. This table is written thousands of times more often than anything
  // else here, and a hook would run on every request that touches a login form.
  timestamps: false,

  fields: [
    {
      name: 'key',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { description: 'Budget and caller, hashed. Never an address in the clear.' },
    },
    {
      name: 'count',
      type: 'number',
      required: true,
      defaultValue: 0,
    },
    {
      name: 'resetAt',
      type: 'date',
      required: true,
      index: true,
      admin: { description: 'When this window ends and the count starts again.' },
    },
  ],
}
