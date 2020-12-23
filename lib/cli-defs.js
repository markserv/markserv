module.exports = {
	flags: {
		port: {
			alias: 'p',
			default: '8642'
		},

		livereloadport: {
			alias: 'l',
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

        browser: {
            alias: 'b',
            default: true
        }
	}
}
