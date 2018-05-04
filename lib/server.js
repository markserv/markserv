'use strict'

const http = require('http')
const path = require('path')
const fs = require('fs')
const chalk = require('chalk')

const open = require('open')
const Promise = require('bluebird')
const connect = require('connect')
const less = require('less')
const send = require('send')
const liveReload = require('livereload')
const connectLiveReload = require('connect-livereload')
const implant = require('implant')
const deepmerge = require('deepmerge')
const handlebars = require('handlebars')
const termImg = require('term-img')
const MarkdownIt = require('markdown-it')
const mdItAnchor = require('markdown-it-anchor')
const mdItTaskLists = require('markdown-it-task-lists')
const mdItHLJS = require('markdown-it-highlightjs')
const mdItTOC = require('markdown-it-table-of-contents')
const mdItEmoji = require('markdown-it-emoji')
const emojiRegex = require('emoji-regex')()

const style = {
	link: chalk.blueBright.underline.italic,
	patreon: chalk.rgb(249, 104, 84).underline.italic,
	github: chalk.blue.underline.italic,
	address: chalk.greenBright.underline.italic,
	port: chalk.reset.cyanBright,
	pid: chalk.reset.cyanBright
}

const md = new MarkdownIt({
	linkify: false,
	html: true
})
	.use(mdItAnchor, {
		slugify: text => {
			return text.toLowerCase().replace(/\s/g, '-')
				// remove punctuations other than hyphen and underscore
				.replace(/[`~!@#$%^&*()+=<>?,./:;"'|{}\[\]\\\u2000-\u206F\u2E00-\u2E7F]/g, '')
				// remove emojis
				.replace(emojiRegex, '')
				// remove CJK punctuations
				.replace(/[　。？！，、；：“”【】（）〔〕［］﹃﹄“”‘’﹁﹂—…－～《》〈〉「」]/g, '')
		}
	})
	.use(mdItTaskLists)
	.use(mdItHLJS)
	.use(mdItEmoji)
	.use(mdItTOC, {
		includeLevel: [1, 2, 3, 4, 5, 6]
	})

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
		'.text'
	],

	html: [
		'.html',
		'.htm'
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
		'.jpeg'
	],

	exclusions: [
		'node_modules/'
	]
}

fileTypes.watch = fileTypes.watch
	.concat(fileTypes.markdown)
	.concat(fileTypes.html)

const materialIcons = require(path.join(__dirname, 'icons', 'material-icons.json'))

const faviconPath = path.join(__dirname, 'icons', 'markserv.svg')
const faviconData = fs.readFileSync(faviconPath)

const log = (str, flags, err) => {
	if (flags.silent) {
		return
	}
	if (str) {
		// eslint-disable-next-line no-console
		console.log(str)
	}

	if (err) {
		// eslint-disable-next-line no-console
		console.error(err)
	}
}

const msg = (type, msg, flags) => {
	if (type === 'patreon') {
		return log(chalk`{bgRgb(249, 104, 84).white.bold  {black ▕}● PATREON } ` + msg, flags)
	}

	if (type === 'github') {
		return log(chalk`{bgYellow.black    GitHub  } ` + msg, flags)
	}

	log(chalk`{bgGreen.black   Markserv  }{white  ${type}: }` + msg, flags)
}

const errormsg = (type, msg, flags, err) =>
	log(chalk`{bgRed.black   Markserv  }{red  ${type}: }` + msg, flags, err)

const warnmsg = (type, msg, flags) =>
	log(chalk`{bgYellow.black   Markserv  }{yellow  ${type}: }` + msg, flags)

const isType = (exts, filePath) => {
	const fileExt = path.parse(filePath).ext
	return exts.includes(fileExt)
}

// MarkdownToHTML: turns a Markdown file into HTML content
const markdownToHTML = markdownText => new Promise((resolve, reject) => {
	let result

	try {
		result = md.render(markdownText)
	} catch (err) {
		return reject(err)
	}

	resolve(result)
})

// GetFile: reads utf8 content from a file
const getFile = path => new Promise((resolve, reject) => {
	fs.readFile(path, 'utf8', (err, data) => {
		if (err) {
			return reject(err)
		}
		resolve(data)
	})
})

// Get Custom Less CSS to use in all Markdown files
const buildLessStyleSheet = cssPath =>
	new Promise(resolve =>
		getFile(cssPath).then(data =>
			less.render(data).then(data =>
				resolve(data.css)
			)
		)
	)

const baseTemplate = (templateUrl, handebarData) => new Promise((resolve, reject) => {
	getFile(templateUrl).then(source => {
		const template = handlebars.compile(source)
		const output = template(handebarData)
		resolve(output)
	}).catch(reject)
})

const lookUpIconClass = (path, type) => {
	let iconDef

	if (type === 'folder') {
		iconDef = materialIcons.folderNames[path]

		if (!iconDef) {
			iconDef = 'folder'
		}
	}

	if (type === 'file') {
		// Try extensions first
		const ext = path.slice(path.lastIndexOf('.') + 1)
		iconDef = materialIcons.fileExtensions[ext]

		// Then try applying the filename
		if (!iconDef) {
			iconDef = materialIcons.fileNames[path]
		}

		if (!iconDef) {
			iconDef = 'file'
		}
	}

	return iconDef
}

const dirToHtml = filePath => {
	const urls = fs.readdirSync(filePath)

	let list = '<ul>\n'

	urls.forEach(subPath => {
		if (subPath.charAt(0) === '.') return
		const dir = fs.statSync(filePath + subPath).isDirectory()
		let href
		if (dir) {
			const iconClass = lookUpIconClass(subPath, 'folder')
			href = subPath + '/'
			list += `\t<li class="icon ${iconClass} isfolder">${ahref(href, href)}</li> \n`
		} else {
			href = subPath
			const iconClass = lookUpIconClass(href, 'file')
			list += `\t<li class="icon ${iconClass} isfile"><a href="${href}">${href}</a></li> \n`
		}
	})

	list += '</ul>\n'

	return list
}

// Remove URL params from file being fetched
const getPathFromUrl = url => {
	return url.split(/[?#]/)[0]
}

// Returns the a-href tag for secure URL encoding and html text
const ahref = (url, name) => {
	const encodeUrl = encodeURI(url.replace(/%/g, '%25'))
	const htmlText = md.utils.escapeHtml(name)
	return `<a href="${encodeUrl}">${htmlText}</a>`
}

// Create breadcrumb trail tracks
const createPathTags = (path) => {
	let tags = '/'
	let url = '/'
	let names = path.replace(/(^\/+|\/+$)/g, '').split('/')
	if (names[0]) {
		let last = names.pop()
		names.forEach(name => {
			if (name) {
				url += name + '/'
				tags += ahref(url, name) + '/'
			}
		})
		tags += md.utils.escapeHtml(last) + '/'
	}
	return tags
}

const markservPageObject = {
	lib: (dir, opts) => {
		const relPath = path.join('lib', opts.rootRelUrl)
		return relPath
	}
}

// Http_request_handler: handles all the browser requests
const createRequestHandler = flags => {
	let dir = flags.dir
	const isDir = fs.statSync(dir).isDirectory()
	if (!isDir) {
		dir = path.parse(flags.dir).dir
	}
	flags.$openLocation = path.relative(dir, flags.dir)

	const implantOpts = {
		maxDepth: 10
	}

	const implantHandlers = {
		markserv: prop => new Promise(resolve => {
			if (Reflect.has(markservPageObject, prop)) {
				const value = path.relative(dir, __dirname)
				return resolve(value)
			}

			resolve(false)
		}),

		file: (url, opts) => new Promise(resolve => {
			const absUrl = path.join(opts.baseDir, url)
			getFile(absUrl)
				.then(data => {
					msg('implant', style.link(absUrl), flags)
					resolve(data)
				})
				.catch(err => {
					warnmsg('implant 404', style.link(absUrl), flags, err)
					resolve(false)
				})
		}),

		less: (url, opts) => new Promise(resolve => {
			const absUrl = path.join(opts.baseDir, url)
			buildLessStyleSheet(absUrl)
				.then(data => {
					msg('implant', style.link(absUrl), flags)
					resolve(data)
				})
				.catch(err => {
					warnmsg('implant 404', style.link(absUrl), flags, err)
					resolve(false)
				})
		}),

		markdown: (url, opts) => new Promise(resolve => {
			const absUrl = path.join(opts.baseDir, url)
			getFile(absUrl).then(markdownToHTML)
				.then(data => {
					msg('implant', style.link(absUrl), flags)
					resolve(data)
				})
				.catch(err => {
					warnmsg('implant 404', style.link(absUrl), flags, err)
					resolve(false)
				})
		}),

		html: (url, opts) => new Promise(resolve => {
			const absUrl = path.join(opts.baseDir, url)
			getFile(absUrl)
				.then(data => {
					msg('implant', style.link(absUrl), flags)
					resolve(data)
				})
				.catch(err => {
					warnmsg('implant 404', style.link(absUrl), flags, err)
					resolve(false)
				})
		})
	}

	const markservUrlLead = '{markserv}'

	return (req, res) => {
		const decodedUrl = getPathFromUrl(decodeURIComponent(req.originalUrl))
		const filePath = path.normalize(unescape(dir) + unescape(decodedUrl))
		const baseDir = path.parse(filePath).dir
		implantOpts.baseDir = baseDir

		const errorPage = (code, err) => {
			res.writeHead(code, {'Content-Type': 'text/html; charset=utf-8'})
			errormsg(code, filePath, flags, err)
			let url = req.headers.referer || path.parse(decodedUrl).dir
			let msg = md.utils.escapeHtml(String(err))
			res.write(`${code} :'( for ${msg}<br>${ahref(url, 'Go Back')}`)
			res.end()
		}

		if (flags.verbose) {
			msg('request', filePath, flags)
		}

		const isMarkservUrl = req.url.includes(markservUrlLead)
		if (isMarkservUrl) {
			const markservFilePath = req.url.split(markservUrlLead)[1]
			const markservRelFilePath = path.join(__dirname, markservFilePath)
			if (flags.verbose) {
				msg('{markserv url}', style.link(markservRelFilePath), flags)
			}
			send(req, markservRelFilePath).pipe(res)
			return
		}

		const prettyPath = filePath

		let stat
		let isDir
		let isMarkdown
		let isHtml

		try {
			stat = fs.statSync(filePath)
			isDir = stat.isDirectory()
			if (isDir) {
				if (filePath.slice(-1) !== '/') {
					res.writeHead(302, {'Location': req.originalUrl + '/'})
					res.end()
					return
				}
			} else {
				isMarkdown = isType(fileTypes.markdown, filePath)
				isHtml = isType(fileTypes.html, filePath)
			}
		} catch (err) {
			const fileName = path.parse(filePath).base
			if (fileName === 'favicon.ico') {
				res.writeHead(200, {'Content-Type': 'image/x-icon'})
				res.write(faviconData)
				res.end()
				return
			}

			errorPage(404, err)
			return
		}

		// Markdown: Browser is requesting a Markdown file
		if (isMarkdown) {
			msg('markdown', style.link(prettyPath), flags)
			getFile(filePath).then(markdownToHTML).then(filePath).then(html => {
				return implant(html, implantHandlers, implantOpts).then(output => {
					const templateUrl = path.join(__dirname, 'templates/markdown.html')

					const handlebarData = {
						title: path.parse(filePath).base,
						content: output,
						pid: process.pid | 'N/A'
					}

					return baseTemplate(templateUrl, handlebarData).then(final => {
						const lvl2Dir = path.parse(templateUrl).dir
						const lvl2Opts = deepmerge(implantOpts, {baseDir: lvl2Dir})

						return implant(final, implantHandlers, lvl2Opts)
							.then(output => {
								res.writeHead(200, {
									'content-type': 'text/html; charset=utf-8'
								})
								res.end(output)
							})
					})
				})
			}).catch(err => {
				// eslint-disable-next-line no-console
				console.error(err)
			})
		} else if (isHtml) {
			msg('html', style.link(prettyPath), flags)
			getFile(filePath).then(html => {
				return implant(html, implantHandlers, implantOpts).then(output => {
					res.writeHead(200, {
						'content-type': 'text/html; charset=utf-8'
					})
					res.end(output)
				})
			}).catch(err => {
				// eslint-disable-next-line no-console
				console.error(err)
			})
		} else if (isDir) {
			try {
				// Index: Browser is requesting a Directory Index
				msg('dir', style.link(prettyPath), flags)
				const templateUrl = path.join(__dirname, 'templates/directory.html')

				const handlebarData = {
					dirname: path.parse(filePath).dir,
					title: path.parse(filePath).base,
					content: dirToHtml(filePath),
					pid: process.pid | 'N/A',
					path: createPathTags(path.relative(dir, filePath))
				}

				return baseTemplate(templateUrl, handlebarData).then(final => {
					const lvl2Dir = path.parse(templateUrl).dir
					const lvl2Opts = deepmerge(implantOpts, {baseDir: lvl2Dir})
					return implant(final, implantHandlers, lvl2Opts).then(output => {
						res.writeHead(200, {
							'content-type': 'text/html; charset=utf-8'
						})
						res.end(output)
					})
				}).catch(err => {
					// eslint-disable-next-line no-console
					console.error(err)
				})
			} catch (err) {
				errorPage(500, err)
				return
			}
		} else {
			// Other: Browser requests other MIME typed file (handled by 'send')
			msg('file', style.link(prettyPath), flags)
			send(req, filePath, {dotfiles: 'allow'}).on('error', err => {
				res.removeHeader('Content-Length');
				errorPage(500, err)
			}).pipe(res)
		}
	}
}

const startConnectApp = (liveReloadPort, httpRequestHandler) => {
	const connectApp = connect().use('/', httpRequestHandler)
	if (liveReloadPort) {
		connectApp.use(connectLiveReload({
			port: liveReloadPort
		}))
	}

	return connectApp
}

const startHTTPServer = (connectApp, port, flags) => {
	let httpServer

	if (connectApp) {
		httpServer = http.createServer(connectApp)
	} else {
		httpServer = http.createServer()
	}

	httpServer.listen(port, flags.address)
	return httpServer
}

const startLiveReloadServer = (liveReloadPort, flags) => {
	let dir = flags.dir
	const isDir = fs.statSync(dir).isDirectory()
	if (!isDir) {
		dir = path.parse(flags.dir).dir
	}

	const exts = fileTypes.watch.map(type => type.substr(1))
	const exclusions = fileTypes.exclusions.map(exPath => {
		return path.join(dir, exPath)
	})

	return liveReload.createServer({
		exts,
		exclusions,
		port: liveReloadPort
	}).watch(path.resolve(dir))
}

const logActiveServerInfo = (httpPort, liveReloadPort, flags) => {
	const serveURL = 'http://' + flags.address + ':' + httpPort
	const dir = path.resolve(flags.dir)

	if (!flags.silent) {
		const logoPath = path.join(__dirname, '..', 'media', 'markserv-logo-term.png')
		termImg(logoPath, {
			width: 12,
			fallback: () => {}
		})
	}

	const patreonLink = `patreon.com/f1lt3r`
	const githubLink = 'github.com/f1lt3r/markserv'

	msg('address', style.address(serveURL), flags)
	msg('path', chalk`{grey ${style.address(dir)}}`, flags)
	if (liveReloadPort) {
		msg('livereload', chalk`{grey communicating on port: ${style.port(liveReloadPort)}}`, flags)
	}

	if (process.pid) {
		msg('process', chalk`{grey your pid is: ${style.pid(process.pid)}}`, flags)
		msg('stop', chalk`{grey press {magenta [Ctrl + C]} or type {magenta "sudo kill -9 ${process.pid}"}}`, flags)
	}

	msg('github', chalk`Contribute on Github - {yellow.underline ${githubLink}}`, flags)
	msg('patreon', chalk`{whiteBright.bold Help support Markserv - Become a Patreon! ${style.patreon(patreonLink)}}`, flags)

	if (flags.$openLocation || flags.$pathProvided) {
		open(serveURL + '/' + flags.$openLocation)
	}
}

const init = async flags => {
	const liveReloadPort = +flags.livereloadport
	const httpPort = +flags.port

	const httpRequestHandler = createRequestHandler(flags)
	const connectApp = startConnectApp(liveReloadPort, httpRequestHandler)
	const httpServer = await startHTTPServer(connectApp, httpPort, flags)

	let liveReloadServer
	if (liveReloadPort) {
		liveReloadServer = await startLiveReloadServer(liveReloadPort, flags)
	}

	// Log server info to CLI
	logActiveServerInfo(httpPort, liveReloadPort, flags)

	const service = {
		pid: process.pid,
		httpServer,
		liveReloadServer,
		connectApp
	}

	return service
}

module.exports = {
	getFile,
	markdownToHTML,
	init
}
