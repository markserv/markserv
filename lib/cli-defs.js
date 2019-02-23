module.exports = {
	flags: {
		port: {
			type: 'number',
			alias: 'p',
			default: '8642'
		},

		livereloadport: {
			type: ['number', 'boolean'],
			alias: 'b',
			default: 35729
		},

		address: {
			type: 'string',
			alias: 'a',
			default: 'localhost'
		},

		silent: {
			type: 'boolean',
			alias: 's',
			default: false
		},

		verbose: {
			type: 'boolean',
			alias: 'v',
			default: false
		}
	}
}
