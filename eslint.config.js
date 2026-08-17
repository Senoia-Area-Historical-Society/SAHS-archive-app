import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // This codebase already marks deliberately-unused bindings with a leading
      // underscore — `mediaItems: _mediaItems` when a prop is destructured only to
      // keep it out of a rest spread, `(_e) => ...` for an unused event arg. The rule
      // does not honour that by default, so those intentional markers read as errors
      // and the genuine unused bindings were lost among them.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],

      // These two arrived with eslint-plugin-react-hooks v7, which folded the React
      // Compiler rules into `recommended` at error severity. Unlike rules-of-hooks —
      // which was reporting a real crash on every feature-gated page, see PR #12 —
      // these flag patterns that are suboptimal rather than broken, and fixing them
      // means changing behaviour. Kept visible as warnings so they can be worked
      // through deliberately; not silenced.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
])
