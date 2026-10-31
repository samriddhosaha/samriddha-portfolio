import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', '.data/', 'qa/', 'audit/', 'test-results/', 'drizzle/', 'tools/**/*.cjs'] },
  js.configs.recommended,
  { files: ['lib/**', 'api/**', 'scripts/**', 'dev/**', 'tests/unit/**', 'tools/**/*.mjs', 'drizzle.config.js', 'eslint.config.js'], languageOptions: { globals: globals.node } },
  { files: ['assets/js/**'], languageOptions: { sourceType: 'script', globals: globals.browser } },
  { rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_|^(request|params)$', caughtErrors: 'none', ignoreRestSiblings: true }] } },
];
