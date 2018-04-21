#!/usr/bin/env node

'use strict'

const path = require('path')
const flags = require('commander')
const markserv = require('./server')

const pkg = require('./package.json')

const githubStylePath = path.join(__dirname, 'less/github.less')

const cwd = process.cwd()

flags.version(pkg.version)
	.usage('<file>')
	.option('-d, --dir [type]', 'Document root directory [dir]', cwd)
	.option('-p, --port [type]', 'HTTP port [port]', 8642)
	.option('-l, --livereloadport [type]', 'LiveReload port [livereloadport]', 35729)
	.option('-i, --silent [type]', 'Silent (no logs to CLI)', false)
	.option('-a, --address [type]', 'Serve on ip/address [address]', 'localhost')
	.option('-s, --less [type]', 'Path to Less styles [less]', githubStylePath)
	.option('-v, --verbose', 'verbose output')
	.action(serverPath => {
		flags.dir = path.normalize(path.join(cwd, serverPath))
	}).parse(process.argv)

flags.$markserv = {
	githubStylePath
}

markserv.init(flags)
