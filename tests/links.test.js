const path = require('path')
const test = require('ava')
const markserv = require('../lib/server.js')

test('markdown tables', async t => {
	const markdown = await markserv.getFile(path.join(__dirname, 'links.md'))
	const expected = await markserv.getFile(path.join(__dirname, 'links.expected.html'))
	const actual = await markserv.markdownToHTML(markdown)
	t.is(actual, expected)
})
