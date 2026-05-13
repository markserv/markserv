export default {
	flags: {
		port: {
			shortFlag: 'p',
			default: '8642',
		},

		hotreload: {
			shortFlag: 'l',
			type: 'boolean',
			default: true,
		},

		address: {
			shortFlag: 'a',
			default: 'localhost',
		},

		silent: {
			shortFlag: 's',
			default: false,
		},

		verbose: {
			shortFlag: 'v',
			default: false,
		},

		theme: {
			default: 'dark',
		},

		light: {
			type: 'boolean',
			default: false,
		},

		synthwave: {
			type: 'boolean',
			default: false,
		},

		templates: {
			type: 'boolean',
			default: false,
		},
	},
};
