import request from 'request'
import test from 'ava'
import getPort from 'get-port'
import cli from '../lib/cli'

test.cb('start markserv via "cli" command with --redirect-root opening a file: root URL redirects to the file', t => {
	t.plan(3)

	getPort().then(port => {
		const cliOpts = {
			input: ['README.md'],
			flags: {
				port,
				hotreload: false,
				address: 'localhost',
				silent: true,
				browser: false,
				redirectRoot: true
			}
		}

		const done = () => {
			t.end()
		}

		cli.run(cliOpts).then(service => {
			const closeServer = () => {
				service.httpServer.close(done)
			}

			const opts = {
				url: 'http://localhost:' + port + '/',
				followRedirect: false,
				timeout: 1000 * 2
			}

			request(opts, (err, res) => {
				if (err) {
					t.fail(err)
					closeServer()
					return
				}

				t.is(res.statusCode, 302)
				t.is(res.headers.location, '/README.md')
				t.pass()
				closeServer()
			})
		}).catch(error => {
			t.fail(error)
			t.end()
		})
	})
})

test.cb('start markserv via "cli" command without --redirect-root opening a file: root URL still shows the directory index', t => {
	t.plan(2)

	getPort().then(port => {
		const cliOpts = {
			input: ['README.md'],
			flags: {
				port,
				hotreload: false,
				address: 'localhost',
				silent: true,
				browser: false
			}
		}

		const done = () => {
			t.end()
		}

		cli.run(cliOpts).then(service => {
			const closeServer = () => {
				service.httpServer.close(done)
			}

			const opts = {
				url: 'http://localhost:' + port + '/',
				timeout: 1000 * 2
			}

			request(opts, (err, res) => {
				if (err) {
					t.fail(err)
					closeServer()
					return
				}

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

test.cb('start markserv via "cli" command with --redirect-root opening a directory: root URL still shows the directory index', t => {
	t.plan(2)

	getPort().then(port => {
		const cliOpts = {
			input: ['tests'],
			flags: {
				port,
				hotreload: false,
				address: 'localhost',
				silent: true,
				browser: false,
				redirectRoot: true
			}
		}

		const done = () => {
			t.end()
		}

		cli.run(cliOpts).then(service => {
			const closeServer = () => {
				service.httpServer.close(done)
			}

			const opts = {
				url: 'http://localhost:' + port + '/',
				timeout: 1000 * 2
			}

			request(opts, (err, res) => {
				if (err) {
					t.fail(err)
					closeServer()
					return
				}

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
