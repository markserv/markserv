const path = require('path')
const {get} = require('./http.js')
const test = require('ava')
const getPort = require('get-port')
const markserv = require('../lib/server.js')

// The mermaid client library (v11 code-split ESM dist) is served
// locally under the reserved /vendor/mermaid/ prefix, and diagram link
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
		t.true(res.body.includes('/vendor/mermaid/mermaid.esm.min.mjs'))
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
		t.true(res.body.includes('/vendor/mermaid/mermaid.esm.min.mjs'))
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('serves the vendored mermaid ESM shim and its chunks', async t => {
	const port = await getPort()
	const service = await startService({port})

	try {
		const shim = await get({
			url: `http://localhost:${port}/vendor/mermaid/mermaid.esm.min.mjs`,
			timeout: 1000 * 5
		})

		t.is(shim.statusCode, 200)
		// The ESM shim, not an error page
		t.true(shim.body.includes('export'))
		t.true(shim.body.includes('import'))

		// One of the shim's chunk imports resolves through the same
		// reserved prefix (the code-split dist is servable end-to-end)
		const chunkMatch = shim.body.match(/from"\.\/(chunks\/[^"]+\.mjs)"/)
		t.truthy(chunkMatch, 'shim references a local chunk')

		const chunk = await get({
			url: `http://localhost:${port}/vendor/mermaid/${chunkMatch[1]}`,
			timeout: 1000 * 5
		})

		t.is(chunk.statusCode, 200)
		// Chunk files are ESM (re-export shims or code) — served, not an
		// error page
		t.true(chunk.body.length > 0)
		t.true(/import|export/.test(chunk.body))
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('/vendor/mermaid/ suffixes are not a path bridge into node_modules', async t => {
	const port = await getPort()
	const service = await startService({port})

	try {
		// The prefix is confined to the mermaid dist root; a traversal
		// suffix escapes it and is refused
		const res = await get({
			url: `http://localhost:${port}/vendor/mermaid/../../package.json`,
			timeout: 1000 * 2
		})

		t.is(res.statusCode, 403)
		t.is(res.body, 'Forbidden')
		t.false(res.body.includes('"name": "markserv"'))
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})
