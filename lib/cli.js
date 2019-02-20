#!/usr/bin/env node

'use strict'

const path = require('path')
const meow = require('meow')

const markserv = require(path.join(__dirname, 'server'))
const splash = require(path.join(__dirname, 'splash'))

const cliOpts = meow(`
Usage
$ markserv <file/dir>
$ readme (serve closest README.md file)

Options
	--port, -p,  HTTP port [port] (80)
	--livereloadport, -l  LiveReload port [port/false] (35729)
	--browser, -b  Launch browser (true)
	--silent, -i  Silent (false)
	--address, -a  Serve on ip/address [address] (localhost)
	--verbose, -v  Verbose output (false)
`, {
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
})

const validateServerPath = (serverPath, cwd) => {
	let validatedPath

	if (serverPath[0]) {
		validatedPath = path.normalize(path.join(cwd, serverPath))
	}

	if (serverPath[0] === '/' || serverPath[0] === '.') {
		validatedPath = path.normalize(path.join(cwd, serverPath))
	}

	return validatedPath
}

const run = opts => {
	splash(opts.flags)

	const cwd = process.cwd()

	let dir = opts.input[0]
	if (dir === undefined) {
		dir = cwd
	}

	const validatedServerPath = validateServerPath(dir, cwd)
	opts.flags.dir = validatedServerPath

	return markserv.init(opts.flags)
}

const cli = !module.parent

if (cli) {
	// Run without args (process.argv will be picked up)
	run(cliOpts)
} else {
	module.exports = {run}
}
