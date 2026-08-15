// Shared ESLint 9/10 flat config for the plain TypeScript packages
// (core, i18n, tokens, api-client).
//
// Each package still needs its own eslint.config.mjs re-exporting this one.
// Since v9, bare `eslint` looks for that file and nothing else - a missing one
// is a hard error rather than a fallback to defaults, which is how CI ended up
// failing here once already.
//
// The apps do not use this. Web extends next's config for the React and
// Next-specific rules, mobile extends expo's.
import tseslint from 'typescript-eslint'

export default tseslint.config({ ignores: ['dist', '.turbo'] }, ...tseslint.configs.recommended, {
  rules: {
    // Unused function arguments are usually deliberate here (matching a
    // signature); unused *variables* still fail.
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
})
