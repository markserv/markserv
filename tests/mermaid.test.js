import path from 'path'
import test from 'ava'
import markserv from '../lib/server'

test('mermaid fence', async t => {
	const markdown = await markserv.getFile(path.join(__dirname, 'mermaid.md'))
	const expected = await markserv.getFile(path.join(__dirname, 'mermaid.expected.html'))
	const actual = await markserv.markdownToHTML(markdown)
	t.is(actual, expected)
})
