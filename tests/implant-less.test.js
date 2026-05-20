import fs from 'node:fs';
import path, {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import axios from 'axios';
import test from 'ava';
import getPort from 'get-port';
import {init} from '../lib/server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('start service and get text file', async t => {
	const expected = String(fs.readFileSync(path.join(__dirname, 'implant-less.expected.html')));

	const dir = path.join(__dirname);

	getPort().then(port => {
		const flags = {
			port,
			dir,
			hotreload: false,
			address: 'localhost',
			silent: true,
			browser: false,
			templates: true,
		};

		const done = () => {
};

		init(flags).then(service => {
			const closeServer = () => {
				service.httpServer.close(done);
			};

			const options = {
				url: `http://localhost:${port}/implant-less.render-fixture.html`,
				timeout: 1000 * 2,
			};

			axios(options)
				.then(response => {
					const res = response;
					const body = response.data;

					// Write expected:
					fs.writeFileSync(path.join(__dirname, 'implant-less.expected.html'), body);

					t.true(body.includes(expected));
					t.is(res.status, 200);
					t.pass();
					closeServer();
				})
				.catch(error => {
					t.fail(error);
					closeServer();
				});
		}).catch(error => {
			t.fail(error);
		});
	});
});
