import fs from 'fs'
import path from 'path'
import request from 'request'
import test from 'ava'
import getPort from 'get-port'
import readme from '../lib/readme'

test.cb('start markserv via "readme" command from child dir', t => {
	t.plan(3)

	const expected = String(
		fs.readFileSync(
			path.join(__dirname, 'markserv-cli-readme-dir-down.expected.html')
		)
	)

	const dir = path.join(__dirname, '..')

	getPort().then(port => {
		const flags = {
			dir,
			port,
			livereloadport: false,
			address: 'localhost',
			silent: true,
			browser: false
		}

		readme.run(flags).then(service => {
			const opts = {
				url: service.launchUrl,
				timeout: 1000 * 2
			}

			request(opts, (err, res, body) => {
				if (err) {
					service.httpServer.close()
					t.fail(err)
				}

				t.true(body.includes(expected))

				t.is(res.statusCode, 200)
				t.pass()
				service.httpServer.close()
				t.end()
			})
		}).catch(err => {
			t.fail(err)
			t.end()
		})
	})
})
