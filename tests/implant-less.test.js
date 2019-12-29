import fs from 'fs'
import path from 'path'
import request from 'request'
import test from 'ava'
import getPort from 'get-port'
import markserv from '../lib/server'

test.cb('start service and get text file', t => {
	t.plan(3)

	const expected = String(
		fs.readFileSync(
			path.join(__dirname, 'implant-less.expected.html')
		)
	)

	const dir = path.join(__dirname)

	getPort().then(port => {
		const flags = {
			port,
			dir,
			livereloadport: false,
			address: 'localhost',
			silent: true,
			browser: false
		}

		const done = () => {
			t.end()
		}

		markserv.init(flags).then(service => {
			const closeServer = () => {
				service.httpServer.close(done)
			}

			const opts = {
				url: `http://localhost:${port}/implant-less.render-fixture.html`,
				timeout: 1000 * 2
			}

			request(opts, (err, res, body) => {
				if (err) {
					t.fail(err)
					closeServer()
				}

				// Write expected:
				fs.writeFileSync(path.join(__dirname, 'implant-less.expected.html'), body)

				t.true(body.includes(expected))
				t.is(res.statusCode, 200)
				t.pass()
				closeServer()
			})
		}).catch(error => {
			t.fail(error)
			t.end()
		})
	})
})
