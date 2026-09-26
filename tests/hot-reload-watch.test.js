import fs from 'fs'
import path from 'path'
import test from 'ava'
import getPort from 'get-port'
import WebSocket from 'ws'
import markserv from '../lib/server'

// Fixtures: tests/watch-fixtures is the served root. It contains the
// excluded subtrees (node_modules, .git), a FILE named like an
// exclusion (node_modules.txt), and a symlink (link -> sub) the
// walk must not follow. See the committed fixture tree.
const fixtureRoot = path.join(__dirname, 'watch-fixtures')
const fixtureRootResolved = path.resolve(fixtureRoot)

const relToRoot = absPath => path.relative(fixtureRoot, absPath)

test('collectWatchDirs returns every dir, prunes exclusions, skips symlinks', t => {
	const dirs = markserv.collectWatchDirs(fixtureRoot)
	const rels = dirs.map(relToRoot)
	const relSet = new Set(rels)

	// Root itself and subdirectories at every depth
	t.true(relSet.has(''))
	t.true(relSet.has('sub'))
	t.true(relSet.has(path.join('sub', 'deep')))

	// Excluded subtrees are absent, and nothing beneath them
	t.false(relSet.has('node_modules'))
	t.false(relSet.has(path.join('node_modules', 'pkg')))
	t.false(relSet.has('.git'))

	// Symlink is not followed: no returned path may contain the
	// link component (a duplicate of sub via the symlink)
	t.false(rels.some(rel => rel.split(path.sep).includes('link')))

	// A file named like an exclusion is irrelevant (dirs only); the
	// walk completed without error
	t.true(dirs.length > 0)
})

// The handshake can transiently hit a port another parallel test
// file owns; retry before giving up. Socket errors must not crash
// the worker, so the client gets a no-op handler (repo pattern).
const makeOpenWs = (flags, fail) => {
	return (attempts, onConnected) => {
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
}

test.cb('hot reload pushes for a nested file (watchers cover subdirs)', t => {
	t.plan(2)

	getPort().then(port => {
		const flags = {
			dir: fixtureRoot,
			port,
			hotreload: true,
			address: 'localhost',
			silent: true
		}

		const nestedPath = path.join(fixtureRoot, 'sub', 'nested.md')
		const nestedOriginal = fs.readFileSync(nestedPath, 'utf8')
		const marker = 'NESTED-RELOAD-PROOF'

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

			const openWs = makeOpenWs(flags, fail)

			openWs(20, client => {
				ws = client

				// A client registered at the NESTED path
				ws.on('message', data => messages.push(String(data)))
				ws.send(JSON.stringify({path: '/sub/nested.md'}))

				// Trigger the watcher on a nested file
				setTimeout(() => {
					fs.appendFile(nestedPath, '\n' + marker + '\n', error => {
						if (error) {
							fail(error)
							return
						}

						setTimeout(() => {
							// Restore the fixture for repeated runs
							fs.writeFileSync(nestedPath, nestedOriginal)

							t.true(messages.length > 0, 'nested client got a reload push')
							t.true(messages.join('').includes(marker))
							closeServer()
						}, 2000)
					})
				}, 500)
			})
		}).catch(error => {
			t.fail(error)
			t.end()
		})
	})
})

test.cb('hot reload watches a directory created at runtime (lazy add)', t => {
	t.plan(2)

	getPort().then(port => {
		const flags = {
			dir: fixtureRoot,
			port,
			hotreload: true,
			address: 'localhost',
			silent: true
		}

		const lateDir = path.join(fixtureRoot, 'sub', 'newdir')
		const lateFile = path.join(lateDir, 'x.md')
		const marker = 'LATE-DIR-RELOAD-PROOF'

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

			const openWs = makeOpenWs(flags, fail)

			// Let the service settle, then create the late directory
			setTimeout(() => {
				fs.mkdirSync(lateDir, {recursive: true})
				fs.writeFileSync(lateFile, '# Late\n\nCreated at runtime.\n')

				// Give the rename event time to attach the new watcher
				setTimeout(() => {
					openWs(20, client => {
						ws = client
						ws.on('message', data => messages.push(String(data)))
						ws.send(JSON.stringify({path: '/sub/newdir/x.md'}))

						setTimeout(() => {
							fs.appendFile(lateFile, '\n' + marker + '\n', error => {
								if (error) {
									fail(error)
									return
								}

								setTimeout(() => {
									// Remove the runtime dir for repeated runs
									fs.rmSync(lateDir, {recursive: true, force: true})

									t.true(messages.length > 0, 'late-dir client got a reload push')
									t.true(messages.join('').includes(marker))
									closeServer()
								}, 2000)
							})
						}, 500)
					})
				}, 1000)
			}, 500)
		}).catch(error => {
			t.fail(error)
			t.end()
		})
	})
})

