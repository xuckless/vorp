// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Vendored third-party engines stay as upstream wrote them; they are not linted.
    ignores: ['dist/*', 'src/ui/effects/vendor/**'],
  },
  {
    // Effects are reached through slots only (AGENTS.md, UI).
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/ui/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@/ui/effects', '@/ui/effects/*', '**/vendor/**'], message: 'Render effects through @/ui/slots.' }] },
      ],
    },
  },
]);
