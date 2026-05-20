import http from 'node:http';
import path from 'node:path';
import fs, {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import chalk from 'chalk';
import opn from 'open';
import connect from 'connect';
import less from 'less';
import send from 'send';
import {WebSocketServer} from 'ws';
import getPort from 'get-port';
import deepmerge from 'deepmerge';
import handlebars from 'handlebars';
import MarkdownIt from 'markdown-it';
import mdItAnchor from 'markdown-it-anchor';
import mdItTaskLists from 'markdown-it-task-lists';
import mdItHLJS from 'markdown-it-highlightjs';
import mdItTOC from 'markdown-it-table-of-contents';
import mdItEmoji from 'markdown-it-emoji';
import mdItMathJax from 'markdown-it-mathjax';
import emojiRegex from 'emoji-regex';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const emojiRegexInstance = emojiRegex();

const implant = (contents, handlers, options = {}) => new Promise((resolve, reject) => {
	const maxDepth = options.maxDepth || 10;
	const processLevel = (text, depth) => {
		if (depth > maxDepth) {
			return Promise.resolve(text);
		}

		const regex = /\{(\w+)(?::\s*([^\}]+?))?\}/gv;
		const matches = [];
		let match;

		while ((match = regex.exec(text)) !== null) {
			matches.push({
				full: match[0],
				key: match[1],
				value: match[2] ? match[2].trim() : '',
				index: match.index,
			});
		}

		if (matches.length === 0) {
			return Promise.resolve(text);
		}

		const promises = [];

		for (const {key, value} of matches) {
			const handler = handlers[key];

			if (!handler) {
				promises.push(Promise.resolve(null));
				continue;
			}

			try {
				const result = handler(value, options);
				const promise = result && typeof result.then === 'function'
					? result
					: Promise.resolve(result);
				promises.push(promise);
			} catch {
				promises.push(Promise.resolve(null));
			}
		}

		return Promise.all(promises).then(results => {
			let output = '';
			let lastIndex = 0;

			for (const [i, m] of matches.entries()) {
				output += text.slice(lastIndex, m.index);
				const replacement = results[i];
				output += replacement !== null && replacement !== false ? replacement : m.full;
				lastIndex = m.index + m.full.length;
			}

			output += text.slice(lastIndex);

			if (output === text) {
				return output;
			}

			return processLevel(output, depth + 1);
		});
	};

	processLevel(contents, 0).then(resolve).catch(reject);
});

const style = {
	link: chalk.blueBright.underline.italic,
	github: chalk.blue.underline.italic,
	address: chalk.greenBright.underline.italic,
	port: chalk.reset.cyanBright,
	pid: chalk.reset.cyanBright,
};

const slugify = text => text.toLowerCase().replaceAll(/\s/gv, '-').replaceAll(/[\p{P}\p{S}\s]/gv, '').replace(emojiRegexInstance, '').replaceAll(/[\u3000。？！，、；：“”【】（）〔〕［］﹃﹄‘’﹁﹂—…－～《》〈〉「」]/gv, '');

const md = new MarkdownIt({
	linkify: false,
	html: true,
})
	.use(mdItAnchor, {slugify})
	.use(mdItTaskLists)
	.use(mdItHLJS)
	.use(mdItEmoji)
	.use(mdItMathJax())
	.use(mdItTOC, {
		includeLevel: [1, 2, 3, 4, 5, 6],
		slugify,
	});

// Markdown Extension Types
const fileTypes = {
	markdown: [
		'.markdown',
		'.mdown',
		'.mkdn',
		'.md',
		'.mkd',
		'.mdwn',
		'.mdtxt',
		'.mdtext',
		'.text',
	],

	html: [
		'.html',
		'.htm',
	],

	watch: [
		'.sass',
		'.less',
		'.js',
		'.css',
		'.json',
		'.gif',
		'.png',
		'.jpg',
		'.jpeg',
	],

	exclusions: [
		'node_modules/',
		'.git/',
	],
};

fileTypes.watch = [...fileTypes.watch, ...fileTypes.markdown, ...fileTypes.html];

const materialIcons = JSON.parse(readFileSync(new URL('icons/material-icons.json', import.meta.url)));

