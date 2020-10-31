import fs from 'fs'
import path from 'path'
import request from 'request'
import test from 'ava'
import getPort from 'get-port'
import markserv from '../lib/server'

test('Get text file', async t => {
	const expected = String(
		fs.readFileSync(
			path.join(__dirname, 'implant-file.expected.html')
		)
	)

	const opts = {
		url: 'http://localhost:port/implant-file.render-fixture.md',
		timeout: 1000 * 2
	}

	await macro(t, opts, expected)
})

test('No URL attached to {file}', async t => {
	const expected = String(
		fs.readFileSync(
			path.join(__dirname, 'implant-file.expected2.html')
		)
	)

	const opts = {
		url: 'http://localhost:port/implant-file.render-fixture2.md',
		timeout: 1000 * 2
	}

	await macro(t, opts, expected)
})

function macro(t, opts, expected) {
	t.plan(3)

	return requestMarkserv(opts).then(
		({res, body, closeServer}) => {
			t.true(body.includes(expected))
			t.is(res.statusCode, 200)
			t.pass()
			closeServer()
		}
	).catch(error => {
		t.fail(error)
	})
}

function requestMarkserv(opts) {
	return new Promise((resolve, reject) => {
		getPort().then(port => {
			opts.url = opts.url.replace(':port', ':' + port)
			const dir = path.join(__dirname)

			const flags = {
				port,
				dir,
				livereloadport: false,
				address: 'localhost',
				silent: true,
				browser: false
			}

			markserv.init(flags).then(service => {
				const closeServer = () => {
					service.httpServer.close()
				}

				request(opts, (err, res, body) => {
					if (err) {
						closeServer()
						reject(err)
					}

					resolve({res, body, closeServer})
				})
			})
		})
	})
}
