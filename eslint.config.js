// ESLint 9 flat config
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
	{
		// Apply to all TS source files under credentials/ and nodes/
		files: ['credentials/**/*.ts', 'nodes/**/*.ts'],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				project: './tsconfig.json',
				sourceType: 'module',
			},
		},
		plugins: {
			'@typescript-eslint': tseslint,
		},
		rules: {
			// Recommended TypeScript rules
			...tseslint.configs.recommended.rules,
			// Project-specific overrides
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/explicit-function-return-type': 'off',
			'no-console': 'warn',
		},
	},
	{
		// Global ignores
		ignores: ['dist/**', 'node_modules/**'],
	},
];
