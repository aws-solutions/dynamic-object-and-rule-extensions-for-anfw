/* eslint-disable */
const path = require('path');
module.exports = {
    root: true,
    env: {
        node: true,
        es2020: true,
    },
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'prettier/@typescript-eslint',
        'plugin:prettier/recommended',
    ],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
    },
    ignorePatterns: ['lambda/**/*'],
    plugins: ['@typescript-eslint', 'header'],
    rules: {
        'header/header': [2, path.join(__dirname,  'LicenseHeader.txt')],

        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/no-inferrable-types': 'off',
        '@typescript-eslint/ban-ts-comment': 'off',
        '@typescript-eslint/no-unused-vars': [
            'warn',
            { argsIgnorePattern: '^_.*', varsIgnorePattern: '^_.*' },
        ],
        'no-undef': 0,
        'no-func-assign': 0,

        'padding-line-between-statements': [
            'error',
            {
                blankLine: 'always',
                prev: ['export', 'class'],
                next: '*',
            },
        ],
    },
};
