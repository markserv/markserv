const path = require('path')
const {get} = require('./http.js')
const test = require('ava')
const getPort = require('get-port')
const markserv = require('../lib/server.js')

// The mermaid client library is served locally from the mermaid npm
// package through the {markserv} media allow-list, and diagram link
// behavior is controlled by the mermaidLoose flag (strict by default).

const startService = extraFlags => markserv.init({
	dir: path.join(__dirname, '..'),
	hotreload: false,
	address: 'localhost',
	silent: true,
	...extraFlags
})

test('served page defaults to mermaid strict security', async t => {
	const port = await getPort()
	const service = await startService({port})

	try {
		const res = await get({
			url: `http://localhost:${port}/tests/mermaid.md`,
			timeout: 1000 * 2
		})

		t.is(res.statusCode, 200)
		// Strict by default: mermaid sanitizes diagram link targets
		// (javascript: urls inert; plain urls still clickable)
		t.true(res.body.includes("securityLevel: 'strict'"))
		// The library is served locally, not from a CDN
		t.true(res.body.includes('{markserv}media/mermaid.min.js'))
		t.false(res.body.includes('cdn.jsdelivr.net/npm/mermaid'))
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('mermaidLoose flag serves the page with mermaid loose security', async t => {
	const port = await getPort()
	const service = await startService({port, mermaidLoose: true})

	try {
		const res = await get({
			url: `http://localhost:${port}/tests/mermaid.md`,
			timeout: 1000 * 2
		})

		t.is(res.statusCode, 200)
		// --mermaid-loose: mermaid link-target sanitization lifted
		t.true(res.body.includes("securityLevel: 'loose'"))
		t.true(res.body.includes('{markserv}media/mermaid.min.js'))
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('serves the vendored mermaid dist via the media route', async t => {
	const port = await getPort()
	const service = await startService({port})

	try {
		const res = await get({
			url: `http://localhost:${port}/%7Bmarkserv%7Dmedia/mermaid.min.js`,
			timeout: 1000 * 10
		})

		t.is(res.statusCode, 200)
		// The full minified library, not an error page
		t.true(res.body.length > 1000000)
		t.true(res.body.includes('mermaid'))
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('{markserv} media suffixes are not a path bridge into node_modules', async t => {
	const port = await getPort()
	const service = await startService({port})

	try {
		// The media/ key is exact-match only; a traversal suffix falls
		// through to the lib/-confined handler and is refused
		const res = await get({
			url: `http://localhost:${port}/%7Bmarkserv%7Dmedia/..%2F..%2Fpackage.json`,
			timeout: 1000 * 2
		})

		t.is(res.statusCode, 403)
		t.is(res.body, 'Forbidden')
		t.false(res.body.includes('"name": "markserv"'))
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})
