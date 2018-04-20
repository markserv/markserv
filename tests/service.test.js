import fs from 'fs'
import path from 'path'
import request from 'request'
import test from 'ava'
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
	const flags = {
		dir,
		port: 8642,
		livereloadport: 35729,
		header: null,
		footer: null,
		navigation: null,
		address: 'localhost',
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
			url: 'http://localhost:8642/tests/tables.md',
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
