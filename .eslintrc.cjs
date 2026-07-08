/**
 * 边界铁律（对齐 CLAUDE.md 第 1 节）：
 *  - platform/** 禁止 import modules/**
 *  - modules/mX 禁止 import modules/mY（跨模块只走事件或 platform 服务）
 *  - web/mobile/h5 禁止写业务逻辑（本轮未建这些包，规则先就位）
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint', 'boundaries'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  settings: {
    'import/resolver': {
      typescript: { alwaysTryTypes: true },
    },
    'boundaries/elements': [
      { type: 'platform', pattern: 'src/platform/*', mode: 'folder', capture: ['group'] },
      { type: 'module', pattern: 'src/modules/*', mode: 'folder', capture: ['mod'] },
      { type: 'shared', pattern: 'src/**' },
    ],
  },
  rules: {
    'boundaries/element-types': [
      'error',
      {
        default: 'allow',
        rules: [
          {
            from: 'platform',
            disallow: ['module'],
            message: 'AP 边界：platform 禁止 import modules（platform 不反向依赖业务模块）',
          },
          {
            from: 'module',
            disallow: ['module'],
            message: 'AP 边界：modules/mX 禁止 import modules/mY（跨模块只走事件或 platform 服务）',
            // 允许同一模块内部互引：capture 相同 mod 时放行
            allow: [['module', { mod: '${from.mod}' }]],
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: ['**/*.mjs', '**/*.test.mjs'],
      env: { node: true },
    },
  ],
  ignorePatterns: ['**/dist/**', '**/node_modules/**', '**/*.d.ts'],
};
