import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import axios from 'axios'
import test from 'ava'
import getPort from 'get-port'
import {init} from '../lib/server.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test('start service and get text file', async t => {

	const expected = String(
		fs.readFileSync(
			path.join(__dirname, 'implant-file.expected.html')
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
		url: `http://localhost:${port}/implant-file.render-fixture.md`,
		timeout: 1000 * 2
	}

	await new Promise((resolve, reject) => {
		axios(opts)
			.then(response => {
				const normalize = text => text.replace(/PID: \d+</v, 'PID: N/A<')
					.replace(/markserv-width:' \+ '.*?'/v, 'markserv-width:\' + \'\'')
				const bodyNoPid = normalize(response.data)
				const expectedNoPid = normalize(expected)
				t.is(bodyNoPid, expectedNoPid)

				t.is(response.status, 200)
				t.pass()
				closeServer()
				resolve()
			})
			.catch(err => {
				t.fail(err)
				closeServer()
				reject(err)
			})
	})
})
		}).catch(error => {
			t.fail(error)

		})
	})
})
