// ESLint (flat config): `npm run lint`. Server and scripts run on Node; public/ and site/ run in the browser.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'local/', 'data/', '_site/', 'dist/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2024, sourceType: 'module' },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
      'no-implicit-globals': 'error',
      'no-shadow-restricted-names': 'error',
    },
  },
  { files: ['src/**/*.js', 'scripts/**/*.js', 'test/**/*.js', '*.js'], languageOptions: { globals: { ...globals.node } } },
  { files: ['public/**/*.js', 'site/**/*.js', 'docs/**/*.js'], languageOptions: { globals: { ...globals.browser } } },
  { files: ['public/pcm-worklet.js'], languageOptions: { globals: { ...globals.audioWorklet } } },
];
