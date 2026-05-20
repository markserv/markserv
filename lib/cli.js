#!/usr/bin/env node

'use strict';

import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import meow from 'meow';
import {init} from './server.js';
import splash from './splash.js';
import cliDefs from './cli-defs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliHelp = String(fs.readFileSync(path.join(__dirname, './cli-help.txt')));

const cliOptions = meow(cliHelp, {...cliDefs, importMeta: import.meta});

const validateServerPath = (serverPath, cwd) => path.resolve(cwd, serverPath);

const run = options => {
	splash(options.flags);

	const cwd = process.cwd();

	let dir = options.input[0];
	if (dir === undefined) {
		dir = cwd;
	}

	const validatedServerPath = validateServerPath(dir, cwd);
	options.flags.dir = validatedServerPath;
	options.flags.$pathProvided = true;
	options.flags.$openLocation = true;

	return init(options.flags);
};

if (import.meta.url === `file://${fs.realpathSync(process.argv[1])}`) {
	// Run without args (process.argv will be picked up)
	run(cliOptions);
}

export {run};
