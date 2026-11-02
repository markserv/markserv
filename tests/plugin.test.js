const path = require('path')
const {get} = require('./http.js')
const test = require('ava')
const markserv = require('../lib/server.js')

// --plugin loads markdown-it plugins from a file path or package name.
// They run after the built-in plugins, so they can wrap built-in rules.

const fixture = name => path.join(__dirname, 'plugin', name)

const startService = extraFlags => markserv.init({
	dir: path.join(__dirname, '..'),
	hotreload: false,
	address: 'localhost',
	silent: true,
	...extraFlags
})

test('rejects a module that does not export a plugin function', async t => {
	await t.throwsAsync(startService({port: 8806, plugin: fixture('not-a-plugin.js')}), {
		message: /must export a markdown-it plugin function/
	})
})

test('rejects a plugin that cannot be found', async t => {
	await t.throwsAsync(startService({port: 8808, plugin: fixture('missing.js')}), {
		message: /module not found/
	})
})

test('applies a plugin after the built-in plugins', async t => {
	const port = 8802 // dedicated port: a random getPort() races across parallel test files (see port-in-use.test.js)
	const service = await startService({port, plugin: [fixture('fence-title.js')]})

	try {
		const res = await get({
			url: `http://localhost:${port}/tests/plugin/plugin.md`,
			timeout: 1000 * 2
		})

		t.is(res.statusCode, 200)
		t.true(res.body.includes('<div class="plugin-title">example.js</div>'))
		// The wrapped rule is highlight.js's, so highlighting still applies
		t.true(res.body.includes('hljs'))
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('applies a plugin only once across init calls', async t => {
	const port = 8804
	const service = await startService({port, plugin: fixture('fence-title.js')})

	try {
		const res = await get({
			url: `http://localhost:${port}/tests/plugin/plugin.md`,
			timeout: 1000 * 2
		})

		t.is(res.body.split('class="plugin-title"').length - 1, 1)
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})
