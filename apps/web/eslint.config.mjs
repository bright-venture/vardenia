import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

/**
 * ESLint 9 flat config, replacing .eslintrc.json and `next lint`.
 *
 * `next lint` is gone in Next 16, and lint was already painful to get working
 * here once (there was no config anywhere, so CI dropped into an interactive
 * prompt and hung).
 */
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
      // The dev server's own output directory. Separate from .next so a
      // production build cannot corrupt a running dev server - see distDir in
      // next.config.ts. Linting it means linting Next's compiled bundles, and
      // it produced around nine thousand problems about code nobody wrote.
      '.next-dev/**',
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
   * eslint-config-next 16, in the flat format it now ships natively.
   *
   * Version 15 shipped eslintrc configs that FlatCompat had to translate, and
   * its own copy of the react-hooks plugin (v5) disagreed with the v7 that
   * `next build` resolved: `pnpm lint` was clean while the Netlify build failed
   * on `react-hooks/purity` and `react-hooks/set-state-in-effect`. Version 16
   * carries react-hooks 7 with those rules itself, so the compat layer and the
   * separately registered plugin both came out with the upgrade.
   */
  ...nextVitals,
  ...nextTypescript,
]

export default config
