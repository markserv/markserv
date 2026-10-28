const fs = require('fs')
const os = require('os')
const path = require('path')
const test = require('ava')
const WebSocket = require('ws')
const markserv = require('../lib/server.js')
const {get} = require('./http.js')

const fixture = path.join(__dirname, 'markdown-extensions.md')
const renderFixture = async () => markserv.markdownToHTML(await markserv.getFile(fixture))

const assertFootnotes = (t, html) => {
	const references = [...html.matchAll(/<sup class="footnote-ref"><a href="#([^"]+)" id="([^"]+)">[^<]+<\/a><\/sup>/g)]
	const notes = [...html.matchAll(/<li id="([^"]+)" class="footnote-item">([\s\S]*?)<\/li>/g)]
	t.is(references.length, 3)
	t.is(notes.length, 2)
	t.is(new Set(references.map(ref => ref[2])).size, 3, 'each reference has a distinct return target')
	const [first, second, repeated] = references
	t.is(first[1], repeated[1], 'repeated references share one note')
	t.not(first[1], second[1], 'distinct labels lead to distinct notes')
	const byId = new Map(notes.map(note => [note[1], note[2]]))
	t.true(byId.get(first[1]).includes('Alpha evidence with <strong>emphasis</strong>'))
	t.true(byId.get(second[1]).includes('Beta evidence with a <a href="https://example.com/beta">link</a>'))
	for (const note of notes) {
		const backlinks = [...note[2].matchAll(/<a href="#([^"]+)" class="footnote-backref">/g)].map(link => link[1])
		const expected = references.filter(ref => ref[1] === note[1]).map(ref => ref[2])
		t.deepEqual(backlinks, expected, 'each note returns to exactly its own references')
	}
}

const assertAlerts = (t, html) => {
	const alerts = [...html.matchAll(/<div class="markdown-alert markdown-alert-([^" ]+)">([\s\S]*?)<\/div>/g)]
	t.deepEqual(alerts.map(alert => alert[1]), ['note', 'tip', 'important', 'warning', 'caution'])
	for (const [, kind, body] of alerts) {
		const title = kind[0].toUpperCase() + kind.slice(1)
		t.regex(body, new RegExp(`<p class="markdown-alert-title">[\\s\\S]*${title}</p>`))
		t.true(body.includes(`${title} body`), 'alert body is retained')
	}
	t.true(alerts[0][2].includes('<strong>detail</strong>'), 'alert content remains Markdown')
}

test('footnotes link to the correct notes and return to every reference', async t => {
	assertFootnotes(t, await renderFixture())
})

test('all five GitHub alert types render by default, including concurrent renders', async t => {
	const results = await Promise.all([renderFixture(), renderFixture(), renderFixture()])
	for (const html of results) {
		assertAlerts(t, html)
	}
})

test('ordinary quotations and fenced extension examples stay ordinary', async t => {
	const html = await renderFixture()
	t.regex(html, /<blockquote>\s*<p>An ordinary quotation with <strong>formatting<\/strong>\.<\/p>\s*<\/blockquote>/)
	const code = html.match(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/)
	t.truthy(code)
	t.true(code[1].includes('&gt; [!WARNING]'))
	t.true(code[1].includes('Literal alert, not a callout.[^alpha]'))
	t.true(code[1].includes('[^alpha]: Literal definition.'))
	t.false(code[1].includes('class="markdown-alert'))
	t.false(code[1].includes('class="footnote-ref'))
})

test('extension state does not leak between documents and render failures still reject', async t => {
	await renderFixture()
	const html = await markserv.markdownToHTML('Unknown note.[^alpha]\n\n> Ordinary quote.')
	t.false(html.includes('class="footnotes"'))
	t.false(html.includes('class="footnote-ref"'))
	t.false(html.includes('class="markdown-alert'))
	t.true(html.includes('Unknown note.[^alpha]'))
	await t.throwsAsync(markserv.markdownToHTML(null), {instanceOf: Error})
})

