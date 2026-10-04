module.exports = {
	flags: {
		port: {
			alias: 'p',
			default: '8642'
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
		},

		// --no-search disables the site search index and endpoint
		search: {
			alias: 'S',
			default: true
		},

		// --no-exports disables the export endpoint and the page
		// export menu (the CLI export is a local file operation and
		// is unaffected)
		exports: {
			alias: 'x',
			default: true
		}
	}
}
