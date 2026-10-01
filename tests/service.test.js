const fs = require('fs')
const path = require('path')
const {get} = require('./http.js')
const test = require('ava')
const getPort = require('get-port')
const markserv = require('../lib/server.js')

test('start service and receive tables markdown', async t => {
	const expected = String(
		fs.readFileSync(
			path.join(__dirname, 'service.expected.html')
		)
	)

	const dir = path.join(__dirname, '..')
	const port = await getPort()

	const service = await markserv.init({
		dir,
		port,
		hotreload: false,
		address: 'localhost',
		silent: true
	})

	try {
		const res = await get({
			url: `http://localhost:${port}/tests/tables.md`,
			timeout: 1000 * 2
		})

		// // Write expected:
		// fs.writeFileSync(path.join(__dirname, 'service.expected.html'), res.body)

		const normalize = text => text.replace(/PID: \d+</, 'PID: N/A<')
			.replace(/markserv-width:' \+ '.*?'/, 'markserv-width:\' + \'\'')
		const bodyNoPid = normalize(res.body)
		const expectedNoPid = normalize(expected)
		t.is(bodyNoPid, expectedNoPid)

		t.is(res.statusCode, 200)
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})
