const fs = require('fs')
const path = require('path')
const {get} = require('./http.js')
const test = require('ava')
const readme = require('../lib/readme.js')

test('start markserv via "readme" command', async t => {
	const expected = String(
		fs.readFileSync(
			path.join(__dirname, 'markserv-cli-readme.expected.html')
		)
	)

	const dir = path.join(
		__dirname, '..', 'tests', 'markserv-cli-readme'
	) + path.sep

	const port = 8770 // dedicated port: a random getPort() races across parallel test files (see port-in-use.test.js)
	const cliOpts = {
		input: [dir],
		flags: {
			port,
			hotreload: false,
			address: 'localhost',
			silent: true,
			browser: false
		}
	}

	const service = await readme.run(cliOpts)

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
