module.exports = {
	flags: {
		port: {
			alias: 'p',
			default: '8642'
		},

		livereloadport: {
			alias: 'b',
			default: 35729
		},

		address: {
			alias: 'a',
			default: 'localhost'
		},

		silent: {
			alias: 's',
			default: false
		},

		verbose: {
			alias: 'v',
			default: false
		},

		theme: {
			default: 'dark'
		},

		light: {
			type: 'boolean',
			default: false
		},

		synthwave: {
			type: 'boolean',
			default: false
		}
	}
}
