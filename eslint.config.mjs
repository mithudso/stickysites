// Semantic errors only. Syntax remains a separate gate for every maintained JS file.
export default [
  { ignores: ['node_modules/**', 'coverage/**', 'dist/**', 'docs/**', '.git/**', '.remember/**'] },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      'no-unreachable': 'error',
      'valid-typeof': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-else-if': 'error',
      'no-dupe-class-members': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'no-invalid-regexp': 'error',
      'no-unsafe-finally': 'error',
    },
  },
  {
    files: ['src/content/**/*.js', 'src/shared/settings.js', 'src/shared/network.js', 'popup.js', 'popout.js'],
    languageOptions: { sourceType: 'script' },
  },
  { files: ['scripts/generate-icons.js'], languageOptions: { sourceType: 'commonjs' } },
];
