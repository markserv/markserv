import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import axios from 'axios';
import test from 'ava';
import getPort from 'get-port';
import {init} from '../lib/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('start service and receive error page (404)', async t => {
	const expected = String(fs.readFileSync(path.join(__dirname, 'error-page-404.expected.html')));

	const dir = path.join(__dirname, '..');

	getPort().then(port => {
		const flags = {
			dir,
			port,
			hotreload: false,
			address: 'localhost',
			silent: true,
		};

		const done = () => undefined;

		init(flags).then(service => {
			const closeServer = () => {
				service.httpServer.close(done);
			};

			const options = {
				url: `http://localhost:${port}/beep/boop/bwwwaaaaahhhggg`,
				timeout: 1000 * 2,
			};

			axios(options)
				.then(response => {
					const body = response.data;

					// // Write expected:
					// fs.writeFileSync(path.join(__dirname, 'service.expected.html'), body)

					const sanitize = text => text.replace(/PID: \d+</v, 'PID: N/A<')
						.replace(/<p class="errorMsg">(.*?)<\/p>/v, '')
						.replace(/<pre>(.*?)<\/pre>/sv, '')
						.replace(/<title>404: (.*?)\/markserv\/beep\/boop\/bwwwaaaaahhhggg<\/title>/v, '')
						.replace(/markserv-width:' \+ '.*?'/v, 'markserv-width:\' + \'\'');
					const bodyNonVariable = sanitize(body);
					const expectedNonVariable = sanitize(expected);

					t.is(bodyNonVariable, expectedNonVariable);

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
