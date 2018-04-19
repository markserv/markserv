import path from 'path'
import test from 'ava'
import markserv from '../server'

test('markdown tables', async t => {
	const markdown = await markserv.getFile(path.join(__dirname, 'tables.md'))
	const expected = await markserv.getFile(path.join(__dirname, 'tables.expected.html'))
	const actual = await markserv.markdownToHTML(markdown)
	t.is(actual, expected)
})
