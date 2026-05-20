#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import meow from 'meow';
import {init} from './server.js';
import splash from './splash.js';
import cliDefs from './cli-defs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliHelp = String(fs.readFileSync(path.join(__dirname, './cli-help.txt')));

const cliOptions = meow(cliHelp, {...cliDefs, importMeta: import.meta});

const fileExistsSync = uri => {
	let exists;

	try {
		const stat = fs.statSync(uri);
		if (stat.isFile()) {
			exists = true;
		}
	} catch (error) {
		console.warn(`${uri} does not exist`, error);
		exists = false;
	}

	return exists;
};

const findFileUp = (dir, fileToFind) => {
	const filepath = path.join(dir, fileToFind);
	const existsHere = fileExistsSync(filepath);

	if (dir === path.sep || dir === '.') {
		return false;
	}

	if (existsHere) {
		return filepath;
	}

	const nextDirUp = path.dirname(dir);
	return findFileUp(nextDirUp, fileToFind);
};

const findReadmeFile = dir => {
	const readmeFile = findFileUp(dir, 'README.md')
		|| findFileUp(dir, 'readme.md')
		|| findFileUp(dir, 'README.MD')
		|| findFileUp(dir, 'Readme.md');
	return readmeFile;
};

const validateServerPath = (options, cwd) => {
	let dir = options.input[0];
	if (dir === undefined) {
		dir = cwd;
	}

	const resolvedPath = path.resolve(dir);

	dir = dir[0] === '/' ? resolvedPath : path.normalize(path.join(cwd, dir));

	return dir;
};

const run = options => {
	splash(options.flags);
	const cwd = process.cwd();
	const validatedServerPath = validateServerPath(options, cwd);

	const readmeFile = findReadmeFile(validatedServerPath);

	if (readmeFile) {
		options.flags.dir = readmeFile || validateServerPath;
		options.flags.$pathProvided = true;
		options.flags.$openLocation = true;
	}

	return init(options.flags);
};

if (import.meta.url === `file://${fs.realpathSync(process.argv[1])}`) {
	run(cliOptions);
}

export {run};
