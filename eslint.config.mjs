import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['out/', 'dist/', 'node_modules/', 'tools/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
  {
    /**
     * The two hook rules, named one by one rather than through the plugin's
     * `recommended-latest` preset (MAR-2545).
     *
     * v7 of the plugin ships the React Compiler rule set — roughly thirty rules
     * about memoization, purity and effect shape — and turning that on wholesale
     * would bury the two rules this exists for under a codebase-wide audit
     * nobody asked for. These two can be adopted today; the rest is a decision,
     * not a default.
     *
     * `rules-of-hooks` is an error because every violation is a real bug and
     * they are rare. `exhaustive-deps` is a warning because it is not: a stale
     * closure and a deliberately-narrow dependency array look identical to the
     * rule, and mass-editing dependency arrays turns mount-once effects into
     * loops. The warnings are a burn-down list to work through attended, not a
     * gate.
     *
     * Applied to every file rather than `src/` alone so a React file that lands
     * outside the renderer tree is still covered; the rules simply do not fire
     * on code without hooks.
     */
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
)
