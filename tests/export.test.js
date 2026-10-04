const fs = require('fs')
const path = require('path')
const child_process = require('child_process')
const {get} = require('./http.js')
const test = require('ava')
const getPort = require('get-port')
const markserv = require('../lib/server.js')
const searchLib = require('../lib/search.js')
const siteExportLib = require('../lib/site-export.js')

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

		// Rendered content + inlined stylesheets stay: the six
		// {markserv} <link> tags are replaced by <style> elements
		// (theme links keep their ids; disabled is preserved)
		t.true(res.body.includes('<table>'))
		t.true(res.body.includes('<style id="theme-dark">'))
		t.true(res.body.includes('color-scheme: dark'))
		t.false(res.body.includes('{markserv}'))

		// Reading chrome is kept in the standalone export (the
		// reader can adjust width/theme); the search box, export
		// menu, and hot-reload script stay stripped even though
		// this instance has hot reload enabled. (The inlined CSS
		// carries the chrome selectors, so assert on the markup.)
		t.true(res.body.includes('width-slider'))
		t.true(res.body.includes('theme-toggle'))
		t.false(res.body.includes('ws://localhost'))
		t.false(res.body.includes('id="site-search-input"'))
		t.false(res.body.includes('class="page-actions"'))
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
		// Zip magic bytes (PK), from the raw buffer (binary-safe)
		t.is(res.buffer.slice(0, 2).toString(), 'PK')
		t.true(res.buffer.length > 100)
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

