import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import axios from 'axios';
import test from 'ava';
import getPort from 'get-port';
import {run} from '../lib/readme.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('start markserv via "readme" command', async t => {
	const expected = String(fs.readFileSync(path.join(__dirname, 'markserv-cli-readme.expected.html')));

	const dir = path.join(__dirname, '..', 'tests', 'markserv-cli-readme') + path.sep;

	getPort().then(port => {
		const cliOptions = {
			input: [dir],
			flags: {
				port,
				hotreload: false,
				address: 'localhost',
				silent: true,
				browser: false,
			},
		};

		const done = () => {};

		run(cliOptions).then(service => {
			const closeServer = () => {
				service.httpServer.close(done);
			};

			const options = {
				url: service.launchUrl,
				timeout: 1000 * 2,
			};

			axios(options)
				.then(response => {
					const res = response;
					const body = response.data;

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
