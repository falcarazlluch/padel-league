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
          allowDefaultProject: [
            'src/worker/*.ts',
            'src/worker/handlers/*.ts',
            'src/shared/*.ts',
            'vitest.config.ts',
            'vitest.integration.config.ts',
            'tests/unit/shared/*.ts',
            'tests/unit/shared/auth/*.ts',
            'tests/unit/*.ts',
            'tests/integration/*.ts',
            'tests/integration/helpers/*.ts',
            'prisma/seed.ts',
          ],
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 30,
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
      // App-layer code imports from modules only via their public facade (module-public =
      // src/modules/<mod>/index.ts). This is tighter than spec §6.2's table (which reads
      // "app → application: ✅"), but aligns with §6.2's footnote "La comunicación entre
      // módulos pasa por el index.ts que expone una API mínima documentada." Keep it this way.
      'boundaries/dependencies': ['error', {
        default: 'disallow',
        rules: [
          { from: { type: 'app' },            allow: [{ to: { type: 'shared' } }, { to: { type: 'module-public' } }, { to: { type: 'module-present' } }] },
          { from: { type: 'worker' },         allow: [{ to: { type: 'shared' } }, { to: { type: 'module-public' } }] },
          { from: { type: 'shared' },         allow: [{ to: { type: 'shared' } }] },
          { from: { type: 'module-domain' },  allow: [{ to: { type: 'module-domain' } }] },
          { from: { type: 'module-app' },     allow: [{ to: { type: 'module-app' } }, { to: { type: 'module-domain' } }, { to: { type: 'shared' } }] },
          { from: { type: 'module-infra' },   allow: [{ to: { type: 'module-infra' } }, { to: { type: 'module-app' } }, { to: { type: 'module-domain' } }, { to: { type: 'shared' } }] },
          { from: { type: 'module-present' }, allow: [{ to: { type: 'module-present' } }, { to: { type: 'module-app' } }, { to: { type: 'module-domain' } }, { to: { type: 'shared' } }] },
          { from: { type: 'module-public' },  allow: [{ to: { type: 'module-app' } }, { to: { type: 'module-domain' } }, { to: { type: 'module-present' } }, { to: { type: 'shared' } }] },
          { from: { type: 'tests' },          allow: [{ to: { type: 'app' } }, { to: { type: 'shared' } }, { to: { type: 'module-public' } }, { to: { type: 'module-domain' } }, { to: { type: 'module-app' } }, { to: { type: 'module-infra' } }, { to: { type: 'module-present' } }, { to: { type: 'worker' } }, { to: { type: 'tests' } }] },
        ],
      }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
);
