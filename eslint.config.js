const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');

module.exports = [
  js.configs.recommended,
  {
    files: ['scripts/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        // Azure DevOps Extension SDK globals
        VSS: 'readonly',
        IPromise: 'readonly',
        IExternalDialog: 'readonly',
        IHostDialogOptions: 'readonly',
        IHostDialogService: 'readonly',
        IContributedMenuItem: 'readonly',
        JSX: 'readonly',
        document: 'readonly',
        console: 'readonly',
        // Browser globals
        window: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // Basic rules - relaxed for Azure DevOps extensions
      'no-console': 'warn',
      'no-debugger': 'error',
      'prefer-const': 'warn', // Change to warn instead of error
      'no-var': 'warn', // Change to warn instead of error
      'no-unused-vars': 'off', // Turn off base rule as we use TypeScript version
      'no-undef': 'warn', // Change to warn for Azure DevOps globals
      
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }], // Change to warn
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '*.vsix',
      'webpack.*.js',
      'package/**',
    ],
  },
];
