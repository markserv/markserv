const fs = require('fs')
const path = require('path')
const {get} = require('./http.js')
const test = require('ava')
const getPort = require('get-port')
const markserv = require('../lib/server.js')

test('start service and receive error page (404)', async t => {
	const expected = String(
		fs.readFileSync(
			path.join(__dirname, 'error-page-404.expected.html')
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
			url: `http://localhost:${port}/beep/boop/bwwwaaaaahhhggg`,
			timeout: 1000 * 2
		})

		// // Write expected:
		// fs.writeFileSync(path.join(__dirname, 'service.expected.html'), res.body)

		const sanitize = text => {
			return text.replace(/PID: \d+</, 'PID: N/A<')
				.replace(/<p class="errorMsg">(.*?)<\/p>/, '')
				.replace(/<pre>(.*?)<\/pre>/s, '')
				// The 404 title embeds the checkout path, which differs
				// between the main repo and any worktree: strip it
				// wholesale instead of matching a specific checkout
				.replace(/<title>404: .*?\/beep\/boop\/bwwwaaaaahhhggg<\/title>/, '')
				.replace(/markserv-width:' \+ '.*?'/, 'markserv-width:\' + \'\'')
		}

		const bodyNonVariable = sanitize(res.body)
		const expectedNonVariable = sanitize(expected)

		t.is(bodyNonVariable, expectedNonVariable)

		t.is(res.statusCode, 200)
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})
