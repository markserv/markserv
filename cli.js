#!/usr/bin/env node

'use strict'

const path = require('path')
const flags = require('commander')
const markserv = require('./server')

const pkg = require('./package.json')

const githubStylePath = path.join(__dirname, 'less/github.less')

flags.version(pkg.version)
	.usage('<file>')
	.option('-d, --dir [type]', 'Document root directory [dir]', './')
	.option('-p, --port [type]', 'HTTP port [port]', 8642)
	.option('-l, --livereloadport [type]', 'LiveReload port [livereloadport]', 35729)
	.option('-h, --header [type]', 'Header template .md file', null)
	.option('-r, --footer [type]', 'Footer template .md file', null)
	.option('-n, --navigation [type]', 'Navigation .md file', null)
	.option('-a, --address [type]', 'Serve on ip/address [address]', 'localhost')
	.option('-s, --less [type]', 'Path to Less styles [less]', githubStylePath)
	.option('-v, --verbose', 'verbose output')
	.action(serverPath => {
		flags.dir = path.normalize(path.join(process.cwd(), serverPath))
		console.log(flags.dir)
	}).parse(process.argv)

flags.$markserv = {
	githubStylePath
}

markserv.init(flags)
