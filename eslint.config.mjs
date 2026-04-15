import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import next from 'eslint-config-next';
import boundaries from 'eslint-plugin-boundaries';

export default tseslint.config(
  { ignores: ['.next/**', 'dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  // Apply type-checked TypeScript rules only to TS/TSX files
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx'],
  })),
  // eslint-config-next spread (handles Next.js specific rules)
  ...next,
  {
    // Type-aware parser options scoped to TS/TSX files only
    // Worker files use tsconfig.worker.json — allow them via defaultProject
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['src/worker/*.ts', 'src/shared/*.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'app',              pattern: 'src/app/**' },
        { type: 'shared',           pattern: 'src/shared/**' },
        { type: 'module-domain',    pattern: 'src/modules/*/domain/**' },
        { type: 'module-app',       pattern: 'src/modules/*/application/**' },
        { type: 'module-infra',     pattern: 'src/modules/*/infrastructure/**' },
        { type: 'module-present',   pattern: 'src/modules/*/presentation/**' },
        { type: 'module-public',    pattern: 'src/modules/*/index.ts' },
        { type: 'worker',           pattern: 'src/worker/**' },
        { type: 'tests',            pattern: 'tests/**' },
      ],
      'boundaries/ignore': ['**/*.test.ts', '**/*.spec.ts'],
    },
    rules: {
      'boundaries/dependencies': ['error', {
        default: 'disallow',
        rules: [
          { from: 'app',           allow: ['shared', 'module-public', 'module-present'] },
          { from: 'worker',        allow: ['shared', 'module-public'] },
          { from: 'shared',        allow: ['shared'] },
          { from: 'module-domain', allow: ['module-domain'] },
          { from: 'module-app',    allow: ['module-app', 'module-domain', 'shared'] },
          { from: 'module-infra',  allow: ['module-infra', 'module-app', 'module-domain', 'shared'] },
          { from: 'module-present',allow: ['module-present', 'module-app', 'module-domain', 'shared'] },
          { from: 'module-public', allow: ['module-app', 'module-domain', 'module-present', 'shared'] },
          { from: 'tests',         allow: ['app', 'shared', 'module-public', 'module-domain', 'module-app', 'module-infra', 'module-present', 'worker', 'tests'] },
        ],
      }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
);
