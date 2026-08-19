import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'
import reactHooks from 'eslint-plugin-react-hooks'

/**
 * ESLint 9 flat config, replacing .eslintrc.json and `next lint`.
 *
 * `next lint` is deprecated and disappears in Next 16. Doing this now rather
 * than during the framework upgrade keeps the two problems separate - and lint
 * was already painful to get working here once (there was no config anywhere,
 * so CI dropped into an interactive prompt and hung).
 *
 * eslint-config-next 15 still ships eslintrc-format configs rather than flat
 * ones, so FlatCompat translates them. That is exactly what Next's own codemod
 * produces. When eslint-config-next 16 lands with native flat support, the
 * compat layer and the @eslint/eslintrc dependency both come out.
 */
const compat = new FlatCompat({
  baseDirectory: path.dirname(fileURLToPath(import.meta.url)),
})

const config = [
  {
    /**
     * Generated or vendored, and not ours to fix.
     *
     * Flat config ignores node_modules by default but nothing else, so
     * everything `next lint` skipped implicitly has to be listed here. Build
     * output especially: linting .next means linting Next's own compiled
     * bundles, which produces thousands of errors about code nobody wrote.
     */
    ignores: [
      '.next/**',
      '.turbo/**',
      'coverage/**',
      'src/payload-types.ts',
      'src/migrations/**',
      'src/app/(payload)/admin/importMap.js',
      // Rewritten by Next on every build, and its triple-slash reference is
      // exactly what next/typescript forbids. Not a file anyone can fix.
      'next-env.d.ts',
    ],
  },

  /**
   * eslint-config-next, minus its own copy of the react-hooks plugin.
   *
   * `next build` runs a lint pass of its own, and it resolved
   * eslint-plugin-react-hooks 7 while this compat layer resolved 5. Both
   * versions are in the tree. The two passes therefore disagreed about which
   * rules exist: `pnpm lint` was clean, `next build` was clean on my machine,
   * and the Netlify build failed on `react-hooks/purity` and
   * `react-hooks/set-state-in-effect` - neither of which v5 has.
   *
   * Both findings were real, a `Date.now()` during render and a setState inside
   * an effect, so the code was what changed. This stops the next one costing a
   * round trip through CI to discover.
   *
   * Dropping the plugin here rather than registering v7 under a second name, so
   * that a rule fires under the same name it has in the build log. Two plugins
   * cannot claim `react-hooks`, and the version that reports more is the one
   * worth keeping.
   */
  ...compat.extends('next/core-web-vitals', 'next/typescript').map((entry) => {
    if (!entry.plugins?.['react-hooks']) return entry
    const plugins = { ...entry.plugins }
    delete plugins['react-hooks']
    return { ...entry, plugins }
  }),

  /**
   * `configs.flat['recommended-latest']`, not `configs['recommended-latest']`.
   *
   * The top-level entries in v7 are still eslintrc-format - their `plugins` is
   * an array of names - and handing one to flat config fails with a message
   * about plugins needing to be an object. The `flat` namespace holds the same
   * rule sets in the shape ESLint 9 wants.
   */
  reactHooks.configs.flat['recommended-latest'],
]

export default config
