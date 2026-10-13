const fs = require('fs')
const path = require('path')
const {get} = require('./http.js')
const test = require('ava')
const cli = require('../lib/cli.js')

test('start markserv via "cli" command opening file in same dir', async t => {
	const expected = String(
		fs.readFileSync(
			path.join(__dirname, 'markserv-cli-file.expected.html')
		)
	)

	const port = 8764 // dedicated port: a random getPort() races across parallel test files (see port-in-use.test.js)
	const cliOpts = {
		input: ['README.md'],
		flags: {
			port,
			hotreload: false,
			address: 'localhost',
			silent: true,
			browser: false
		}
	}

	const service = await cli.run(cliOpts)

	try {
		const res = await get({
			url: service.launchUrl,
			timeout: 1000 * 2
		})

		t.true(res.body.includes(expected))
		t.is(res.statusCode, 200)
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('start markserv via "cli" command opening file in same dir with preceeding ./', async t => {
	const expected = String(
		fs.readFileSync(
			path.join(__dirname, 'markserv-cli-file.expected.html')
		)
	)

	const port = 8766
	const cliOpts = {
		input: ['./README.md'],
		flags: {
			port,
			hotreload: false,
			address: 'localhost',
			silent: true,
			browser: false
		}
	}

	const service = await cli.run(cliOpts)

	try {
		const res = await get({
			url: service.launchUrl,
			timeout: 1000 * 2
		})

		t.true(res.body.includes(expected))
		t.is(res.statusCode, 200)
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})
