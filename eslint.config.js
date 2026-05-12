import eslintConfigXo from 'eslint-config-xo'

export default [

	...eslintConfigXo({semicolon: false}),

	{

		rules: {

			'import-x/no-anonymous-default-export': 'off',

			'unicorn/prefer-module': 'off',

			'n/prefer-global/process': 'off',

			'ava/no-invalid-modifier-chain': 'off',

			'unicorn/prevent-abbreviations': 'off',

			'ava/no-conditional-assertion': 'off',

			'require-unicode-regexp': 'off',

			'unicorn/import-style': 'off',

			'unicorn/empty-brace-spaces': 'off',

			'@stylistic/indent': 'off',

			'@stylistic/comma-dangle': 'off',

			'json/no-empty-keys': 'off'

		}

	}

]
