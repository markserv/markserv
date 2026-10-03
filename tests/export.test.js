const fs = require('fs')
const path = require('path')
const {get} = require('./http.js')
const test = require('ava')
const getPort = require('get-port')
const markserv = require('../lib/server.js')

// The export endpoint lives under the reserved /__markserv/ prefix.
// hotreload is deliberately true: the standalone export must strip
// the hot-reload ws script (and the rest of the page chrome) even
// when the serving instance has hot reload enabled.

const startService = extraFlags => markserv.init({
	dir: path.join(__dirname, '..'),
	port: undefined,
	hotreload: true,
	address: 'localhost',
	silent: true,
	...extraFlags
})

test('export markdown source (format=md)', async t => {
	const port = await getPort()
	const service = await startService({port})

	try {
		const res = await get({
			url: `http://localhost:${port}/__markserv/export/tests/tables.md?format=md`,
			timeout: 1000 * 2
		})

		t.is(res.statusCode, 200)
		t.is(res.headers['content-type'], 'text/plain; charset=utf-8')
		t.is(res.headers['content-disposition'], 'attachment; filename="tables.md"')
		t.is(res.body, fs.readFileSync(path.join(__dirname, 'tables.md'), 'utf8'))
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('export standalone HTML (format=html)', async t => {
	const port = await getPort()
	const service = await startService({port})

	try {
		const res = await get({
			url: `http://localhost:${port}/__markserv/export/tests/tables.md?format=html`,
			timeout: 1000 * 5
		})

		t.is(res.statusCode, 200)
		t.is(res.headers['content-type'], 'text/html; charset=utf-8')
		t.is(res.headers['content-disposition'], 'attachment; filename="tables.md.html"')

		// Rendered content + theme CSS stay
		t.true(res.body.includes('<table>'))
		t.true(res.body.includes('github-markdown-dark.css'))

		// Page chrome is stripped from the standalone export, even
		// though this instance has hot reload enabled
		t.false(res.body.includes('width-slider'))
		t.false(res.body.includes('theme-toggle'))
		t.false(res.body.includes('ws://localhost'))
		t.false(res.body.includes('site-search'))
		t.false(res.body.includes('page-actions'))
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('export refuses path traversal (403)', async t => {
	const port = await getPort()
	const service = await startService({port})

	try {
		// Raw path as written — no client-side dot-segment
		// normalization (tests/http.js contract)
		const res = await get({
			url: `http://localhost:${port}/__markserv/export/../../package.json?format=md`,
			timeout: 1000 * 2
		})

		t.is(res.statusCode, 403)
		t.is(res.body, 'Forbidden')
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('export error paths (404/400)', async t => {
	const port = await getPort()
	const service = await startService({port})

	try {
		// format=html on a non-markdown, non-html file
		const jsRes = await get({
			url: `http://localhost:${port}/__markserv/export/tests/http.js?format=html`,
			timeout: 1000 * 2
		})
		t.is(jsRes.statusCode, 404)
		t.is(jsRes.body, 'Not Found')

		// Unknown format
		const badRes = await get({
			url: `http://localhost:${port}/__markserv/export/tests/tables.md?format=pdf`,
			timeout: 1000 * 2
		})
		t.is(badRes.statusCode, 400)
		t.is(badRes.body, 'Bad Request')

		// Missing file
		const missingRes = await get({
			url: `http://localhost:${port}/__markserv/export/tests/missing.md?format=md`,
			timeout: 1000 * 2
		})
		t.is(missingRes.statusCode, 404)
		t.is(missingRes.body, 'Not Found')

		// Unknown subroute under the reserved prefix
		const unknownRes = await get({
			url: `http://localhost:${port}/__markserv/unknown`,
			timeout: 1000 * 2
		})
		t.is(unknownRes.statusCode, 404)
		t.is(unknownRes.body, 'Not Found')
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('export directory as zip (format=zip)', async t => {
	const port = await getPort()
	const service = await startService({port})

	try {
		const res = await get({
			url: `http://localhost:${port}/__markserv/export/tests/testdir/?format=zip`,
			timeout: 1000 * 5
		})

		t.is(res.statusCode, 200)
		t.is(res.headers['content-type'], 'application/zip')
		t.is(res.headers['content-disposition'], 'attachment; filename="testdir.zip"')
		// Zip magic bytes (PK)
		t.is(Buffer.from(res.body).slice(0, 2).toString(), 'PK')
		t.true(Buffer.byteLength(res.body) > 100)
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('export format=zip on a file is 404', async t => {
	const port = await getPort()
	const service = await startService({port})

	try {
		const res = await get({
			url: `http://localhost:${port}/__markserv/export/tests/tables.md?format=zip`,
			timeout: 1000 * 2
		})

		t.is(res.statusCode, 404)
		t.is(res.body, 'Not Found')
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})
