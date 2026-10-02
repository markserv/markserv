const fs = require('fs')
const path = require('path')
const {get} = require('./http.js')
const test = require('ava')
const getPort = require('get-port')
const readme = require('../lib/readme.js')

test('start markserv via "readme" command', async t => {
	const expected = String(
		fs.readFileSync(
			path.join(__dirname, 'markserv-cli.expected.html')
		)
	)

	const port = await getPort()
	const cliOpts = {
		input: [],
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
