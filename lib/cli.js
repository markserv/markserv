#!/usr/bin/env node

'use strict'

const path = require('path')
const flags = require('commander')

const markserv = require(path.join(__dirname, 'server'))
const pkg = require(path.join('..', 'package.json'))
const splash = require(path.join(__dirname, 'splash'))

const run = args => {
	splash(args)

	const cwd = process.cwd()
	/* eslint-disable-next-line no-mixed-operators */
	flags.dir = args && args.dir || cwd
	flags.$pathProvided = true

	console.log(flags.dir)

	flags.version(pkg.version)
		.usage('<file/dir>')
		.option('-p, --port [type]', 'HTTP port [port]', 8642)
		.option('-l, --livereloadport [type]', 'LiveReload port [livereloadport]', 35729)
		.option('-i, --silent [type]', 'Silent (no logs to CLI)', false)
		.option('-a, --address [type]', 'Serve on ip/address [address]', 'localhost')
		.option('-v, --verbose', 'verbose output')
		.action(serverPath => {
			flags.$pathProvided = true
			if (serverPath[0]) {
				flags.dir = path.normalize(path.join(cwd, serverPath))
			}
			if (serverPath[0] === '/') {
				flags.dir = serverPath
			}
		}).parse(process.argv)

	// if (!Array.isArray(args) && typeof args === 'object') {
	// 	Reflect.ownKeys(args).forEach(key => {
	// 		flags[key] = args[key]
	// 	})
	// }

	// console.log(flags)

	markserv.init(flags)
}

const cli = !module.parent

if (cli) {
	run()
} else {
	module.exports = {run}
}

