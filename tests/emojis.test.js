import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'ava';
import {getFile, markdownToHTML} from '../lib/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('emoji support', async t => {
	const markdown = await getFile(path.join(__dirname, 'emojis.md'));
	const expected = await getFile(path.join(__dirname, 'emojis.expected.html'));
	const actual = await markdownToHTML(markdown);
	t.is(actual, expected);
});
