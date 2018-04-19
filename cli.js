#!/usr/bin/env node

'use strict'

const path = require('path')
const flags = require('commander')
const markserv = require('./server')

const pkg = require('./package.json')

const githubStylePath = path.join(__dirname, 'less/github.less')

flags.version(pkg.version)
	.option('-d, --dir [type]', 'Serve from directory [dir]', './')
	.option('-p, --port [type]', 'Serve on port [port]', null)
	.option('-h, --header [type]', 'Header template .md file', null)
	.option('-r, --footer [type]', 'Footer template .md file', null)
	.option('-n, --navigation [type]', 'Navigation .md file', null)
	.option('-a, --address [type]', 'Serve on ip/address [address]', 'localhost')
	.option('-s, --less [type]', 'Path to Less styles [less]', githubStylePath)
	.option('-f, --file [type]', 'Open specific file in browser [file]')
	.option('-x, --x', 'Don\'t open browser on run.')
	.option('-v, --verbose', 'verbose output')
	.parse(process.argv)

flags.$markserv = {
	githubStylePath
}

markserv.init(flags)
