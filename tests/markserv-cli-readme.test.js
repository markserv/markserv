import fs from 'node:fs'
import path, {dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import request from 'request'
import test from 'ava'
import getPort from 'get-port'
import {run} from '../lib/readme.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

test('start markserv via "readme" command', async t => {

	const expected = String(fs.readFileSync(path.join(__dirname, 'markserv-cli-readme.expected.html')))

	const dir = path.join(__dirname, '..', 'tests', 'markserv-cli-readme') + path.sep

	getPort().then(port => {
		const cliOptions = {
			input: [dir],
			flags: {
				port,
				hotreload: false,
				address: 'localhost',
				silent: true,
				browser: false,
			},
		}

		const done = () => {

		}

		run(cliOptions).then(service => {
			const closeServer = () => {
				service.httpServer.close(done)
			}

			const options = {
				url: service.launchUrl,
				timeout: 1000 * 2,
			}

			request(options, (error, res, body) => {
				if (error) {
					t.fail(error)
					closeServer()
				}

				t.true(body.includes(expected))

				t.is(res.statusCode, 200)
				t.pass()
				closeServer()
			})
		}).catch(error => {
			t.fail(error)

		})
	})
})
