import fs from 'fs'
import path from 'path'
import request from 'request'
import test from 'ava'
import getPort from 'get-port'
import markserv from '../server'

test.cb('start service and receive tables markdown', t => {
	t.plan(3)

	const expected = String(
		fs.readFileSync(
			path.join(__dirname, 'service.expected.html')
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
				url: `http://localhost:${port}/tests/tables.md`,
				timeout: 1000 * 2
			}

			request(opts, (err, res, body) => {
				if (err) {
					t.fail(err)
					closeServer()
				}

				// Write expected:
				// fs.writeFileSync(path.join(__dirname, 'service.expected.html'), body)

				const bodyNoPid = body.replace(/PID: \d+</, 'PID: N/A<')
				const expectedNoPid = expected.replace(/PID: \d+</, 'PID: N/A<')
				t.is(bodyNoPid, expectedNoPid)

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
