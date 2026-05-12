import fs from 'node:fs'
import path, {dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import request from 'request'
import test from 'ava'
import getPort from 'get-port'
import {init} from '../lib/server.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

test('start service and receive tables markdown', async t => {

	const expected = String(
		fs.readFileSync(
			path.join(__dirname, 'service.expected.html')
		)
	)

	const dir = path.join(__dirname, '..')

	const port = await getPort()

	const flags = {
		dir,
		port,
		hotreload: false,
		address: 'localhost',
		silent: true
	}

	const service = await init(flags)

	const closeServer = () => {
		service.httpServer.close()
	}

	const opts = {
		url: `http://localhost:${port}/tests/tables.md`,
		timeout: 1000 * 2
	}

	await new Promise((resolve, reject) => {
		request(opts, (err, res, body) => {
			if (err) {
				t.fail(err)
				closeServer()
				reject(err)
			} else {
				const normalize = text => text.replace(/PID: \d+</, 'PID: N/A<')
					.replace(/markserv-width:' \+ '.*?'/, 'markserv-width:\' + \'\'')
				const bodyNoPid = normalize(body)
				const expectedNoPid = normalize(expected)
				t.is(bodyNoPid, expectedNoPid)

				t.is(res.statusCode, 200)
				t.pass()
				closeServer()
				resolve()
			}
		})
	})
})
		}).catch(error => {
			t.fail(error)
			t.end()
		})
	})
})