test('export directory as site (format=site)', async t => {
	const port = await getPort()
	const service = await startService({port})

	try {
		const res = await get({
			url: `http://localhost:${port}/__markserv/export/tests/site-export-fixtures/?format=site`,
			timeout: 1000 * 10
		})

		t.is(res.statusCode, 200)
		t.is(res.headers['content-type'], 'application/zip')
		t.is(res.headers['content-disposition'], 'attachment; filename="site-export-fixtures.zip"')
		t.is(res.buffer.slice(0, 2).toString(), 'PK')

		// Unpack and verify layout + link rewriting (raw buffer —
		// the zip is binary; the utf8 body string would corrupt it)
		const tmp = path.join(__dirname, '..', '.tmp')
		const zipPath = path.join(tmp, 'site-export-test.zip')
		const outDir = fs.mkdtempSync(path.join(tmp, 'site-export-'))
		fs.writeFileSync(zipPath, res.buffer)
		child_process.execFileSync('unzip', ['-o', '-q', zipPath, '-d', outDir])

		const read = rel => fs.readFileSync(path.join(outDir, rel), 'utf8')

		// README promoted to index.html; fragments preserved;
		// external/absolute/out-of-bundle links untouched
		const indexHtml = read('index.html')
		t.true(indexHtml.includes('href="guide.html#start"'))
		t.true(indexHtml.includes('href="notes.html"'))
		t.true(indexHtml.includes('href="https://example.com/x.md"'))
		t.true(indexHtml.includes('href="/root.md"'))
		t.true(indexHtml.includes('href="missing.md"'))

		// Reading chrome is kept; the search box, export menu, and
		// hot-reload script stay stripped (assert on the markup —
		// the inlined CSS carries the chrome selectors)
		t.true(indexHtml.includes('width-slider'))
		t.false(indexHtml.includes('id="site-search-input"'))
		t.false(indexHtml.includes('class="page-actions"'))

		// Styles inlined — no {markserv} scheme left
		t.false(indexHtml.includes('{markserv}'))
		t.true(indexHtml.includes('<style id="theme-dark">'))

		// Rewritten back/nested links
		t.true(read('guide.html').includes('href="README.html"'))
		t.true(read('notes.html').includes('href="guide.html#start"'))
		t.true(read('sub/deep.html').includes('href="guide.html"'))

		// Verbatim asset
		t.is(read('img.txt'), 'not-an-image\n')
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('export format=site on a file is 404', async t => {
	const port = await getPort()
	const service = await startService({port})

	try {
		const res = await get({
			url: `http://localhost:${port}/__markserv/export/tests/site-export-fixtures/README.md?format=site`,
			timeout: 1000 * 2
		})

		t.is(res.statusCode, 404)
		t.is(res.body, 'Not Found')
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('site export name collision keeps both files (unit)', async t => {
	const {entries, warnings} = await siteExportLib.buildSite(
		path.join(__dirname, 'site-export-collision'), {
			exclusions: ['node_modules'],
			markdownExts: ['.md'],
			listFiles: searchLib.listFiles,
			renderPage: async () => '<p>rendered</p>'
		}
	)

	// a.html is the raw file; the rendered a.md page is a.md.html
	const names = entries.map(e => e.name).sort()
	t.deepEqual(names, ['a.html', 'a.md.html'])
	t.is(entries.find(e => e.name === 'a.html').content.toString(), '<p>raw</p>\n')
	t.is(warnings.length, 1)
})

// --- P06: export fidelity + assets ---

const assetsFixture = path.join(__dirname, 'export-assets-fixtures')

test('collectAssets: include/skip rules (unit)', t => {
	const html = [
		'<img src="img/dot.png" alt="dot">',
		'<source src="img/dot.png">',
		'<a href="linked.md#sec">doc</a>',
		'<a href="img/missing.png">missing</a>',
		'<a href="https://example.com/x.png">external</a>',
		'<a href="/abs.png">absolute</a>',
		'<a href="#anchor">anchor</a>',
		'<a href="data:image/png;base64,AAAA">data</a>',
		'<a href="../../escape.png">escape</a>'
	].join('')
	const {assets, skipped} = siteExportLib.collectAssets(html, {
		pageDir: assetsFixture,
		rootDir: path.join(assetsFixture, '..'),
		markdownExts: ['.md']
	})

	// Only the existing in-root image is an asset (the <source>
	// duplicate is deduped); documents and every other reference
	// are skipped with a reason
	t.deepEqual(assets.map(a => a.rel), ['img/dot.png'])
	const byReason = {}
	skipped.forEach(s => {
		byReason[s.reason] = (byReason[s.reason] || 0) + 1
	})
	t.is(byReason.document, 1)
	t.is(byReason.missing, 1)
	t.is(byReason.scheme, 2)   // https + data:
	t.is(byReason.absolute, 1)
	t.is(byReason.anchor, 1)
	t.is(byReason['out-of-root'], 1)
	t.is(skipped.length, 7)
})

test('inlineMarkservAssets: link → style, id + disabled preserved (unit)', t => {
	const html = [
		'<head>',
		'<link rel="stylesheet" id="theme-dark" href="{markserv}templates/github-markdown-dark.css" disabled>',
		'<link rel="stylesheet" href="{markserv}templates/markserv.css">',
		'<link rel="stylesheet" href="https://example.com/other.css">',
		'<p>quoting {markserv}templates/markserv.css in text</p>',
		'</head>'
	].join('')
	const out = siteExportLib.inlineMarkservAssets(html)

	t.true(out.includes('<style id="theme-dark" disabled>'))
	t.true(out.includes('color-scheme: dark'))
	// the non-theme stylesheet link inlines without attributes
	t.true(out.includes('<style>') && out.includes('</style>'))
	// non-{markserv} links and page text stay untouched
	t.true(out.includes('<link rel="stylesheet" href="https://example.com/other.css">'))
	t.true(out.includes('quoting {markserv}templates/markserv.css in text'))
	t.false(out.includes('href="{markserv}'))
})

test('decision-8 rewrite: page-relative .html links (unit)', t => {
	const mdSet = new Set([
		'tests/export-assets-fixtures/page.md',
		'tests/export-assets-fixtures/linked.md',
		'tests/other/doc.md'
	])
	const html = [
		'<a href="linked.md#sec">same dir</a>',
		'<a href="../other/doc.md">up one</a>',
		'<a href="missing.md">missing</a>',
		'<a href="https://x/y.md">external</a>',
		'<a href="/root.md">absolute</a>'
	].join('')

	const out = siteExportLib.rewriteLinks(html, {
		currentDir: 'tests/export-assets-fixtures',
		bundleMdSet: mdSet,
		pageRelative: true
	})
	t.true(out.includes('href="linked.html#sec"'))
	t.true(out.includes('href="../other/doc.html"'))
	t.true(out.includes('href="missing.md"'))
	t.true(out.includes('href="https://x/y.md"'))
	t.true(out.includes('href="/root.md"'))

	// Default (site export) form: bundle-root-relative names —
	// the unchanged behavior the site-export asserts pin
	const out2 = siteExportLib.rewriteLinks(
		'<a href="../other/doc.md">up</a>',
		{currentDir: 'tests/export-assets-fixtures', bundleMdSet: mdSet}
	)
	t.true(out2.includes('href="tests/other/doc.html"'))
})

test('export html-assets (format=html-assets)', async t => {
	const port = await getPort()
	const service = await startService({port})

	try {
		const res = await get({
			url: `http://localhost:${port}/__markserv/export/tests/export-assets-fixtures/page.md?format=html-assets`,
			timeout: 1000 * 5
		})

		t.is(res.statusCode, 200)
		t.is(res.headers['content-type'], 'application/zip')
		t.is(res.headers['content-disposition'], 'attachment; filename="page.assets.zip"')
		t.is(res.buffer.slice(0, 2).toString(), 'PK')

		// Unpack: page.html + img/dot.png — no missing asset, no
		// linked.html (documents are links, not assets)
		const zipPath = path.join(__dirname, '..', '.tmp', 'html-assets-test.zip')
		const outDir = fs.mkdtempSync(path.join(__dirname, '..', '.tmp', 'html-assets-'))
		fs.writeFileSync(zipPath, res.buffer)
		child_process.execFileSync('unzip', ['-o', '-q', zipPath, '-d', outDir])

		const names = []
		const walk = dir => {
			fs.readdirSync(dir).forEach(name => {
				const p = path.join(dir, name)
				if (fs.statSync(p).isDirectory()) {
					walk(p)
				} else {
					names.push(path.relative(outDir, p))
				}
			})
		}
		walk(outDir)
		t.deepEqual(names.sort(), ['img/dot.png', 'page.html'])

		// The page is styled (inlined styles) and the doc link is
		// rewritten page-relative (decision 8)
		const pageHtml = fs.readFileSync(path.join(outDir, 'page.html'), 'utf8')
		t.false(pageHtml.includes('{markserv}'))
		t.true(pageHtml.includes('href="linked.html#sec"'))
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('single-page export rewrites document links (decision 8)', async t => {
	const port = await getPort()
	const service = await startService({port})

	try {
		const res = await get({
			url: `http://localhost:${port}/__markserv/export/tests/export-assets-fixtures/page.md?format=html`,
			timeout: 1000 * 5
		})

		t.is(res.statusCode, 200)
		t.true(res.body.includes('href="linked.html#sec"'))
		t.false(res.body.includes('href="linked.md'))
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('--no-exports: endpoint 503 and no export menu', async t => {
	const port = await getPort()
	const service = await startService({port, exports: false})

	try {
		const res = await get({
			url: `http://localhost:${port}/__markserv/export/tests/tables.md?format=html`,
			timeout: 1000 * 2
		})
		t.is(res.statusCode, 503)
		t.is(res.headers['content-type'], 'application/json; charset=utf-8')
		t.is(res.body, JSON.stringify({error: 'exports disabled'}))

		// The served page has no export menu; search is unaffected
		const page = await get({url: `http://localhost:${port}/tests/tables.md`, timeout: 1000 * 2})
		t.false(page.body.includes('id="export-menu"'))
		t.true(page.body.includes('id="site-search-global"'))
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('served pages carry the export menu (default flags)', async t => {
	const port = await getPort()
	const service = await startService({port})

	try {
		const md = await get({url: `http://localhost:${port}/tests/tables.md`, timeout: 1000 * 2})
		t.true(md.body.includes('id="export-menu"'))
		t.true(md.body.includes('Export HTML page'))
		t.true(md.body.includes('Export page + assets (zip)'))
		t.true(md.body.includes('Export Markdown source'))

		const dir = await get({url: `http://localhost:${port}/tests/testdir/`, timeout: 1000 * 2})
		t.true(dir.body.includes('id="export-menu"'))
		t.true(dir.body.includes('Export site (HTML pages, zip)'))
		t.true(dir.body.includes('Export raw folder (zip)'))
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

// --- P06: CLI export (offline) ---

const runCliExport = args => child_process.execFileSync(
	process.execPath, ['lib/cli.js', 'export', ...args],
	{cwd: path.join(__dirname, '..')}
)

test('CLI export to a directory (offline)', t => {
	const outDir = fs.mkdtempSync(path.join(__dirname, '..', '.tmp', 'cli-export-dir-'))
	runCliExport(['tests/site-export-fixtures', outDir])

	for (const name of ['index.html', 'guide.html', 'notes.html', 'sub/deep.html', 'img.txt']) {
		t.true(fs.existsSync(path.join(outDir, name)), name + ' missing')
	}
})

test('CLI export to a .zip target', t => {
	const zipPath = path.join(__dirname, '..', '.tmp', 'cli-export-test.zip')
	runCliExport(['tests/site-export-fixtures', zipPath])

	t.is(fs.readFileSync(zipPath).slice(0, 2).toString(), 'PK')
	const listing = child_process.execFileSync('unzip', ['-l', zipPath], {encoding: 'utf8'})
	for (const name of ['index.html', 'guide.html', 'notes.html', 'sub/deep.html', 'img.txt']) {
		t.true(listing.includes(name), name + ' not in zip')
	}
})

test('CLI export refuses a non-empty target directory', t => {
	const outDir = fs.mkdtempSync(path.join(__dirname, '..', '.tmp', 'cli-export-busy-'))
	fs.writeFileSync(path.join(outDir, 'existing.txt'), 'x')

	let status = null
	try {
		runCliExport(['tests/site-export-fixtures', outDir])
	} catch (error) {
		status = error.status
	}
	t.is(status, 1)
})

test('CLI export with a missing <target> arg exits 2', t => {
	let status = null
	try {
		runCliExport(['tests/site-export-fixtures'])
	} catch (error) {
		status = error.status
	}
	t.is(status, 2)
})
