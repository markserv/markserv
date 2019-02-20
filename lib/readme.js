#!/usr/bin/env node

// 'use strict'

// const fs = require('fs')
// const path = require('path')
// const flags = require('commander')

// const markserv = require(path.join(__dirname, 'server'))
// const pkg = require(path.join(__dirname, '..', './package.json'))
// const splash = require(path.join(__dirname, 'splash'))

// const run = args => {
// 	splash(args)

// 	// const cwd = process.cwd()
// 	// /* eslint-disable-next-line no-mixed-operators */
// 	// args.path = args && args.path || cwd
// 	// // flags.$pathProvided = true
// 	// console.log(args);

// 	// const fileExistsSync = uri => {
// 	// 	let exists

// 	// 	try {
// 	// 		const stat = fs.statSync(uri)
// 	// 		if (stat.isFile()) {
// 	// 			exists = true
// 	// 		}
// 	// 	} catch (err) {
// 	// 		exists = false
// 	// 	}

// 	// 	return exists
// 	// }

// 	// const findFileUp = (dir, fileToFind) => {
// 	// 	const filepath = path.join(dir, fileToFind)
// 	// 	const existsHere = fileExistsSync(filepath)

// 	// 	if (dir === path.sep || dir === '.') {
// 	// 		return false
// 	// 	}

// 	// 	if (existsHere) {
// 	// 		return filepath
// 	// 	}

// 	// 	const nextDirUp = path.dirname(dir)
// 	// 	return findFileUp(nextDirUp, fileToFind)
// 	// }

// 	// const findReadmeFile = dir => {
// 	// 	const readmeFile = findFileUp(dir, 'README.md') ||
// 	// 		findFileUp(dir, 'readme.md') ||
// 	// 		findFileUp(dir, 'README.MD') ||
// 	// 		findFileUp(dir, 'Readme.md')
// 	// 	return readmeFile
// 	// }

// 	flags.version(pkg.version)
// 		.usage('[path_to_readme]')
// 		.option('-p, --port [type]', 'HTTP port [port]', 8642)
// 		.option('-l, --livereloadport [type]', 'LiveReload port [port/false]', 35729)
// 		.option('-b, --browser [type]', 'Launch browser', true)
// 		.option('-i, --silent [type]', 'Silent (no logs to CLI)', false)
// 		.option('-a, --address [type]', 'Serve on ip/address [address]', 'localhost')
// 		.option('-v, --verbose', 'verbose output')
// 		.action(opts => {
// 			// console.log(opts)
// 			// console.log()
// 			// console.log(typeof opts)

// 			// const pathToReadme = path.resolve(args.path)
// 			// console.log(pathToReadme)

// 			// if (args.dir[0] === '/') {
// 			// 	flags.path = pathToReadme
// 			// } else {
// 			// 	flags.path = path.normalize(path.join(cwd, args.path))
// 			// }

// 			// const readmeFile = findReadmeFile(flags.path)
// 			// flags.path = readmeFile || flags.path
// 			// flags.$pathProvided = true
// 		}).parse(process.argv)

// 	// if (!Array.isArray(args) && typeof args === 'object') {
// 	// 	Reflect.ownKeys(args).forEach(key => {
// 	// 		flags[key] = args[key]
// 	// 	})
// 	// }

// 	// if (typeof flags.pathToReadme === 'undefined') {
// 	// 	const readmeFile = findReadmeFile(flags.dir)
// 	// 	flags.dir = readmeFile || flags.dir
// 	// 	flags.$pathProvided = true
// 	// 	flags.$openLocation = true
// 	// }

// 	return markserv.init(args)
// }
// var program = require('commander');

// const run = (args) => {
// 	program
// 	.option('--no-sauce', 'Remove sauce')
// 	.parse(args);

// 	console.log('you ordered a pizza');
// 	if (program.sauce) console.log('  with sauce');
// 	else console.log(' without sauce');
// }

// const cli = !module.parent

// if (cli) {
// 	run(process.argv)
// } else {
// 	module.exports = {run}
// }
