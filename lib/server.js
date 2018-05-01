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
	.use(mdItAnchor)
	.use(mdItTaskLists)
	.use(mdItHLJS)

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

	let prettyPath = '/' + path.relative(process.cwd(), filePath)
	if (prettyPath[prettyPath.length] !== '/') {
		prettyPath += '/'
	}

	if (prettyPath.substr(prettyPath.length - 2, 2) === '//') {
		prettyPath = prettyPath.substr(0, prettyPath.length - 1)
	}

	urls.forEach(subPath => {
		const dir = fs.statSync(filePath + subPath).isDirectory()
		let href
		if (dir) {
			const iconClass = lookUpIconClass(subPath, 'folder')
			href = subPath + '/'
			list += `\t<li class="icon ${iconClass} isfolder"><a href="${href}">${href}</a></li> \n`
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

	const markservUrlLead = '%7Bmarkserv%7D'

	return (req, res) => {
		const decodedUrl = getPathFromUrl(decodeURIComponent(req.originalUrl))
		const filePath = path.normalize(unescape(dir) + unescape(decodedUrl))
		const baseDir = path.parse(filePath).dir
		implantOpts.baseDir = baseDir

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
			if (!isDir) {
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

			res.writeHead(200, {'Content-Type': 'text/html'})
			errormsg('404', filePath, flags, err)
			res.write(`404 :'( for ${prettyPath}`)
			res.end()
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
									'content-type': 'text/html'
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
						'content-type': 'text/html'
					})
					res.end(output)
				})
			}).catch(err => {
				// eslint-disable-next-line no-console
				console.error(err)
			})
		} else if (isDir) {
			// Index: Browser is requesting a Directory Index
			msg('dir', style.link(prettyPath), flags)
			const templateUrl = path.join(__dirname, 'templates/directory.html')

			const dirs = path.relative(dir, filePath).split('/')
			const shortPath = path.relative(dir, filePath)
			const thisPath = shortPath.slice(shortPath.lastIndexOf('/') + 1)
			const folderIcon = lookUpIconClass(thisPath, 'folder')

			const crumbs = dirs.map((dir, i) => {
				const href = '/' + (dirs.slice(0, i + 1).join('/')) + '/'
				if (href === '//') {
					dir = ''
				}
				const crumb = {href, text: dir}
				return crumb
			})

			const handlebarData = {
				dirname: path.parse(filePath).dir,
				content: dirToHtml(filePath),
				pid: process.pid | 'N/A',
				path: shortPath + '/',
				dir: dirs[dirs.length - 1] + '/',
				folderIcon,
				crumbs
			}

			return baseTemplate(templateUrl, handlebarData).then(final => {
				const lvl2Dir = path.parse(templateUrl).dir
				const lvl2Opts = deepmerge(implantOpts, {baseDir: lvl2Dir})
				return implant(final, implantHandlers, lvl2Opts).then(output => {
					res.writeHead(200, {
						'content-type': 'text/html'
					})
					res.end(output)
				})
			}).catch(err => {
				// eslint-disable-next-line no-console
				console.error(err)
			})
		} else {
			// Other: Browser requests other MIME typed file (handled by 'send')
			msg('file', style.link(prettyPath), flags)
			send(req, filePath, {dotfiles: 'allow'}).pipe(res)
		}
	}
}

const startConnectApp = (liveReloadPort, httpRequestHandler) => {
	const connectApp = connect().use('/', httpRequestHandler)
	connectApp.use(connectLiveReload({
		port: liveReloadPort
	}))

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

	msg('patreon', chalk`{whiteBright.bold Help support Markserv - Become a Patreon! ${style.patreon(patreonLink)}}`, flags)
	msg('github', chalk`Contribute on Github - {yellow.underline ${githubLink}}`, flags)
	msg('address', style.address(serveURL), flags)
	msg('path', chalk`{grey ${style.address(dir)}}`, flags)
	msg('livereload', chalk`{grey communicating on port: ${style.port(liveReloadPort)}}`, flags)

	if (process.pid) {
		msg('process', chalk`{grey your pid is: ${style.pid(process.pid)}}`, flags)
		msg('stop', chalk`{grey press {magenta [Ctrl + C]} or type {magenta "sudo kill -9 ${process.pid}"}}`, flags)
	}

	if (flags.$openLocation || flags.$pathProvided) {
		open(serveURL + '/' + flags.$openLocation)
	}
}

const init = async flags => {
	const liveReloadPort = flags.livereloadport
	const httpPort = flags.port

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
