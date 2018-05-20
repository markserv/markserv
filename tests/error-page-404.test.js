import fs from 'fs'
import path from 'path'
import request from 'request'
import test from 'ava'
import getPort from 'get-port'
import markserv from '../lib/server'

test.cb('start service and receive error page (404)', t => {
	t.plan(3)

	const expected = String(
		fs.readFileSync(
			path.join(__dirname, 'error-page-404.expected.html')
		)
	)

	const dir = path.join(__dirname, '..')

	getPort().then(port => {
		const flags = {
			dir,
			port,
			livereloadport: false,
			address: 'localhost',
			silent: true
		}

		const done = () => {
			t.end()
		}

		markserv.init(flags).then(service => {
			const closeServer = () => {
				service.httpServer.close(done)
			}

			const opts = {
				url: `http://localhost:${port}/beep/boop/bwwwaaaaahhhggg`,
				timeout: 1000 * 2
			}

			request(opts, (err, res, body) => {
				if (err) {
					t.fail(err)
					closeServer()
				}

				// // Write expected:
				// fs.writeFileSync(path.join(__dirname, 'service.expected.html'), body)

				const sanitize = text => {
					return text.replace(/PID: \d+</, 'PID: N/A<')
						.replace(/<p class="errorMsg">(.*?)<\/p>/, '')
						.replace(/<pre>(.*?)<\/pre>/s, '')
						.replace(/<title>(.*?)\/markserv\/beep\/boop\/bwwwaaaaahhhggg<\/title>/s, '')
				}

				const bodyNonVariable = sanitize(body)
				const expectedNonVariable = sanitize(expected)

				t.is(bodyNonVariable, expectedNonVariable)

				t.is(res.statusCode, 200)
				t.pass()
				closeServer()
			})
		}).catch(err => {
			t.fail(err)
			t.end()
		})
	})
})
