const fs = require('fs')
const path = require('path')
const test = require('ava')
const getPort = require('get-port')
const WebSocket = require('ws')
const markserv = require('../lib/server.js')

// Fixtures: tests/watch-fixtures is the served root. It contains the
// excluded subtrees (node_modules, .git), a FILE named like an
// exclusion (node_modules.txt), and a symlink (link -> sub) the
// walk must not follow. See the committed fixture tree.
const fixtureRoot = path.join(__dirname, 'watch-fixtures')
const fixtureRootResolved = path.resolve(fixtureRoot)

const relToRoot = absPath => path.relative(fixtureRoot, absPath)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

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
// file owns; retry before giving up.
const openWs = (flags, attempts) => new Promise((resolve, reject) => {
	const tryConnect = left => {
		const wsClient = new WebSocket(`ws://localhost:${flags.$wsPort}`)
		wsClient.on('error', () => {
			wsClient.terminate()
			if (left > 1) {
				setTimeout(() => tryConnect(left - 1), 150)
				return
			}

			reject(new Error('ws connect failed'))
		})

		wsClient.on('open', () => {
			resolve(wsClient)
		})
	}

	tryConnect(attempts)
})

// The server tests below run serial: concurrent init() calls in one
// file pull adjacent ephemeral ports (macOS hands them out
// sequentially) and init guesses the ws port as httpPort + 1, so
// parallel pipelines in the same file collide on the wss bind
// (EADDRINUSE). Serial keeps the file's port pipelines exclusive;
// cross-file races are covered by the wss error tolerance in
// startHotReload plus the client handshake retry below.

test.serial('hot reload pushes for a nested file (watchers cover subdirs)', async t => {
	const port = await getPort()
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

	const service = await markserv.init(flags)
	// A wss bind failure must not crash the worker
	service.hotReloadServer.on('error', () => {})

	const ws = await openWs(flags, 20)
	const messages = []

	try {
		// A client registered at the NESTED path
		ws.on('message', data => messages.push(String(data)))
		ws.send(JSON.stringify({path: '/sub/nested.md'}))

		// Let the registration settle, then trigger the watcher on a
		// nested file
		await sleep(500)
		fs.appendFileSync(nestedPath, '\n' + marker + '\n')
		await sleep(2000)

		t.true(messages.length > 0, 'nested client got a reload push')
		t.true(messages.join('').includes(marker))
	} finally {
		// Restore the fixture for repeated runs
		fs.writeFileSync(nestedPath, nestedOriginal)
		ws.close()
		service.hotReloadServer.close()
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test.serial('hot reload watches a directory created at runtime (lazy add)', async t => {
	const port = await getPort()
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

	const service = await markserv.init(flags)
	// A wss bind failure must not crash the worker
	service.hotReloadServer.on('error', () => {})

	const messages = []

	try {
		// Let the service settle, then create the late directory
		await sleep(500)
		fs.mkdirSync(lateDir, {recursive: true})
		fs.writeFileSync(lateFile, '# Late\n\nCreated at runtime.\n')

		// Give the rename event time to attach the new watcher
		await sleep(1000)

		const ws = await openWs(flags, 20)
		try {
			ws.on('message', data => messages.push(String(data)))
			ws.send(JSON.stringify({path: '/sub/newdir/x.md'}))

			// Trigger the watcher on the late file
			await sleep(500)
			fs.appendFileSync(lateFile, '\n' + marker + '\n')
			await sleep(2000)

			t.true(messages.length > 0, 'late-dir client got a reload push')
			t.true(messages.join('').includes(marker))
		} finally {
			ws.close()
		}
	} finally {
		// Remove the runtime dir for repeated runs
		fs.rmSync(lateDir, {recursive: true, force: true})
		service.hotReloadServer.close()
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test.serial('excluded directories created at runtime never get handles', async t => {
	const port = await getPort()
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

	const service = await markserv.init(flags)
	// A wss bind failure must not crash the worker
	service.hotReloadServer.on('error', () => {})

	try {
		// Let the service settle, then create the runtime dirs
		await sleep(500)
		fs.mkdirSync(lateExcluded, {recursive: true})
		fs.writeFileSync(path.join(lateExcluded, 'index.js'), 'module.exports = 1\n')
		fs.mkdirSync(lateGit, {recursive: true})
		fs.writeFileSync(path.join(lateGit, 'config'), '[core]\n')
		fs.mkdirSync(lateKept, {recursive: true})
		fs.writeFileSync(path.join(lateKept, 'y.md'), '# Late kept\n')

		// Give the rename events time to be processed
		await sleep(1000)

		const keys = Array.from(service.watchHandles.keys())

		// The control dir got its lazy-added handle
		t.true(keys.some(key => key === lateKept))
		// Nothing is ever watched under an exclusion
		t.false(keys.some(key => key.includes(path.sep + 'node_modules' + path.sep)))
		t.false(keys.some(key => key.includes(path.sep + '.git' + path.sep)))
	} finally {
		// Remove the runtime dirs for repeated runs
		fs.rmSync(lateExcluded, {recursive: true, force: true})
		fs.rmSync(lateGit, {recursive: true, force: true})
		fs.rmSync(lateKept, {recursive: true, force: true})
		service.hotReloadServer.close()
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test.serial('watchers are bounded and closed on shutdown', async t => {
	const port = await getPort()
	const flags = {
		dir: fixtureRoot,
		port,
		hotreload: true,
		address: 'localhost',
		silent: true
	}

	const service = await markserv.init(flags)
	// A wss bind failure must not crash the worker
	service.hotReloadServer.on('error', () => {})

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
	} finally {
		service.hotReloadServer.close()
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})
