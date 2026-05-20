import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import axios from 'axios';
import test from 'ava';
import getPort from 'get-port';
import {init} from '../lib/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('start service and get text file', async t => {
	const expected = String(fs.readFileSync(path.join(__dirname, 'implant-file.expected.html')));

	const dir = __dirname;

	const port = await getPort();

	const flags = {
		dir,
		port,
		hotreload: false,
		address: 'localhost',
		silent: true,
		templates: true,
	};

	const service = await init(flags);
	const actualPort = service.httpServer.address().port;
	const closeServer = () => {
		service.httpServer.close();
	};

	const options = {
		url: `http://localhost:${actualPort}/implant-file.render-fixture.md`,
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

	const normalize = text => text.replace(/PID: \d+</v, 'PID: N/A<')
		.replace(/markserv-width:' \+ '.*?'/v, 'markserv-width:\' + \'\'');
	const bodyNoPid = normalize(response.data);
	const expectedNoPid = normalize(expected);
	t.true(bodyNoPid.includes(expectedNoPid));

	t.is(response.status, 200);
	closeServer();
});
