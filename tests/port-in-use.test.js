const net = require('net')
const path = require('path')
const test = require('ava')
const getPort = require('get-port')
const markserv = require('../lib/server.js')

const dir = path.join(__dirname, '..')

const hold = port => new Promise((resolve, reject) => {
	const server = net.createServer()
	server.once('error', reject)
	server.listen(port, 'localhost', () => resolve(server))
})

const close = server => new Promise(resolve => server.close(resolve))

const stop = async service => {
	if (service.hotReloadServer) {
		service.hotReloadServer.close()
	}
	await new Promise(resolve => service.httpServer.close(resolve))
}

test.serial('explicit --port that is in use fails with a clear error', async t => {
	// A dedicated port at the top of the default range: a random
	// getPort() here would add a cross-file port race with the other
	// parallel test files (the kernel reassigns recently freed
	// ephemeral ports, so a just-released random port is the first one
	// another file's getPort() can pick up).
	const port = 8742
	const blocker = await hold(port)

	try {
		const error = await t.throwsAsync(markserv.init({
			dir,
			port,
			hotreload: false,
			address: 'localhost',
			silent: true
		}))
		t.is(error.message, `port ${port} is already in use; pass another --port, or omit it to use the next free port`)
	} finally {
		await close(blocker)
	}
})

test.serial('without --port, takes the next free port after one in use', async t => {
	// The first free port from the default 8642 is the one markserv
	// would pick; hold it so markserv has to move past it.
	const taken = await getPort({port: getPort.makeRange(8642, 8742), host: 'localhost'})
	const blocker = await hold(taken)

	try {
		const service = await markserv.init({
			dir,
			hotreload: false,
			address: 'localhost',
			silent: true
		})
		const {port} = service.httpServer.address()
		await close(service.httpServer)
		t.true(port > taken && port <= 8742)
	} finally {
		await close(blocker)
	}
})

// A small directory keeps the hot-reload watchers (test 3) bounded.
const fixtureDir = path.join(__dirname, 'testdir')

test.serial('two instances without --port coexist on distinct ports', async t => {
	// The reported scenario: a second markserv started while the
	// first holds its http port (and its ws port) must land on the
	// next free ports instead of crashing with EADDRINUSE — and must
	// not take the first instance's ws port.
	const first = await markserv.init({
		dir: fixtureDir,
		hotreload: true,
		address: 'localhost',
		silent: true
	})

	try {
		const firstHttp = first.httpServer.address().port
		const firstWs = first.hotReloadServer.address().port
		// get-port keeps a per-process lock table of recently returned
		// ports, so the first instance of this file may start above
		// 8642 even when it is free — what matters is that both
		// instances stay within the default range and on distinct ports.
		t.true(firstHttp >= 8642 && firstHttp <= 8742, `expected the default range, got ${firstHttp}`)

		const second = await markserv.init({
			dir: fixtureDir,
			hotreload: true,
			address: 'localhost',
			silent: true
		})

		try {
			const secondHttp = second.httpServer.address().port
			const secondWs = second.hotReloadServer.address().port
			t.true(secondHttp !== firstHttp, 'second http port must differ')
			t.true(secondHttp !== firstWs, `second http port must not steal the first instance's ws port ${firstWs}`)
			t.true(secondHttp <= 8742, `expected a port within the default range, got ${secondHttp}`)
			t.true(secondWs !== firstWs, 'second ws port must differ')
		} finally {
			await stop(second)
		}
	} finally {
		await stop(first)
	}
})
