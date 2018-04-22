#!/usr/bin/env node

'use strict'

const path = require('path')
const flags = require('commander')
const markserv = require('./server')

const pkg = require('./package.json')

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
		flags.dir = path.normalize(path.join(cwd, serverPath))
	}).parse(process.argv)

markserv.init(flags)