const faviconPath = path.join(__dirname, 'icons', 'markserv.svg');
const faviconData = fs.readFileSync(faviconPath);

const log = (string_, flags, error) => {
	if (flags.silent) {
		return;
	}

	if (string_) {
		console.log(string_);
	}

	if (error) {
		console.error(error);
	}
};

const message = (type, message_, flags) => {
	if (type === 'github') {
		return log(chalk.bgYellow.black('    GitHub  ') + message_, flags);
	}

	log(chalk.bgGreen.black('  Markserv  ') + chalk.white(` ${type}: `) + message_, flags);
};

const errormsg = (type, message_, flags, error) =>
	log(chalk.bgRed.white('  Markserv  ') + chalk.red(` ${type}: `) + message_, flags, error);

const warnmsg = (type, message_, flags) =>
	log(chalk.bgYellow.black('  Markserv  ') + chalk.yellow(` ${type}: `) + message_, flags);

const isType = (exts, filePath) => {
	const fileExt = path.parse(filePath).ext;
	return exts.includes(fileExt);
};

// MarkdownToHTML: turns a Markdown file into HTML content
const markdownToHTML = markdownText => new Promise((resolve, reject) => {
	let result;

	try {
		result = md.render(markdownText);
	} catch (error) {
		reject(error);
	}

	resolve(result);
});

// GetFile: reads utf8 content from a file
const getFile = async path => fs.promises.readFile(path, 'utf8');

// Get Custom Less CSS to use in all Markdown files
const buildLessStyleSheet = cssPath => new Promise((resolve, reject) => {
	getFile(cssPath)
		.then(data => less.render(data))
		.then(data => resolve(data.css))
		.catch(reject);
});

const baseTemplate = (templateUrl, handlebarData) => new Promise((resolve, reject) => {
	getFile(templateUrl).then(source => {
		const template = handlebars.compile(source);
		const output = template(handlebarData);
		resolve(output);
	}).catch(reject);
});

const lookUpIconClass = (path, type) => {
	let iconDef;

	if (type === 'folder') {
		iconDef = materialIcons.folderNames[path];

		iconDef ||= 'folder';
	}

	if (type === 'file') {
		// Try extensions first
		const ext = path.slice(path.lastIndexOf('.') + 1);
		iconDef = materialIcons.fileExtensions[ext];

		// Then try applying the filename
		iconDef ||= materialIcons.fileNames[path];

		iconDef ||= 'file';
	}

	return iconDef;
};

const dirToHtml = filePath => {
	const urls = fs.readdirSync(filePath);

	let list = '<ul>\n';

	let prettyPath = '/' + path.relative(process.cwd(), filePath);
	if (prettyPath[prettyPath.length] !== '/') {
		prettyPath += '/';
	}

	if (prettyPath.slice(-2, 2) === '//') {
		prettyPath = prettyPath.slice(0, -1);
	}

	for (const subPath of urls) {
		if (subPath.charAt(0) === '.') {
			continue;
		}

		const dir = fs.statSync(filePath + subPath).isDirectory();
		let href;
		if (dir) {
			href = subPath + '/';
			list += `\t<li class="icon folder isfolder"><a href="${href}">${href}</a></li> \n`;
		} else {
			href = subPath;
			const iconClass = lookUpIconClass(href, 'file');
			list += `\t<li class="icon ${iconClass} isfile"><a href="${href}">${href}</a></li> \n`;
		}
	}

	list += '</ul>\n';

	return list;
};

