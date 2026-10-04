#!/usr/bin/env node

'use strict'

const path = require('path')
const fs = require('fs')
const meow = require('meow')

const markserv = require(path.join(__dirname, 'server'))
const splash = require(path.join(__dirname, 'splash'))
const cliHelp = String(fs.readFileSync(path.join(__dirname, './cli-help.txt')))
const cliDefs = require('./cli-defs')

const cliOpts = meow(cliHelp, cliDefs)

const validateServerPath = (serverPath, cwd) => {
	return path.resolve(cwd, serverPath)
}

const EXPORT_USAGE = 'Usage: markserv export <dir> <target>\n' +
	'\n' +
	'  <dir>     the directory to export\n' +
	'  <target>  an output directory (unpacked bundle) or a .zip path\n'

const run = opts => {
	splash(opts.flags)

	const cwd = process.cwd()

	// markserv export <dir> <target> — offline static site export
	// (no server, ws, or watcher; unaffected by --no-exports)
	if (opts.input[0] === 'export') {
		const source = opts.input[1]
		const target = opts.input[2]

		if (!source || !target) {
			console.error(EXPORT_USAGE)
			process.exit(2)
		}

		const dir = validateServerPath(source, cwd)
		let stat
		try {
			stat = fs.statSync(dir)
		} catch (error) {
			console.error('markserv: export: no such directory: ' + source)
			process.exit(1)
		}

		if (!stat.isDirectory()) {
			console.error('markserv: export: not a directory: ' + source)
			process.exit(1)
		}

		opts.flags.dir = dir
		markserv.exportSite(opts.flags, validateServerPath(target, cwd))
			.then(() => process.exit(0))
			.catch(error => {
				console.error('markserv: ' + error.message)
				process.exit(1)
			})
		return
	}

	let dir = opts.input[0]
	if (dir === undefined) {
		dir = cwd
	}

	const validatedServerPath = validateServerPath(dir, cwd)
	opts.flags.dir = validatedServerPath
	opts.flags.$pathProvided = true
	opts.flags.$openLocation = true

	return markserv.init(opts.flags)
}

const cli = !module.parent

if (cli) {
	// Run without args (process.argv will be picked up)
	run(cliOpts)
} else {
	module.exports = {run}
}
