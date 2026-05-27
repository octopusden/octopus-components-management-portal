import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // Underscore-prefixed visual specs (e.g. _compare-vs-prototype.spec.ts)
  // are ad-hoc compare/debug tools — never gated by Playwright (see
  // playwright.config.ts) and never linted in the project gate.
  { ignores: ['dist', 'build', 'e2e/visual/_*.spec.ts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
          allowExportNames: ['GENERAL_TAB_FIELDS'],
        },
      ],
    },
  },
)
