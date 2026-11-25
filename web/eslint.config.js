// ESLint flat config — Glimpse web frontend.
// Recommended rules only, no stylistic enforcement (formatting is not gated).
import js from '@eslint/js'
import svelte from 'eslint-plugin-svelte'

export default [
  js.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    ignores: ['dist/', 'node_modules/', '*.config.js'],
  },
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        fetch: 'readonly',
        IntersectionObserver: 'readonly',
        DOMParser: 'readonly',
        getComputedStyle: 'readonly',
        MutationObserver: 'readonly',
        performance: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        history: 'readonly',
        location: 'readonly',
        navigator: 'readonly',
        URL: 'readonly',
        WheelEvent: 'readonly',
        KeyboardEvent: 'readonly',
        Error: 'readonly',
        URLSearchParams: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // {@html} is used for the markdown render only; its input is always
      // DOMPurify-sanitized (web/src/lib/diagrams.js sanitizeHtml) and never
      // contains unsanitized diagram output. Suppressed project-wide with intent.
      'svelte/no-at-html-tags': 'off',
    },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        svelteConfig: './svelte.config.js',
      },
    },
  },
]
