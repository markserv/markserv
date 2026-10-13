const fs = require('fs')
const path = require('path')
const {get} = require('./http.js')
const test = require('ava')
const markserv = require('../lib/server.js')

test('start service and get text file', async t => {
	const expected = String(
		fs.readFileSync(
			path.join(__dirname, 'implant-file.expected.html')
		)
	)

	const dir = path.join(__dirname)
	const port = 8756 // dedicated port: a random getPort() races across parallel test files (see port-in-use.test.js)

	const service = await markserv.init({
		port,
		dir,
		hotreload: false,
		address: 'localhost',
		silent: true,
		browser: false,
		templates: true
	})

	try {
		const res = await get({
			url: `http://localhost:${port}/implant-file.render-fixture.md`,
			timeout: 1000 * 2
		})

		// Write expected:
		// fs.writeFileSync(path.join(__dirname, 'implant-file.expected.html'), res.body)

		t.true(res.body.includes(expected))
		t.is(res.statusCode, 200)
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})
