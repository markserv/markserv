import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import axios from 'axios';
import test from 'ava';
import getPort from 'get-port';
import {run} from '../lib/cli.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('start markserv via "cli" command opening file in same dir', async t => {
	const expected = String(fs.readFileSync(path.join(__dirname, 'markserv-cli-file.expected.html')));

	getPort().then(port => {
		const cliOptions = {
			input: ['README.md'],
			flags: {
				port,
				hotreload: false,
				address: 'localhost',
				silent: true,
				browser: false,
			},
		};

		const done = () => undefined;

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
					const body = response.data;

					t.true(body.includes(expected));

					t.is(response.status, 200);
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

test('start markserv via "cli" command opening file in same dir with preceeding ./', async t => {
	const expected = String(fs.readFileSync(path.join(__dirname, 'markserv-cli-file.expected.html')));

	getPort().then(port => {
		const cliOptions = {
			input: ['./README.md'],
			flags: {
				port,
				hotreload: false,
				address: 'localhost',
				silent: true,
				browser: false,
			},
		};

		const done = () => undefined;

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
					const body = response.data;

					t.true(body.includes(expected));

					t.is(response.status, 200);
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

