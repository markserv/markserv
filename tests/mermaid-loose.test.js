import path from 'path'
import request from 'request'
import test from 'ava'
import getPort from 'get-port'
import markserv from '../lib/server'

// The mermaid client library is served locally from the mermaid npm
// package through the {markserv} media allow-list, and diagram link
// behavior is controlled by the mermaidLoose flag (strict by default).

test.cb('served page defaults to mermaid strict security', t => {
	t.plan(4)

	getPort().then(port => {
		const done = () => {
			t.end()
		}

		markserv.init({
			dir: path.join(__dirname, '..'),
			port,
			hotreload: false,
			address: 'localhost',
			silent: true
		}).then(service => {
			const closeServer = () => {
				service.httpServer.close(done)
			}

			const opts = {
				url: `http://localhost:${port}/tests/mermaid.md`,
				timeout: 1000 * 2
			}

			request(opts, (err, res, body) => {
				if (err) {
					t.fail(err)
					closeServer()
					return
				}

				t.is(res.statusCode, 200)
				// Strict by default: mermaid sanitizes diagram link targets
				// (javascript: urls inert; plain urls still clickable)
				t.true(body.includes("securityLevel: 'strict'"))
				// The library is served locally, not from a CDN
				t.true(body.includes('{markserv}media/mermaid.min.js'))
				t.false(body.includes('cdn.jsdelivr.net/npm/mermaid'))
				closeServer()
			})
		}).catch(error => {
			t.fail(error)
			t.end()
		})
	})
})

test.cb('mermaidLoose flag serves the page with mermaid loose security', t => {
	t.plan(3)

	getPort().then(port => {
		const done = () => {
			t.end()
		}

		markserv.init({
			dir: path.join(__dirname, '..'),
			port,
			hotreload: false,
			address: 'localhost',
			silent: true,
			mermaidLoose: true
		}).then(service => {
			const closeServer = () => {
				service.httpServer.close(done)
			}

			const opts = {
				url: `http://localhost:${port}/tests/mermaid.md`,
				timeout: 1000 * 2
			}

			request(opts, (err, res, body) => {
				if (err) {
					t.fail(err)
					closeServer()
					return
				}

				t.is(res.statusCode, 200)
				// --mermaid-loose: mermaid link-target sanitization lifted
				t.true(body.includes("securityLevel: 'loose'"))
				t.true(body.includes('{markserv}media/mermaid.min.js'))
				closeServer()
			})
		}).catch(error => {
			t.fail(error)
			t.end()
		})
	})
})

test.cb('serves the vendored mermaid dist via the media route', t => {
	t.plan(4)

	getPort().then(port => {
		const done = () => {
			t.end()
		}

		markserv.init({
			dir: path.join(__dirname, '..'),
			port,
			hotreload: false,
			address: 'localhost',
			silent: true
		}).then(service => {
			const closeServer = () => {
				service.httpServer.close(done)
			}

			request({
				url: `http://localhost:${port}/%7Bmarkserv%7Dmedia/mermaid.min.js`,
				timeout: 1000 * 5
			}, (err, res, body) => {
				if (err) {
					t.fail(err)
					closeServer()
					return
				}

				t.is(res.statusCode, 200)
				t.true(String(res.headers['content-type']).includes('javascript'))
				// The full minified library, not an error page
				t.true(body.length > 1000000)
				t.true(body.includes('mermaid'))
				closeServer()
			})
		}).catch(error => {
			t.fail(error)
			t.end()
		})
	})
})

test.cb('{markserv} media suffixes are not a path bridge into node_modules', t => {
	t.plan(3)

	getPort().then(port => {
		const done = () => {
			t.end()
		}

		markserv.init({
			dir: path.join(__dirname, '..'),
			port,
			hotreload: false,
			address: 'localhost',
			silent: true
		}).then(service => {
			const closeServer = () => {
				service.httpServer.close(done)
			}

			// The media/ key is exact-match only; a traversal suffix falls
			// through to the lib/-confined handler and is refused
			request({
				url: `http://localhost:${port}/%7Bmarkserv%7Dmedia/..%2F..%2Fpackage.json`,
				timeout: 1000 * 2
			}, (err, res, body) => {
				if (err) {
					t.fail(err)
					closeServer()
					return
				}

				t.is(res.statusCode, 403)
				t.is(body, 'Forbidden')
				t.false(body.includes('"name": "markserv"'))
				closeServer()
			})
		}).catch(error => {
			t.fail(error)
			t.end()
		})
	})
})
