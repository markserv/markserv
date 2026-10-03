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

test('explicit --port that is in use fails with a clear error', async t => {
	const port = await getPort({host: 'localhost'})
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

test('without --port, takes the next free port after one in use', async t => {
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
