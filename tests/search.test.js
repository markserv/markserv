const fs = require('fs')
const path = require('path')
const {get} = require('./http.js')
const test = require('ava')
const getPort = require('get-port')
const markserv = require('../lib/server.js')
const searchLib = require('../lib/search.js')

// Unit-level slugify: a copy of server.js's slugify (the unit path
// can't require server.js without booting its module state); the
// integration path exercises the real one end to end.
const slugify = text => {
	return text.toLowerCase().replace(/\s/g, '-')
		// Remove punctuations other than hyphen and underscore
		.replace(/[`~!@#$%^&*()+=<>?,./:;"'|{}[\]\\\u2000-\u206F\u2E00-\u2E7F]/g, '')
		// Remove CJK punctuations
		.replace(/[\u3000。？！，、；：“”【】（）〔〕［］﹃﹄“”‘’﹁﹂—…－～《》〈〉「」]/g, '')
}

const FIXTURES = path.join(__dirname, 'search-fixtures')

const unitIndex = () => searchLib.buildIndex(FIXTURES, {
	exclusions: ['node_modules'],
	slugify,
	markdownExts: ['.md']
})

test('buildIndex indexes the fixture files', t => {
	const index = unitIndex()

	t.is(index.entries.size, 3)

	const alpha = index.entries.get('alpha.md')
	t.is(alpha.title, 'Alpha Guide')
	t.true(alpha.headings.some(h => h.slug === 'deep-dive-notes'))
	t.true(index.entries.has('sub/gamma.md'))
})

test('search ranks by occurrence count', t => {
	const index = unitIndex()
	const results = searchLib.search(index, 'lighthouse')

	t.is(results.length, 3)
	// alpha has 3 occurrences, beta and gamma one each
	t.is(results[0].path, 'alpha.md')
	t.is(results[0].score, 3)
	t.true(results[0].snippet.toLowerCase().includes('lighthouse'))
	t.is(results[0].anchor, null)
	t.is(results[1].path, 'beta.md')
	t.is(results[2].path, 'sub/gamma.md')
})

test('search deep-links to heading anchors', t => {
	const index = unitIndex()
	const results = searchLib.search(index, 'deep-dive')

	t.is(results.length, 1)
	t.is(results[0].path, 'alpha.md')
	t.is(results[0].anchor, 'deep-dive-notes')
})

test('search handles unicode', t => {
	const index = unitIndex()
	const results = searchLib.search(index, '灯塔')

	t.is(results.length, 1)
	t.is(results[0].path, 'beta.md')
})

test('search returns [] for no match and blank query', t => {
	const index = unitIndex()

	t.deepEqual(searchLib.search(index, 'zzz-not-present'), [])
	t.deepEqual(searchLib.search(index, '   '), [])
	t.deepEqual(searchLib.search(index, undefined), [])
})

test('buildIndex honours maxFileSize', t => {
	const index = searchLib.buildIndex(FIXTURES, {
		exclusions: ['node_modules'],
		slugify,
		markdownExts: ['.md'],
		maxFileSize: 10
	})

	t.is(index.entries.size, 0)
})

test('invalidate refreshes and drops entries', async t => {
	const index = unitIndex()
	const delta = path.join(FIXTURES, 'delta.md')

	try {
		// New file: appears after invalidate
		fs.writeFileSync(delta, '# Delta\n\nThe quixotic knight rode on.\n')
		searchLib.invalidate(index, delta)
		let results = searchLib.search(index, 'quixotic')
		t.is(results.length, 1)
		t.is(results[0].path, 'delta.md')
		t.is(results[0].title, 'Delta')

		// Deleted file: entry dropped
		fs.unlinkSync(delta)
		searchLib.invalidate(index, delta)
		results = searchLib.search(index, 'quixotic')
		t.deepEqual(results, [])
		t.is(index.entries.size, 3)
	} finally {
		if (fs.existsSync(delta)) {
			fs.unlinkSync(delta)
		}
	}
})

test('search endpoint serves JSON results', async t => {
	const port = await getPort()
	const service = await markserv.init({
		dir: FIXTURES,
		port,
		hotreload: false,
		address: 'localhost',
		silent: true
	})

	try {
		const res = await get({
			url: `http://localhost:${port}/__markserv/search?q=lighthouse`,
			timeout: 1000 * 2
		})

		t.is(res.statusCode, 200)
		t.is(res.headers['content-type'], 'application/json; charset=utf-8')

		const results = JSON.parse(res.body)
		t.is(results.length, 3)
		t.is(results[0].path, 'alpha.md')
		results.forEach(r => {
			t.true(r.snippet.toLowerCase().includes('lighthouse'))
		})
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('search endpoint with empty q and limit', async t => {
	const port = await getPort()
	const service = await markserv.init({
		dir: FIXTURES,
		port,
		hotreload: false,
		address: 'localhost',
		silent: true
	})

	try {
		const empty = await get({
			url: `http://localhost:${port}/__markserv/search?q=`,
			timeout: 1000 * 2
		})
		t.is(empty.statusCode, 200)
		t.is(empty.body, '[]')

		const limited = await get({
			url: `http://localhost:${port}/__markserv/search?q=lighthouse&limit=2`,
			timeout: 1000 * 2
		})
		t.is(limited.statusCode, 200)
		t.is(JSON.parse(limited.body).length, 2)
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('search endpoint 503s when disabled', async t => {
	const port = await getPort()
	const service = await markserv.init({
		dir: FIXTURES,
		port,
		hotreload: false,
		address: 'localhost',
		silent: true,
		search: false
	})

	try {
		const res = await get({
			url: `http://localhost:${port}/__markserv/search?q=lighthouse`,
			timeout: 1000 * 2
		})

		t.is(res.statusCode, 503)
		t.deepEqual(JSON.parse(res.body), {error: 'search disabled'})
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})
