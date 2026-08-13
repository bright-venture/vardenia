// ESLint 9 flat config. The `lint` script runs bare `eslint`, which since v9
// looks for this file and nothing else - a missing one is a hard error, not a
// fallback to defaults, which is how CI ended up failing here.
import tseslint from 'typescript-eslint'

export default tseslint.config({ ignores: ['dist', '.turbo'] }, ...tseslint.configs.recommended, {
  rules: {
    // Unused function arguments are usually deliberate here (matching a
    // signature); unused *variables* still fail.
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
})
