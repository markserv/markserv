import fs from 'fs'
import path from 'path'
import request from 'request'
import test from 'ava'
import getPort from 'get-port'
import WebSocket from 'ws'
import markserv from '../lib/server'

// Fixtures: the served root is tests/path-traversal/public; secret.md
// sits in its parent and must never be readable through the server.
const fixtureDir = path.join(__dirname, 'path-traversal')
const servedDir = path.join(fixtureDir, 'public')
const secretFile = path.join(fixtureDir, 'secret.md')
const marker = 'SECRET-139-MARKER'

test.cb('traversal of an out-of-root file is refused (403)', t => {
	t.plan(4)

	getPort().then(port => {
		const flags = {
			dir: servedDir,
			port,
			hotreload: false,
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
				url: `http://localhost:${port}/a.md/../../secret.md`,
				timeout: 1000 * 2
			}

			request(opts, (err, res, body) => {
				if (err) {
					t.fail(err)
					closeServer()
					return
				}

				t.is(res.statusCode, 403)
				t.is(body, 'Forbidden')
				t.false(body.includes(marker))
				t.false(body.includes(secretFile))
				closeServer()
			})
		}).catch(error => {
			t.fail(error)
			t.end()
		})
	})
})

test.cb('traversal to a missing out-of-root file leaks nothing (403)', t => {
	t.plan(4)

	getPort().then(port => {
		const flags = {
			dir: servedDir,
			port,
			hotreload: false,
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
				url: `http://localhost:${port}/a.md/../../nope.md`,
				timeout: 1000 * 2
			}

			request(opts, (err, res, body) => {
				if (err) {
					t.fail(err)
					closeServer()
					return
				}

				t.is(res.statusCode, 403)
				t.is(body, 'Forbidden')
				t.false(body.includes('ENOENT'))
				t.false(body.includes(fixtureDir))
				closeServer()
			})
		}).catch(error => {
			t.fail(error)
			t.end()
		})
	})
})

test.cb('{markserv} urls cannot escape lib/', t => {
	t.plan(4)

	getPort().then(port => {
		const flags = {
			dir: servedDir,
			port,
			hotreload: false,
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

			// Traversal above lib/: was the full package.json before the fix
			request({
				url: `http://localhost:${port}/%7Bmarkserv%7D../package.json`,
				timeout: 1000 * 2
			}, (err, res, body) => {
				if (err) {
					t.fail(err)
					closeServer()
					return
				}

				t.is(res.statusCode, 403)
				t.is(body, 'Forbidden')

				// Legit internal url still served
				request({
					url: `http://localhost:${port}/%7Bmarkserv%7Dtemplates/markserv.css`,
					timeout: 1000 * 2
				}, (err2, res2, body2) => {
					if (err2) {
						t.fail(err2)
						closeServer()
						return
					}

					t.is(res2.statusCode, 200)
					t.true(body2.includes('markserv'))
					closeServer()
				})
			})
		}).catch(error => {
			t.fail(error)
			t.end()
		})
	})
})

test.cb('in-root requests are unaffected (200)', t => {
	t.plan(2)

	getPort().then(port => {
		const flags = {
			dir: servedDir,
			port,
			hotreload: false,
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
				url: `http://localhost:${port}/a.md`,
				timeout: 1000 * 2
			}

			request(opts, (err, res, body) => {
				if (err) {
					t.fail(err)
					closeServer()
					return
				}

				t.is(res.statusCode, 200)
				t.true(body.includes('<h1 id="harmless">Harmless</h1>'))
				closeServer()
			})
		}).catch(error => {
			t.fail(error)
			t.end()
		})
	})
})

test.cb('in-root 404 keeps the existing error page shape', t => {
	t.plan(3)

	getPort().then(port => {
		const flags = {
			dir: servedDir,
			port,
			hotreload: false,
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
				url: `http://localhost:${port}/nope.md`,
				timeout: 1000 * 2
			}

			request(opts, (err, res, body) => {
				if (err) {
					t.fail(err)
					closeServer()
					return
				}

				// Pre-existing behavior: in-root 404 pages are served with
				// status 200 (error-page-404 fixture test depends on shape)
				t.is(res.statusCode, 200)
				t.true(body.includes('<title>404:'))
				t.true(body.includes(path.join(servedDir, 'nope.md')))
				closeServer()
			})
		}).catch(error => {
			t.fail(error)
			t.end()
		})
	})
})

