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

const unitIndex = async () => await searchLib.buildIndex(FIXTURES, {
	exclusions: ['node_modules'],
	slugify,
	markdownExts: ['.md']
})

test('buildIndex indexes the fixture files', async t => {
	const index = await unitIndex()

	t.is(index.entries.size, 3)

	const alpha = index.entries.get('alpha.md')
	t.is(alpha.title, 'Alpha Guide')
	t.true(alpha.headings.some(h => h.slug === 'deep-dive-notes'))
	t.true(index.entries.has('sub/gamma.md'))
})

test('search ranks by occurrence count', async t => {
	const index = await unitIndex()
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

test('search deep-links to heading anchors', async t => {
	const index = await unitIndex()
	const results = searchLib.search(index, 'deep-dive')

	t.is(results.length, 1)
	t.is(results[0].path, 'alpha.md')
	t.is(results[0].anchor, 'deep-dive-notes')
})

test('search handles unicode', async t => {
	const index = await unitIndex()
	const results = searchLib.search(index, '灯塔')

	t.is(results.length, 1)
	t.is(results[0].path, 'beta.md')
})

test('search returns [] for no match and blank query', async t => {
	const index = await unitIndex()

	t.deepEqual(searchLib.search(index, 'zzz-not-present'), [])
	t.deepEqual(searchLib.search(index, '   '), [])
	t.deepEqual(searchLib.search(index, undefined), [])
})

test('buildIndex honours maxFileSize', async t => {
	const index = await searchLib.buildIndex(FIXTURES, {
		exclusions: ['node_modules'],
		slugify,
		markdownExts: ['.md'],
		maxFileSize: 10
	})

	t.is(index.entries.size, 0)
})

test('invalidate refreshes and drops entries', async t => {
	const index = await unitIndex()
	const delta = path.join(FIXTURES, 'delta.md')

	try {
		// New file: appears after invalidate
		fs.writeFileSync(delta, '# Delta\n\nThe quixotic knight rode on.\n')
		await searchLib.invalidate(index, delta)
		let results = searchLib.search(index, 'quixotic')
		t.is(results.length, 1)
		t.is(results[0].path, 'delta.md')
		t.is(results[0].title, 'Delta')

		// Deleted file: entry dropped
		fs.unlinkSync(delta)
		await searchLib.invalidate(index, delta)
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

test('search scope: path prefix filters (unit)', async t => {
	const index = await unitIndex()

	const exact = searchLib.search(index, 'lighthouse', {path: 'alpha.md'})
	t.is(exact.length, 1)
	t.is(exact[0].path, 'alpha.md')

	const dir = searchLib.search(index, 'lighthouse', {path: 'sub/'})
	t.is(dir.length, 1)
	t.is(dir[0].path, 'sub/gamma.md')

	t.is(searchLib.search(index, 'lighthouse', {path: 'all'}).length, 3)
	t.is(searchLib.search(index, 'lighthouse', {path: '../../x'}).length, 0)

	const leadingSlash = searchLib.search(index, 'lighthouse', {path: '/beta.md'})
	t.is(leadingSlash.length, 1)
	t.is(leadingSlash[0].path, 'beta.md')
})

test('search endpoint honours the path parameter', async t => {
	const port = await getPort()
	const service = await markserv.init({
		dir: FIXTURES,
		port,
		hotreload: false,
		address: 'localhost',
		silent: true
	})

	try {
		const sub = await get({
			url: `http://localhost:${port}/__markserv/search?q=lighthouse&path=sub/`,
			timeout: 1000 * 2
		})
		t.is(sub.statusCode, 200)
		const subResults = JSON.parse(sub.body)
		t.is(subResults.length, 1)
		t.is(subResults[0].path, 'sub/gamma.md')

		const exact = await get({
			url: `http://localhost:${port}/__markserv/search?q=lighthouse&path=alpha.md`,
			timeout: 1000 * 2
		})
		t.is(JSON.parse(exact.body).length, 1)

		const all = await get({
			url: `http://localhost:${port}/__markserv/search?q=lighthouse&path=all`,
			timeout: 1000 * 2
		})
		t.is(JSON.parse(all.body).length, 3)
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

const IMPLANT_FIXTURES = path.join(__dirname, 'implant-search-fixtures')

test('search indexes implanted content when templates are on', async t => {
	const port = await getPort()
	const service = await markserv.init({
		dir: IMPLANT_FIXTURES,
		port,
		hotreload: false,
		address: 'localhost',
		silent: true,
		templates: true
	})

	try {
		const res = await get({
			url: `http://localhost:${port}/__markserv/search?q=cryptex`,
			timeout: 1000 * 5
		})

		t.is(res.statusCode, 200)
		const results = JSON.parse(res.body)
		t.is(results.length, 1)
		t.is(results[0].path, 'doc.md')
		t.true(results[0].snippet.toLowerCase().includes('cryptex'))
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('search does not index implanted content in raw mode', async t => {
	const port = await getPort()
	const service = await markserv.init({
		dir: IMPLANT_FIXTURES,
		port,
		hotreload: false,
		address: 'localhost',
		silent: true
	})

	try {
		const res = await get({
			url: `http://localhost:${port}/__markserv/search?q=cryptex`,
			timeout: 1000 * 2
		})

		t.is(res.statusCode, 200)
		t.deepEqual(JSON.parse(res.body), [])
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('standalone export carries implanted content', async t => {
	const port = await getPort()
	const service = await markserv.init({
		dir: IMPLANT_FIXTURES,
		port,
		hotreload: false,
		address: 'localhost',
		silent: true,
		templates: true
	})

	try {
		const res = await get({
			url: `http://localhost:${port}/__markserv/export/doc.md?format=html`,
			timeout: 1000 * 5
		})

		t.is(res.statusCode, 200)
		t.true(res.body.includes('cryptex'))
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('render cache: hit, mtime invalidation, single re-render', async t => {
	let renders = 0
	const stub = async () => {
		renders += 1
		return {contentHtml: '<p>cached body</p>', deps: new Set()}
	}

	const index = await searchLib.buildIndex(IMPLANT_FIXTURES, {
		exclusions: ['node_modules'],
		slugify,
		markdownExts: ['.md'],
		render: stub
	})

	t.is(renders, 2) // doc.md + plain.md

	const absDoc = path.join(IMPLANT_FIXTURES, 'doc.md')
	t.is(searchLib.renderFromIndex(index, absDoc), '<p>cached body</p>')
	t.is(renders, 2) // cache hit — no re-render

	// mtime change → miss
	const st = fs.statSync(absDoc)
	fs.utimesSync(absDoc, st.atime, new Date(st.mtimeMs + 5000))
	t.is(searchLib.renderFromIndex(index, absDoc), null)

	// invalidate re-renders exactly once (no implant deps → no
	// transitive re-renders)
	await searchLib.invalidate(index, absDoc)
	t.is(renders, 3)
	t.is(searchLib.renderFromIndex(index, absDoc), '<p>cached body</p>')
})
