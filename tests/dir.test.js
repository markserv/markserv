import fs from 'node:fs'
import path, {dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import request from 'request'
import test from 'ava'
import getPort from 'get-port'
import {init} from '../lib/server.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

test('start service and get directory listing', async t => {

	const expected = String(fs.readFileSync(path.join(__dirname, 'dir.expected.html')))

	const dir = path.join(__dirname, '..')

	getPort().then(port => {
		const flags = {
			port,
			dir,
			hotreload: false,
			address: 'localhost',
			silent: true,
		}

		const done = () => {

		}

		init(flags).then(service => {
			const closeServer = () => {
				service.httpServer.close(done)
			}

			const options = {
				url: `http://localhost:${port}/tests/testdir/`,
				timeout: 1000 * 2,
			}

			request(options, (error, res, body) => {
				if (error) {
					t.fail(error)
					closeServer()
				}

				// // Write expected:
				// fs.writeFileSync(path.join(__dirname, 'dir.expected.html'), body)

				const normalize = text => text.replace(/PID: \d+</, 'PID: N/A<')
					.replace(/markserv-width:' \+ '.*?'/, 'markserv-width:\' + \'\'')
				const bodyNoPid = normalize(body)
				const expectedNoPid = normalize(expected)
				t.is(bodyNoPid, expectedNoPid)
				t.is(res.statusCode, 200)
				t.pass()
				closeServer()
			})
		}).catch(error => {
			t.fail(error)

		})
	})
})
