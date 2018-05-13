import path from 'path'
import test from 'ava'
import markserv from '../lib/server'

test('emoji support', async t => {
	const markdown = await markserv.getFile(path.join(__dirname, 'emojis.md'))
	const expected = await markserv.getFile(path.join(__dirname, 'emojis.expected.html'))
	const actual = await markserv.markdownToHTML(markdown)
	t.is(actual, expected)
})
