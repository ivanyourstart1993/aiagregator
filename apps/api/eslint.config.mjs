import config from '@aiagg/eslint-config/nest.js';

export default [
  ...config,
  {
    // NestJS uses constructor parameter type annotations as DI tokens via
    // `emitDecoratorMetadata`. The default `consistent-type-imports` rule
    // cannot distinguish that pattern from genuinely type-only usage and
    // would force `import type` for tokens we actually need at runtime.
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
