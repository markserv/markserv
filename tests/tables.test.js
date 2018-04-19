import ava from 'ava'
import markserv from '../server'

test('markdown tables', async t => {
	fs.readFile('./tables.expected.html', (err, data) => {
		if (err) {
			return t.fail(err)
		}


	})
})