test.cb('hot reload does not push content for out-of-root paths', t => {
	t.plan(3)

	getPort().then(port => {
		const flags = {
			dir: servedDir,
			port,
			hotreload: true,
			address: 'localhost',
			silent: true
		}

		const aMdPath = path.join(servedDir, 'a.md')
		const aMdOriginal = fs.readFileSync(aMdPath, 'utf8')

		const done = () => {
			t.end()
		}

		let evilWs
		let goodWs

		markserv.init(flags).then(service => {
			const closeServer = () => {
				if (evilWs) {
					evilWs.close()
				}

				if (goodWs) {
					goodWs.close()
				}

				service.hotReloadServer.close()
				service.httpServer.close(done)
			}

			// A wss bind failure must not crash the worker
			service.hotReloadServer.on('error', () => {})

			const evilMessages = []
			const goodMessages = []

			const fail = error => {
				t.fail(error)
				closeServer()
			}

			// The handshake can transiently hit a port another parallel
			// test file owns; retry before giving up. Socket errors must
			// not crash the worker, so every client gets a no-op handler.
			const openWs = (attempts, onConnected) => {
				const tryConnect = left => {
					const ws = new WebSocket(`ws://localhost:${flags.$wsPort}`)
					ws.on('error', () => {
						ws.terminate()
						if (left > 1) {
							setTimeout(() => tryConnect(left - 1), 100)
							return
						}

						fail(new Error('ws connect failed'))
					})

					ws.on('open', () => {
						onConnected(ws)
					})
				}

				tryConnect(attempts)
			}

			openWs(10, ws => {
				evilWs = ws

				// A client that registers the PoC traversal path
				ws.on('message', data => evilMessages.push(String(data)))
				ws.send(JSON.stringify({path: '/a.md/../../secret.md'}))

				openWs(10, ws2 => {
					goodWs = ws2

					// A control client that registers the in-root path
					ws2.on('message', data => goodMessages.push(String(data)))
					ws2.send(JSON.stringify({path: '/a.md'}))

					// Both registered: trigger the file watcher
					fs.appendFile(aMdPath, '\nhot\n', error => {
						if (error) {
							fail(error)
							return
						}

						setTimeout(() => {
							// Restore the fixture for repeated runs
							fs.writeFileSync(aMdPath, aMdOriginal)

							// Control client got the reload push
							t.true(goodMessages.length > 0)
							// Out-of-root client got nothing
							t.is(evilMessages.length, 0)
							t.false(evilMessages.join('').includes(marker))
							closeServer()
						}, 1500)
					})
				})
			})
		}).catch(error => {
			t.fail(error)
			t.end()
		})
	})
})

test.cb('implants cannot read out-of-root files (templates mode)', t => {
	t.plan(4)

	getPort().then(port => {
		const flags = {
			dir: servedDir,
			port,
			hotreload: false,
			templates: true,
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
				url: `http://localhost:${port}/implant-evil.md`,
				timeout: 1000 * 2
			}

			request(opts, (err, res, body) => {
				if (err) {
					t.fail(err)
					closeServer()
					return
				}

				// The page still renders; the escaping implants are refused
				t.is(res.statusCode, 200)
				t.false(body.includes(marker))
				t.false(body.includes('must never be readable'))
				t.false(body.includes(secretFile))
				closeServer()
			})
		}).catch(error => {
			t.fail(error)
			t.end()
		})
	})
})

test.cb('in-root implants still resolve (templates mode)', t => {
	t.plan(4)

	getPort().then(port => {
		const flags = {
			dir: servedDir,
			port,
			hotreload: false,
			templates: true,
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
				url: `http://localhost:${port}/implant-good.md`,
				timeout: 1000 * 2
			}

			request(opts, (err, res, body) => {
				if (err) {
					t.fail(err)
					closeServer()
					return
				}

				t.is(res.statusCode, 200)
				// {file:} inlines the raw source, {markdown:} the rendered html
				t.true(body.includes('Just a doc in the served root.'))
				t.true(body.includes('<h1 id="harmless">Harmless</h1>'))
				t.false(body.includes(marker))
				closeServer()
			})
		}).catch(error => {
			t.fail(error)
			t.end()
		})
	})
})

test.cb('hot reload implants cannot push out-of-root content', t => {
	t.plan(3)

	getPort().then(port => {
		const flags = {
			dir: servedDir,
			port,
			hotreload: true,
			address: 'localhost',
			silent: true
		}

		const hotImplantPath = path.join(servedDir, 'hot-implant.md')
		const hotImplantOriginal = fs.readFileSync(hotImplantPath, 'utf8')

		const done = () => {
			t.end()
		}

		let ws

		markserv.init(flags).then(service => {
			const closeServer = () => {
				if (ws) {
					ws.close()
				}

				service.hotReloadServer.close()
				service.httpServer.close(done)
			}

			// A wss bind failure must not crash the worker
			service.hotReloadServer.on('error', () => {})

			const messages = []

			const fail = error => {
				t.fail(error)
				closeServer()
			}

			// The handshake can transiently hit a port another parallel
			// test file owns; retry before giving up. Socket errors must
			// not crash the worker, so the client gets a no-op handler.
			const openWs = (attempts, onConnected) => {
				const tryConnect = left => {
					const wsClient = new WebSocket(`ws://localhost:${flags.$wsPort}`)
					wsClient.on('error', () => {
						wsClient.terminate()
						if (left > 1) {
							setTimeout(() => tryConnect(left - 1), 150)
							return
						}

						fail(new Error('ws connect failed'))
					})

					wsClient.on('open', () => {
						onConnected(wsClient)
					})
				}

				tryConnect(attempts)
			}

			openWs(20, client => {
				ws = client

				// A client that registers the in-root path; the traversal
				// lives in the implanted file content, not the client path
				ws.on('message', data => messages.push(String(data)))
				ws.send(JSON.stringify({path: '/hot-implant.md'}))

				// Trigger the file watcher with an escaping implant
				fs.appendFile(hotImplantPath, '\n{file:../secret.md}\n', error => {
					if (error) {
						fail(error)
						return
					}

					setTimeout(() => {
						// Restore the fixture for repeated runs
						fs.writeFileSync(hotImplantPath, hotImplantOriginal)

						// The client got the reload push...
						t.true(messages.length > 0)
						// ...but the escaping implant never reached it
						t.false(messages.join('').includes(marker))
						t.false(messages.join('').includes('must never be readable'))
						closeServer()
					}, 1500)
				})
			})
		}).catch(error => {
			t.fail(error)
			t.end()
		})
	})
})
