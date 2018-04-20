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
	const less = path.join(__dirname, '..', 'less', 'github.less')

	getPort().then(port => {
		const flags = {
			dir,
			port,
			livereloadport: false,
			header: null,
			footer: null,
			navigation: null,
			address: 'localhost',
			silent: true,
			less,
			$markserv: {githubStylePath: less}
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

				t.is(body, expected)
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
