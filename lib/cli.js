#!/usr/bin/env node

'use strict'

const path = require('path')
const flags = require('commander')

const markserv = require(path.join(__dirname, 'server'))
const pkg = require(path.join('..', 'package.json'))
const splash = require(path.join(__dirname, 'splash'))

const validateServerPath = (serverPath, cwd) => {
	flags.$pathProvided = true
	if (serverPath[0]) {
		flags.dir = path.normalize(path.join(cwd, serverPath))
	}

	if (serverPath[0] === '/' || serverPath[0] === '.') {
		flags.dir = path.normalize(path.join(cwd, serverPath))
	}
}

const argsToFlags = (args, cwd) => flags.version(pkg.version)
	.usage('<file/dir>')
	.option('-p, --port [type]', 'HTTP port [port]', 8642)
	.option('-l, --livereloadport [type]', 'LiveReload port [livereloadport]', 35729)
	.option('-i, --silent [type]', 'Silent (no logs to CLI)', false)
	.option('-a, --address [type]', 'Serve on ip/address [address]', 'localhost')
	.option('-v, --verbose', 'verbose output')
	.action(serverPath => validateServerPath(serverPath, cwd))
	.parse(args)

const run = argsOveride => {
	splash(argsOveride)

	const cwd = process.cwd()
	/* eslint-disable-next-line no-mixed-operators */
	flags.dir = argsOveride && argsOveride.dir || cwd
	flags.$pathProvided = true

	if (argsOveride === undefined) {
		argsToFlags(process.argv, cwd)
	} else {
		Reflect.ownKeys(argsOveride).forEach(key => {
			flags[key] = argsOveride[key]
		})
		validateServerPath(flags.dir, cwd)
	}

	return markserv.init(flags)
}

const cli = !module.parent

if (cli) {
	// Run without args (process.argv will be picked up)
	run()
} else {
	module.exports = {run}
}

