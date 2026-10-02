const fs = require('fs')
const path = require('path')
const {get} = require('./http.js')
const test = require('ava')
const getPort = require('get-port')
const WebSocket = require('ws')
const markserv = require('../lib/server.js')

// Fixtures: the served root is tests/path-traversal/public; secret.md
// sits in its parent and must never be readable through the server.
const fixtureDir = path.join(__dirname, 'path-traversal')
const servedDir = path.join(fixtureDir, 'public')
const secretFile = path.join(fixtureDir, 'secret.md')
const marker = 'SECRET-139-MARKER'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// The handshake can transiently hit a port another parallel test file
// owns; retry before giving up.
const openWs = (url, attempts) => new Promise((resolve, reject) => {
	const tryConnect = left => {
		const ws = new WebSocket(url)
		ws.on('error', () => {
			ws.terminate()
			if (left > 1) {
				setTimeout(() => tryConnect(left - 1), 100)
				return
			}
			reject(new Error('ws connect failed'))
		})
		ws.on('open', () => resolve(ws))
	}
	tryConnect(attempts)
})

test('traversal of an out-of-root file is refused (403)', async t => {
	const port = await getPort()
	const service = await markserv.init({
		dir: servedDir,
		port,
		hotreload: false,
		address: 'localhost',
		silent: true
	})

	try {
		const res = await get({
			url: `http://localhost:${port}/a.md/../../secret.md`,
			timeout: 1000 * 2
		})

		t.is(res.statusCode, 403)
		t.is(res.body, 'Forbidden')
		t.false(res.body.includes(marker))
		t.false(res.body.includes(secretFile))
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('traversal to a missing out-of-root file leaks nothing (403)', async t => {
	const port = await getPort()
	const service = await markserv.init({
		dir: servedDir,
		port,
		hotreload: false,
		address: 'localhost',
		silent: true
	})

	try {
		const res = await get({
			url: `http://localhost:${port}/a.md/../../nope.md`,
			timeout: 1000 * 2
		})

		t.is(res.statusCode, 403)
		t.is(res.body, 'Forbidden')
		t.false(res.body.includes('ENOENT'))
		t.false(res.body.includes(fixtureDir))
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('{markserv} urls cannot escape lib/', async t => {
	const port = await getPort()
	const service = await markserv.init({
		dir: servedDir,
		port,
		hotreload: false,
		address: 'localhost',
		silent: true
	})

	try {
		// Traversal above lib/: was the full package.json before the fix
		const forbidden = await get({
			url: `http://localhost:${port}/%7Bmarkserv%7D../package.json`,
			timeout: 1000 * 2
		})

		t.is(forbidden.statusCode, 403)
		t.is(forbidden.body, 'Forbidden')

		// Legit internal url still served
		const css = await get({
			url: `http://localhost:${port}/%7Bmarkserv%7Dtemplates/markserv.css`,
			timeout: 1000 * 2
		})

		t.is(css.statusCode, 200)
		t.true(css.body.includes('markserv'))
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('in-root requests are unaffected (200)', async t => {
	const port = await getPort()
	const service = await markserv.init({
		dir: servedDir,
		port,
		hotreload: false,
		address: 'localhost',
		silent: true
	})

	try {
		const res = await get({
			url: `http://localhost:${port}/a.md`,
			timeout: 1000 * 2
		})

		t.is(res.statusCode, 200)
		t.true(res.body.includes('<h1 id="harmless">Harmless</h1>'))
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('in-root 404 keeps the existing error page shape', async t => {
	const port = await getPort()
	const service = await markserv.init({
		dir: servedDir,
		port,
		hotreload: false,
		address: 'localhost',
		silent: true
	})

	try {
		const res = await get({
			url: `http://localhost:${port}/nope.md`,
			timeout: 1000 * 2
		})

		// Pre-existing behavior: in-root 404 pages are served with
		// status 200 (error-page-404 fixture test depends on shape)
		t.is(res.statusCode, 200)
		t.true(res.body.includes('<title>404:'))
		t.true(res.body.includes(path.join(servedDir, 'nope.md')))
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test.serial('hot reload does not push content for out-of-root paths', async t => {
	const port = await getPort()
	const aMdPath = path.join(servedDir, 'a.md')
	const aMdOriginal = fs.readFileSync(aMdPath, 'utf8')

	const flags = {
		dir: servedDir,
		port,
		hotreload: true,
		address: 'localhost',
		silent: true
	}

	const service = await markserv.init(flags)
	// A wss bind failure must not crash the worker
	service.hotReloadServer.on('error', () => {})

	const evilWs = await openWs(`ws://localhost:${flags.$wsPort}`, 20)
	const goodWs = await openWs(`ws://localhost:${flags.$wsPort}`, 20)

	const evilMessages = []
	const goodMessages = []

	try {
		// A client that registers the PoC traversal path
		evilWs.on('message', data => evilMessages.push(String(data)))
		// A control client that registers the in-root path
		goodWs.on('message', data => goodMessages.push(String(data)))

		evilWs.send(JSON.stringify({path: '/a.md/../../secret.md'}))
		goodWs.send(JSON.stringify({path: '/a.md'}))

		// Both registered: trigger the file watcher
		fs.appendFileSync(aMdPath, '\nhot\n')
		await sleep(1500)

		// Control client got the reload push
		t.true(goodMessages.length > 0)
		// Out-of-root client got nothing
		t.is(evilMessages.length, 0)
		t.false(evilMessages.join('').includes(marker))
	} finally {
		// Restore the fixture for repeated runs
		fs.writeFileSync(aMdPath, aMdOriginal)
		evilWs.close()
		goodWs.close()
		service.hotReloadServer.close()
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('implants cannot read out-of-root files (templates mode)', async t => {
	const port = await getPort()
	const service = await markserv.init({
		dir: servedDir,
		port,
		hotreload: false,
		templates: true,
		address: 'localhost',
		silent: true
	})

	try {
		const res = await get({
			url: `http://localhost:${port}/implant-evil.md`,
			timeout: 1000 * 2
		})

		// The page still renders; the escaping implants are refused
		t.is(res.statusCode, 200)
		t.false(res.body.includes(marker))
		t.false(res.body.includes('must never be readable'))
		t.false(res.body.includes(secretFile))
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('in-root implants still resolve (templates mode)', async t => {
	const port = await getPort()
	const service = await markserv.init({
		dir: servedDir,
		port,
		hotreload: false,
		templates: true,
		address: 'localhost',
		silent: true
	})

	try {
		const res = await get({
			url: `http://localhost:${port}/implant-good.md`,
			timeout: 1000 * 2
		})

		t.is(res.statusCode, 200)
		// {file:} inlines the raw source, {markdown:} the rendered html
		t.true(res.body.includes('Just a doc in the served root.'))
		t.true(res.body.includes('<h1 id="harmless">Harmless</h1>'))
		t.false(res.body.includes(marker))
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test.serial('hot reload implants cannot push out-of-root content', async t => {
	const port = await getPort()
	const hotImplantPath = path.join(servedDir, 'hot-implant.md')
	const hotImplantOriginal = fs.readFileSync(hotImplantPath, 'utf8')

	const flags = {
		dir: servedDir,
		port,
		hotreload: true,
		address: 'localhost',
		silent: true
	}

	const service = await markserv.init(flags)
	// A wss bind failure must not crash the worker
	service.hotReloadServer.on('error', () => {})

	const ws = await openWs(`ws://localhost:${flags.$wsPort}`, 20)

	const messages = []

	try {
		// A client that registers the in-root path; the traversal
		// lives in the implanted file content, not the client path
		ws.on('message', data => messages.push(String(data)))
		ws.send(JSON.stringify({path: '/hot-implant.md'}))

		// Trigger the file watcher with an escaping implant
		fs.appendFileSync(hotImplantPath, '\n{file:../secret.md}\n')
		await sleep(1500)

		// The client got the reload push...
		t.true(messages.length > 0)
		// ...but the escaping implant never reached it
		t.false(messages.join('').includes(marker))
		t.false(messages.join('').includes('must never be readable'))
	} finally {
		// Restore the fixture for repeated runs
		fs.writeFileSync(hotImplantPath, hotImplantOriginal)
		ws.close()
		service.hotReloadServer.close()
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})
