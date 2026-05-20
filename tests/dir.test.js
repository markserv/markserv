import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import axios from 'axios';
import test from 'ava';
import getPort from 'get-port';
import {init} from '../lib/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('start service and get directory listing', async t => {
	const expected = String(fs.readFileSync(path.join(__dirname, 'dir.expected.html')));

	const dir = path.join(__dirname, '..');

	const port = await getPort();
	const flags = {
		port,
		dir,
		hotreload: false,
		address: 'localhost',
		silent: true,
	};

	const done = () => undefined;

	const service = await init(flags);
	const actualPort = service.httpServer.address().port;
	const closeServer = () => {
		service.httpServer.close(done);
	};

	const options = {
		url: `http://localhost:${actualPort}/tests/testdir/`,
		timeout: 1000 * 2,
	};

	let response;
	try {
		response = await axios(options);
	} catch (error) {
		// eslint-disable-next-line ava/no-conditional-assertion, ava/assertion-arguments
		t.fail(String(error));
		closeServer();
		return;
	}

	const body = response.data;

	// // Write expected:
	// fs.writeFileSync(path.join(__dirname, 'dir.expected.html'), body)

	const normalize = text => text.replace(/PID: \d+</v, 'PID: N/A<')
		.replace(/markserv-width:' \+ '.*?'/v, 'markserv-width:\' + \'\'');
	const bodyNoPid = normalize(body);
	const expectedNoPid = normalize(expected);
	t.is(bodyNoPid, expectedNoPid);
	t.is(response.status, 200);
	closeServer();
});
