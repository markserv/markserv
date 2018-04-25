#!/usr/bin/env node

'use strict'

const fs = require('fs')
const path = require('path')
const flags = require('commander')
const markserv = require('./server')

const pkg = require('./package.json')

const cwd = process.cwd()

flags.dir = cwd

const fileExistsSync = uri => {
	let exists

	try {
		const stat = fs.statSync(uri)
		if (stat.isFile()) {
			exists = true
		}
	} catch (err) {
		exists = false
	}

	return exists
}

const findFileUp = (dir, fileToFind) => {
	const filepath = path.join(dir, fileToFind)
	const existsHere = fileExistsSync(filepath)

	if (dir === path.sep || dir === '.') {
		return false
	}

	if (existsHere) {
		return filepath
	}

	const nextDirUp = path.dirname(dir)
	return findFileUp(nextDirUp, fileToFind)
}

const README = findFileUp(cwd, 'README.md')
const readme = findFileUp(cwd, 'readme.md')

flags.version(pkg.version)
	.usage('<file/dir>')
	.option('-p, --port [type]', 'HTTP port [port]', 8642)
	.option('-l, --livereloadport [type]', 'LiveReload port [livereloadport]', 35729)
	.option('-i, --silent [type]', 'Silent (no logs to CLI)', false)
	.option('-a, --address [type]', 'Serve on ip/address [address]', 'localhost')
	.option('-v, --verbose', 'verbose output')
	.parse(process.argv)

flags.dir = README || readme || cwd
flags.$pathProvided = true

markserv.init(flags)
