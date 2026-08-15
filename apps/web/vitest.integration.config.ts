import { defineConfig } from 'vitest/config'

/**
 * The integration suite, kept apart from the unit suite on purpose.
 *
 * `pnpm test` has to stay fast and require nothing: a couple of seconds, no
 * database, run constantly while working. The moment it needs Postgres, people
 * stop running it.
 *
 * These are the opposite trade. They seed a real database, drive the real REST
 * handler and run the real reporting SQL, and take minutes. Worth it for what
 * they prove, but only on demand and in CI:
 *
 *     pnpm --filter @vardenia/web test:integration
 *
 * DATABASE_URL must point at something disposable. In CI that is the PostGIS
 * service in the workflow, made fresh for the run and destroyed with the
 * machine. The suite cleans up after itself via the seed manifest, but never
 * aim it at Supabase.
 */
export default defineConfig({
  test: {
    include: ['src/integration/**/*.integration.test.ts'],

    // One database, shared. Two files seeding the same fixtures at the same time
    // would collide on the unique issue number and on each other's teardown.
    fileParallelism: false,

    // Seeding uploads images and inserts a few hundred rows.
    testTimeout: 120_000,
    hookTimeout: 300_000,
  },
})