// Remove URL params from file being fetched
const getPathFromUrl = url => url.split(/[?#]/v)[0];

const markservPageObject = {
	lib(dir, options) {
		const relPath = path.join('lib', options.rootRelUrl);
		return relPath;
	},
};

const secureUrl = url => {
	const encodedUrl = encodeURI(url.replaceAll('%', '%25'));
	return encodedUrl;
};

// Create breadcrumb trail tracks
const createBreadcrumbs = path => {
	const crumbs = [{
		href: '/',
		text: './',
	}];

	const dirParts = path.replaceAll(/(^\/+|\/+$)/gv, '').split('/');
	const urlParts = dirParts.map(u => secureUrl(u));

	if (path.length === 0) {
		return crumbs;
	}

	let collectPath = '/';

	for (const [i, dirName] of dirParts.entries()) {
		const fullLink = collectPath + urlParts[i] + '/';

		const crumb = {
			href: fullLink,
			text: dirName + '/',
		};

		crumbs.push(crumb);
		collectPath = fullLink;
	}

	return crumbs;
};

// Http_request_handler: handles all the browser requests
const resolveTheme = flags => {
	if (flags.light) {
		return 'light';
	}

	if (flags.synthwave) {
		return 'synthwave';
	}

	if (flags.theme && flags.theme !== 'dark') {
		return flags.theme;
	}

	return 'dark';
};

const createRequestHandler = flags => {
	let {dir} = flags;
	const isDir = fs.statSync(dir).isDirectory();
	if (!isDir) {
		dir = path.parse(flags.dir).dir;
	}

	flags.$openLocation = path.relative(dir, flags.dir);
	const theme = resolveTheme(flags);
	const themeFlags = {
		themeDark: theme === 'dark',
		themeLight: theme === 'light',
		themeSynthwave: theme === 'synthwave',
		themeSolarized: theme === 'solarized',
	};

	const implantOptions = {
		maxDepth: 10,
	};

	const implantHandlers = {
		markserv: prop => new Promise(resolve => {
			if (Reflect.has(markservPageObject, prop)) {
				const value = path.relative(dir, __dirname);
				resolve(value);
				return;
			}

			resolve(false);
		}),

		file: (url, options) => new Promise(resolve => {
			if (typeof url !== 'string' || typeof (options && options.baseDir) !== 'string') {
				resolve(false);
				return;
			}

			const absUrl = path.join(options.baseDir, url);
			getFile(absUrl)
				.then(data => {
					message('implant', style.link(absUrl), flags);
					resolve(data);
				})
				.catch(error => {
					warnmsg('implant 404', style.link(absUrl), flags, error);
					resolve(false);
				});
		}),

		less: (url, options) => new Promise(resolve => {
			if (typeof url !== 'string' || typeof (options && options.baseDir) !== 'string') {
				resolve(false);
				return;
			}

			const absUrl = path.join(options.baseDir, url);
			buildLessStyleSheet(absUrl)
				.then(data => {
					message('implant', style.link(absUrl), flags);
					resolve(data);
				})
				.catch(error => {
					warnmsg('implant 404', style.link(absUrl), flags, error);
					resolve(false);
				});
		}),

		markdown: (url, options) => new Promise(resolve => {
			if (typeof url !== 'string' || typeof (options && options.baseDir) !== 'string') {
				resolve(false);
				return;
			}

			const absUrl = path.join(options.baseDir, url);
			getFile(absUrl).then(markdownToHTML)
				.then(data => {
					message('implant', style.link(absUrl), flags);
					resolve(data);
				})
				.catch(error => {
					warnmsg('implant 404', style.link(absUrl), flags, error);
					resolve(false);
				});
		}),

		html: (url, options) => new Promise(resolve => {
			if (typeof url !== 'string' || typeof (options && options.baseDir) !== 'string') {
				resolve(false);
				return;
			}

			const absUrl = path.join(options.baseDir, url);
			getFile(absUrl)
				.then(data => {
					message('implant', style.link(absUrl), flags);
					resolve(data);
				})
				.catch(error => {
					warnmsg('implant 404', style.link(absUrl), flags, error);
					resolve(false);
				});
		}),
	};

	const markservUrlLead = '%7Bmarkserv%7D';

	return (request, response) => {
		const decodedUrl = getPathFromUrl(decodeURIComponent(request.originalUrl));
		const filePath = path.normalize(unescape(dir) + unescape(decodedUrl));
		const baseDir = path.parse(filePath).dir;
		implantOptions.baseDir = baseDir;

		const errorPage = (code, filePath, error) => {
			errormsg(code, filePath, flags, error);

			const templateUrl = path.join(__dirname, 'templates/error.html');
			const fileName = path.parse(filePath).base;
			const referer = unescape(request.headers.referer || path.parse(decodedUrl).dir + '/');
			const errorMessage = md.utils.escapeHtml(error.message);
			const errorStack = md.utils.escapeHtml(String(error.stack));

			const handlebarData = {
				pid: process.pid ?? 'N/A',
				code,
				fileName,
				filePath,
				errorMsg: errorMessage,
				errorStack,
				referer,
				theme,
				...themeFlags,
				hotreload: flags.$hotreload,
				wsPort: flags.$wsPort,
				rootDir: flags.dir,
			};

			return baseTemplate(templateUrl, handlebarData).then(final => {
				response.writeHead(200, {
					'content-type': 'text/html',
				});
				response.end(final);
			});
		};

		if (flags.verbose) {
			message('request', filePath, flags);
		}

		const isMarkservUrl = request.url.includes(markservUrlLead);
		if (isMarkservUrl) {
			const markservFilePath = request.url.split(markservUrlLead)[1];
			const markservRelFilePath = path.join(__dirname, markservFilePath);
			if (flags.verbose) {
				message('{markserv url}', style.link(markservRelFilePath), flags);
			}

			send(request, markservRelFilePath).pipe(response);
			return;
		}

		const prettyPath = filePath;

		let stat;
		let isDir;
		let isMarkdown;
		let isHtml;

		try {
			stat = fs.statSync(filePath);
			isDir = stat.isDirectory();
			if (!isDir) {
				isMarkdown = isType(fileTypes.markdown, filePath);
				isHtml = isType(fileTypes.html, filePath);
			}
		} catch (error) {
			const fileName = path.parse(filePath).base;
			if (fileName === 'favicon.ico') {
				response.writeHead(200, {'Content-Type': 'image/x-icon'});
				response.write(faviconData);
				response.end();
				return;
			}

			errormsg('404', filePath, flags, error);
			errorPage(404, filePath, error);
			return;
		}

		// Markdown: Browser is requesting a Markdown file
		if (isMarkdown) {
			message('markdown', style.link(prettyPath), flags);
			getFile(filePath).then(markdownToHTML).then(filePath).then(html => {
				const contentPromise = flags.templates
					? implant(html, implantHandlers, implantOptions)
					: Promise.resolve(html);

				return contentPromise.then(output => {
					const templateUrl = path.join(__dirname, 'templates/markdown.html');

					const handlebarData = {
						title: path.parse(filePath).base,
						content: output,
						pid: process.pid ?? 'N/A',
						theme,
						...themeFlags,
						hotreload: flags.$hotreload,
						wsPort: flags.$wsPort,
						rootDir: flags.dir,
					};

					return baseTemplate(templateUrl, handlebarData).then(final => {
						if (flags.templates) {
							const lvl2Dir = path.parse(templateUrl).dir;
							const lvl2Options = deepmerge(implantOptions, {baseDir: lvl2Dir});

							return implant(final, implantHandlers, lvl2Options)
								.then(output => {
									response.writeHead(200, {
										'content-type': 'text/html',
									});
									response.end(output);
								});
						}

						response.writeHead(200, {
							'content-type': 'text/html',
						});
						response.end(final);
					});
				});
			}).catch(error => {
				console.error(error);
			});
		} else if (isHtml) {
			message('html', style.link(prettyPath), flags);
			getFile(filePath).then(html => {
				const contentPromise = flags.templates
					? implant(html, implantHandlers, implantOptions)
					: Promise.resolve(html);

				return contentPromise.then(output => {
					response.writeHead(200, {
						'content-type': 'text/html',
					});
					response.end(output);
				});
			}).catch(error => {
				console.error(error);
			});
		} else if (isDir) {
			try {
				// Index: Browser is requesting a Directory Index
				message('dir', style.link(prettyPath), flags);

				const templateUrl = path.join(__dirname, 'templates/directory.html');

				const handlebarData = {
					dirname: path.parse(filePath).dir,
					content: dirToHtml(filePath),
					title: path.parse(filePath).base,
					pid: process.pid ?? 'N/A',
					breadcrumbs: createBreadcrumbs(path.relative(dir, filePath)),
					theme,
					...themeFlags,
					hotreload: flags.$hotreload,
					wsPort: flags.$wsPort,
					rootDir: flags.dir,
				};

				return baseTemplate(templateUrl, handlebarData).then(final => {
					if (flags.templates) {
						const lvl2Dir = path.parse(templateUrl).dir;
						const lvl2Options = deepmerge(implantOptions, {baseDir: lvl2Dir});
						return implant(final, implantHandlers, lvl2Options).then(output => {
							response.writeHead(200, {
								'content-type': 'text/html',
							});
							response.end(output);
						}).catch(error => {
							console.error(error);
						});
					}

					response.writeHead(200, {
						'content-type': 'text/html',
					});
					response.end(final);
				});
			} catch (error) {
				errorPage(500, filePath, error);
			}
		} else {
			// Other: Browser requests other MIME typed file (handled by 'send')
			message('file', style.link(prettyPath), flags);
			send(request, filePath, {dotfiles: 'allow'}).pipe(response);
		}
	};
};

const startConnectApp = httpRequestHandler => connect()
	.use('/', httpRequestHandler);

const startHTTPServer = (connectApp, port, flags) => {
	const httpServer = connectApp ? http.createServer(connectApp) : http.createServer();

	httpServer.listen(port, flags.address);
	return httpServer;
};

const startHotReload = (wsPort, flags) => {
	let {dir} = flags;
	const isDir = fs.statSync(dir).isDirectory();
	if (!isDir) {
		dir = path.parse(flags.dir).dir;
	}

	const wss = new WebSocketServer({port: wsPort});
	const clients = new Map();

	wss.on('connection', ws => {
		ws.on('message', data => {
			try {
				const message_ = JSON.parse(data);
				if (message_.path) {
					clients.set(ws, message_.path);
				}
			} catch {
				// ignore parse errors
			}
		});

		ws.on('close', () => {
			clients.delete(ws);
		});
	});

	const sendToClients = (sockets, content) => {
		for (const ws of sockets) {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(content);
			}
		}
	};

	// Debounced file watcher
	let debounceTimer;
	const watchDir = path.resolve(dir);

	const handleChange = () => {
		// Group clients by path
		const pathClients = new Map();
		for (const [ws, clientPath] of clients) {
			if (ws.readyState !== WebSocket.OPEN) {
				continue;
			}

			if (!pathClients.has(clientPath)) {
				pathClients.set(clientPath, []);
			}

			pathClients.get(clientPath).push(ws);
		}

		const implantOptions = {maxDepth: 10};

		const implantHandlers = {
			markserv: () => new Promise(resolve => {
				const value = path.relative(dir, __dirname);
				resolve(value);
			}),

			file: (url, options) => new Promise(resolve => {
				const absUrl = path.join(options.baseDir, url);
				getFile(absUrl).then(data => resolve(data)).catch(() => resolve(false));
			}),

			less: (url, options) => new Promise(resolve => {
				const absUrl = path.join(options.baseDir, url);
				buildLessStyleSheet(absUrl).then(data => resolve(data)).catch(() => resolve(false));
			}),

			markdown: (url, options) => new Promise(resolve => {
				const absUrl = path.join(options.baseDir, url);
				getFile(absUrl).then(markdownToHTML).then(data => resolve(data)).catch(() => resolve(false));
			}),

			html: (url, options) => new Promise(resolve => {
				const absUrl = path.join(options.baseDir, url);
				getFile(absUrl).then(data => resolve(data)).catch(() => resolve(false));
			}),
		};

		for (const [clientPath, sockets] of pathClients) {
			const decodedUrl = getPathFromUrl(decodeURIComponent(clientPath));
			const filePath = path.normalize(unescape(dir) + unescape(decodedUrl));
			const baseDir = path.parse(filePath).dir;
			implantOptions.baseDir = baseDir;

			let stat;
			let isDir_;
			let isMarkdown;

			try {
				stat = fs.statSync(filePath);
				isDir_ = stat.isDirectory();
				if (!isDir_) {
					isMarkdown = isType(fileTypes.markdown, filePath);
				}
			} catch {
				continue;
			}

			if (isMarkdown) {
				getFile(filePath)
					.then(markdownToHTML)
					.then(html => implant(html, implantHandlers, {...implantOptions, baseDir}))
					.then(output => {
						sendToClients(sockets, output);
					})
					.catch(error => {
						errormsg('hotreload', filePath, flags, error);
					});
			} else if (isDir_) {
				try {
					const content = dirToHtml(filePath);
					const breadcrumbHtml = createBreadcrumbs(path.relative(dir, filePath));
					let headerHtml = '<h1 class="icon folder isfolder">';
					for (const crumb of breadcrumbHtml) {
						headerHtml += `<a href="${crumb.href}">${crumb.text}</a>`;
					}

					headerHtml += '</h1>\n';
					const fullContent = headerHtml + content
						+ '<footer><sup><hr> Served by <a href="https://www.npmjs.com/package/markserv">MarkServ</a> | PID: ' + (process.pid || 'N/A') + '</sup></footer>';

					sendToClients(sockets, fullContent);
				} catch (error) {
					errormsg('hotreload', filePath, flags, error);
				}
			}
		}
	};

	try {
		fs.watch(watchDir, {recursive: true}, (eventType, filename) => {
			if (!filename) {
				return;
			}

			// Check exclusions
			for (const exclusion of fileTypes.exclusions) {
				if (filename.includes(exclusion.replace(/\/$/v, ''))) {
					return;
				}
			}

			// Check if file extension is watched
			const ext = path.extname(filename);
			if (ext && !fileTypes.watch.includes(ext)) {
				return;
			}

			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(handleChange, 150);
		});
	} catch (error) {
		errormsg('watch', watchDir, flags, error);
	}

	return wss;
};

const logActiveServerInfo = async (serveURL, httpPort, wsPort, flags) => {
	const dir = path.resolve(flags.dir);

	const githubLink = 'github.com/markserv';

	message('address', style.address(serveURL), flags);
	message('path', chalk.grey(style.address(dir)), flags);

	if (wsPort) {
		message('hotreload', chalk.grey(`ws://localhost:${style.port(wsPort)}`), flags);
	}

	if (process.pid) {
		message('process', chalk.grey(`your pid is: ${style.pid(process.pid)}`), flags);
		message('stop', chalk.grey(`press ${chalk.magenta('[Ctrl + C]')} or type ${chalk.magenta(`"sudo kill -9 ${process.pid}"`)}`), flags);
	}

	message('github', `Contribute on Github - ${chalk.yellow.underline(githubLink)}`, flags);
};

const init = async flags => {
	const preferredPort = Number(flags.port) || 8642;
	const range = Array.from({length: 250}, (_, i) => preferredPort + i);
	const httpPort = await getPort({port: range, host: flags.address});

	let wsPort = null;
	const hotreloadEnabled = flags.hotreload !== false && flags.hotreload !== 'false';
	if (hotreloadEnabled) {
		wsPort = await getPort({port: httpPort + 1});
	}

	flags.$wsPort = wsPort;
	flags.$hotreload = hotreloadEnabled;

	const httpRequestHandler = createRequestHandler(flags);
	const connectApp = startConnectApp(httpRequestHandler);
	const httpServer = await startHTTPServer(connectApp, httpPort, flags);

	let hotReloadServer;
	if (hotreloadEnabled) {
		hotReloadServer = startHotReload(wsPort, flags);
	}

	const serveURL = 'http://' + flags.address + ':' + httpPort;

	// Log server info to CLI
	logActiveServerInfo(serveURL, httpPort, wsPort, flags);

	let launchUrl = false;
	if (flags.$openLocation || flags.$pathProvided) {
		launchUrl = serveURL + '/' + flags.$openLocation;
	}

	const service = {
		pid: process.pid,
		httpServer,
		hotReloadServer,
		connectApp,
		launchUrl,
	};

	const launchBrowser = () => {
		if (flags.browser === false
			|| flags.browser === 'false') {
			return;
		}

		if (launchUrl) {
			opn(launchUrl);
		}
	};

	launchBrowser();

	return service;
};

export {
	getFile,
	markdownToHTML,
	init,
};
