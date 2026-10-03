module.exports = {
	flags: {
		// No default: init() picks the next free port from 8642 when
		// --port is omitted, and fails if an explicit --port is taken.
		port: {
			alias: 'p'
		},

		hotreload: {
			alias: 'l',
			type: 'boolean',
			default: true
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
		},

		templates: {
			type: 'boolean',
			default: false
		},

		mermaidLoose: {
			type: 'boolean',
			default: false
		}
	}
}