test.cb('excluded directories created at runtime never get handles', t => {
	t.plan(3)

	getPort().then(port => {
		const flags = {
			dir: fixtureRoot,
			port,
			hotreload: true,
			address: 'localhost',
			silent: true
		}

		// Committed exclusions stay pruned; this adds a late subdir
		// inside node_modules and a runtime .git/ (a .git/ fixture
		// cannot be committed — git refuses to index paths under a
		// .git/ component — so that exclusion is exercised at
		// runtime), plus a control directory at the root (must get a
		// lazy-added handle)
		const lateExcluded = path.join(fixtureRoot, 'node_modules', 'late-pkg')
		const lateGit = path.join(fixtureRoot, '.git')
		const lateKept = path.join(fixtureRoot, 'fresh-kept')

		const done = () => {
			t.end()
		}

		markserv.init(flags).then(service => {
			const closeServer = () => {
				service.hotReloadServer.close()
				service.httpServer.close(done)
			}

			// A wss bind failure must not crash the worker
			service.hotReloadServer.on('error', () => {})

			// fail only records: cleanup + a single closeServer live in
			// the finally block below
			const fail = error => {
				t.fail(error)
			}

			setTimeout(() => {
				try {
					fs.mkdirSync(lateExcluded, {recursive: true})
					fs.writeFileSync(path.join(lateExcluded, 'index.js'), 'module.exports = 1\n')
					fs.mkdirSync(lateGit, {recursive: true})
					fs.writeFileSync(path.join(lateGit, 'config'), '[core]\n')
					fs.mkdirSync(lateKept, {recursive: true})
					fs.writeFileSync(path.join(lateKept, 'y.md'), '# Late kept\n')
				} catch (error) {
					fail(error)
				} finally {
					// Give the rename events time to be processed
					setTimeout(() => {
						try {
							const keys = Array.from(service.watchHandles.keys())

							// The control dir got its lazy-added handle
							t.true(keys.some(key => key === lateKept))
							// Nothing is ever watched under an exclusion
							t.false(keys.some(key => key.includes(path.sep + 'node_modules' + path.sep)))
							t.false(keys.some(key => key.includes(path.sep + '.git' + path.sep)))
						} catch (error) {
							fail(error)
						} finally {
							// Remove the runtime dirs for repeated runs
							fs.rmSync(lateExcluded, {recursive: true, force: true})
							fs.rmSync(lateGit, {recursive: true, force: true})
							fs.rmSync(lateKept, {recursive: true, force: true})
							closeServer()
						}
					}, 1000)
				}
			}, 500)
		}).catch(error => {
			t.fail(error)
			t.end()
		})
	})
})

test.cb('watchers are bounded and closed on shutdown', t => {
	t.plan(5)

	getPort().then(port => {
		const flags = {
			dir: fixtureRoot,
			port,
			hotreload: true,
			address: 'localhost',
			silent: true
		}

		const done = () => {
			t.end()
		}

		markserv.init(flags).then(service => {
			const closeServer = () => {
				service.hotReloadServer.close()
				service.httpServer.close(done)
			}

			// A wss bind failure must not crash the worker
			service.hotReloadServer.on('error', () => {})

			// fail only records: closeServer runs once below
			const fail = error => {
				t.fail(error)
			}

			try {
				// Bounded audit: the handle count is <= the collected
				// dir count (the anti-ENOSPC property), every handle
				// points inside the served root, and nothing is
				// watched under an exclusion
				const expected = markserv.collectWatchDirs(fixtureRoot)
				const keys = Array.from(service.watchHandles.keys())

				t.true(service.watchHandles.size <= expected.length,
					'handle count is bounded by the collected dir count')
				t.true(keys.every(key =>
					key === fixtureRootResolved || key.startsWith(fixtureRootResolved + path.sep)),
					'every handle is inside the served root')
				t.false(keys.some(key =>
					key.includes(path.sep + 'node_modules' + path.sep) ||
					key.includes(path.sep + '.git' + path.sep)),
					'no handle under an excluded subtree')

				// Lifecycle: the close path closes every tracked
				// handle (entries are retained for the audit)
				const sizeBefore = service.watchHandles.size
				service.hotReloadServer.closeWatchHandles()

				t.true(Array.from(service.watchHandles.values())
					.every(handle => handle.closed === true),
					'every handle is closed after the close path')
				t.is(service.watchHandles.size, sizeBefore,
					'handle map is retained for the audit')
			} catch (error) {
				fail(error)
			}

			closeServer()
		}).catch(error => {
			t.fail(error)
			t.end()
		})
	})
})
