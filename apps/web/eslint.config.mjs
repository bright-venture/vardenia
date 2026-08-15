import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

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

  ...compat.extends('next/core-web-vitals', 'next/typescript'),
]

export default config