test('the HTTP service renders both extensions without feature flags', async t => {
	const service = await markserv.init({
		dir: __dirname,
		port: 8830,
		hotreload: false,
		address: 'localhost',
		silent: true
	})
	try {
		const response = await get({url: 'http://localhost:8830/markdown-extensions.md', timeout: 2000})
		t.is(response.statusCode, 200)
		assertFootnotes(t, response.body)
		assertAlerts(t, response.body)
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

const assertComposedFootnotes = (t, html, childEvidence) => {
	const references = [...html.matchAll(/<sup class="footnote-ref"><a href="#([^"]+)" id="([^"]+)">/g)]
	const notes = [...html.matchAll(/<li id="([^"]+)" class="footnote-item">([\s\S]*?)<\/li>/g)]
	t.is(references.length, 6)
	t.is(notes.length, 3)
	t.is(new Set(notes.map(note => note[1])).size, 3, 'parent and each include occurrence have unique notes')
	t.is(new Set(references.map(ref => ref[2])).size, 6, 'every repeated reference has its own return target')
	const byId = new Map(notes.map(note => [note[1], note[2]]))
	for (const [index, reference] of references.entries()) {
		const body = byId.get(reference[1])
		t.truthy(body)
		t.true(body.includes(index < 2 ? 'Parent evidence' : childEvidence), 'references resolve to their own document')
	}

	for (const [id, body] of notes) {
		const backlinks = [...body.matchAll(/<a href="#([^"]+)" class="footnote-backref">/g)].map(link => link[1])
		t.deepEqual(backlinks, references.filter(ref => ref[1] === id).map(ref => ref[2]))
	}

	return references.map(ref => [ref[1], ref[2]])
}

test('composed Markdown footnotes stay distinct and stable through requests and hot reload', async t => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'markserv-composed-footnotes-'))
	const childPath = path.join(dir, 'child.md')
	fs.writeFileSync(path.join(dir, 'parent.md'), 'Parent[^same] again[^same].\n\n[^same]: Parent evidence.\n\n{markdown:child.md}\n\n{markdown:child.md}\n')
	fs.writeFileSync(childPath, 'Child[^same] again[^same].\n\n[^same]: Child evidence.\n')
	const flags = {dir, port: 8832, address: '127.0.0.1', hotreload: true, browser: false, templates: true, silent: true}
	let service
	let ws
	try {
		service = await markserv.init(flags)
		const url = 'http://127.0.0.1:8832/parent.md'
		const responses = await Promise.all([get({url, timeout: 2000}), get({url, timeout: 2000})])
		const original = assertComposedFootnotes(t, responses[0].body, 'Child evidence')
		t.deepEqual(assertComposedFootnotes(t, responses[1].body, 'Child evidence'), original, 'concurrent requests have deterministic IDs')
		ws = new WebSocket(`ws://127.0.0.1:${flags.$wsPort}`)
		await new Promise((resolve, reject) => {
			ws.once('open', resolve)
			ws.once('error', reject)
		})
		ws.send(JSON.stringify({path: '/parent.md'}))
		// A pong follows processing of the preceding registration frame.
		await new Promise(resolve => {
			ws.once('pong', resolve)
			ws.ping()
		})
		const update = new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error('composed footnote reload timed out')), 5000)
			ws.once('message', data => {
				clearTimeout(timer)
				resolve(String(data))
			})
		})
		fs.writeFileSync(childPath, 'Child[^same] again[^same].\n\n[^same]: Updated child evidence.\n')
		t.deepEqual(assertComposedFootnotes(t, await update, 'Updated child evidence'), original, 'hot reload preserves reference and backlink IDs')
	} finally {
		if (ws) {
			ws.terminate()
		}

		if (service) {
			await new Promise(resolve => service.hotReloadServer.close(resolve))
			await new Promise(resolve => service.httpServer.close(resolve))
		}

		fs.rmSync(dir, {recursive: true, force: true})
	}
})
