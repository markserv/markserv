#!/usr/bin/env node

'use strict'

require('./splash')()

const path = require('path')
const flags = require('commander')

const markserv = require(path.join(__dirname, 'server'))
const pkg = require(path.join('..', 'package.json'))

const cwd = process.cwd()

flags.dir = cwd

flags.version(pkg.version)
	.usage('<file/dir>')
	.option('-p, --port [type]', 'HTTP port [port]', 8642)
	.option('-l, --livereloadport [type]', 'LiveReload port [livereloadport]', 35729)
	.option('-i, --silent [type]', 'Silent (no logs to CLI)', false)
	.option('-a, --address [type]', 'Serve on ip/address [address]', 'localhost')
	.option('-v, --verbose', 'verbose output')
	.action(serverPath => {
		flags.$pathProvided = true
		if (flags.dir[0] === '/') {
			flags.dir = serverPath
		} else {
			flags.dir = path.normalize(path.join(cwd, serverPath))
		}
	}).parse(process.argv)

markserv.init(flags)
