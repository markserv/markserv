'use strict'

// Markdown Extension Types
const markdownExtensions = [
	'markdown',
	'mdown',
	'mkdn',
	'md',
	'mkd',
	'mdwn',
	'mdtxt',
	'mdtext',
	'text'
]

const watchExtensions = markdownExtensions.concat([
	'less',
	'js',
	'css',
	'html',
	'htm',
	'json',
	'gif',
	'png',
	'jpg',
	'jpeg'
])

const http = require('http')
const path = require('path')
const fs = require('fs')
const open = require('open')
const Promise = require('bluebird')
const connect = require('connect')
const less = require('less')
const jsdom = require('jsdom')
const send = require('send')
const liveReload = require('livereload')
const connectLiveReload = require('connect-livereload')
const chalk = require('chalk')

const MarkdownIt = require('markdown-it')
const markdownItAnchor = require('markdown-it-anchor')

const {JSDOM} = jsdom

const md = new MarkdownIt({
	linkify: true,
	html: true
}).use(markdownItAnchor)

const log = (str, flags) => {
	if (flags.silent) {
		return
	}
	// eslint-disable-next-line no-console
	console.log(str)
}
const msg = (type, msg, flags) =>
	log(chalk`{bgGreen.black  Markserv } {white  ${type}: }` + msg, flags)

const errormsg = (type, msg, flags) =>
	log(chalk`{bgRed.black  Markserv } {red  ${type}: }` + msg, flags)

// HasMarkdownExtension: check whether a file is Markdown type
const hasMarkdownExtension = path => {
	const fileExtension = path.substr(path.length - 3).toLowerCase()
	let extensionMatch = false

	markdownExtensions.forEach(extension => {
		if (`.${extension}` === fileExtension) {
			extensionMatch = true
		}
	})

	return extensionMatch
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
const buildStyleSheet = cssPath =>
	new Promise(resolve =>
		getFile(cssPath).then(data =>
			less.render(data).then(data =>
				resolve(data.css)
			)
		)
	)

// Linkify: converts github style wiki markdown links to .md links
const linkify = (body, flags) => new Promise((resolve, reject) => {
	const dom = new JSDOM(body)

	if (!dom) {
		return reject(dom)
	}

	const {window} = dom

	const links = window.document.getElementsByTagName('a')
	const l = links.length

	let href
	let link
	let markdownFile
	let mdFileExists
	let relativeURL
	let isFileHref

	for (let i = 0; i < l; i++) {
		link = links[i]
		href = link.href
		isFileHref = href.substr(0, 8) === 'file:///'

		markdownFile = href.replace(path.join('file://', __dirname), flags.dir) + '.md'
		mdFileExists = fs.existsSync(markdownFile)

		if (isFileHref && mdFileExists) {
			relativeURL = href.replace(path.join('file://', __dirname), '') + '.md'
			link.href = relativeURL
		}
	}

	const html = window.document.getElementsByTagName('body')[0].innerHTML
	resolve(html)
})

// BuildHTMLFromMarkDown: compiles the final HTML/CSS output from Markdown/Less files, includes JS
const buildHTMLFromMarkDown = (markdownPath, flags) => new Promise(resolve => {
	const stack = [
		buildStyleSheet(flags.less),

		// Article
		getFile(markdownPath)
			.then(markdownToHTML)
			.then(html => linkify(html, flags)),

		// Header
		flags.header && getFile(flags.header)
			.then(markdownToHTML)
			.then(html => linkify(html, flags)),

		// Footer
		flags.footer && getFile(flags.footer)
			.then(markdownToHTML)
			.then(html => linkify(html, flags)),

		// Navigation
		flags.navigation && getFile(flags.navigation)
			.then(markdownToHTML)
			.then(html => linkify(html, flags))
	]

	Promise.all(stack).then(data => {
		const css = data[0]
		const htmlBody = data[1]
		const dirs = markdownPath.split('/')
		const title = dirs[dirs.length - 1].split('.md')[0]

		let header
		let footer
		let navigation
		let outputHtml

		if (flags.header) {
			header = data[2]
		}

		if (flags.footer) {
			footer = data[3]
		}

		if (flags.navigation) {
			navigation = data[4]
		}

		if (flags.less === flags.$markserv.githubStylePath) {
			outputHtml = `
<!DOCTYPE html>
<head>
	<title>${title}</title>
		<meta charset="utf-8">
		<style>${css}</style>
		<link rel="stylesheet" href="//sindresorhus.com/github-markdown-css/github-markdown.css">
		<script src="https://code.jquery.com/jquery-2.1.1.min.js"></script>
		<script src="//cdnjs.cloudflare.com/ajax/libs/highlight.js/8.4/highlight.min.js"></script>
		<link rel="stylesheet" href="https://highlightjs.org/static/demo/styles/github-gist.css">
		<script type="text/x-mathjax-config">MathJax.Hub.Config({tex2jax: {inlineMath: [['$','$']]}});</script><script type="text/javascript" async src="https://cdn.mathjax.org/mathjax/latest/MathJax.js?config=TeX-MML-AM_CHTML"></script>
	</head>
<body>
	<article class="markdown-body">${htmlBody}</article>
	<script>hljs.initHighlightingOnLoad();</script>
</body>`
		} else {
			outputHtml = `
<!DOCTYPE html>
<head>
	<title>${title}</title>
	<script src="https://code.jquery.com/jquery-2.1.1.min.js"></script>
	<script src="//cdnjs.cloudflare.com/ajax/libs/highlight.js/8.4/highlight.min.js"></script>
	<link rel="stylesheet" href="https://highlightjs.org/static/demo/styles/github-gist.css">
	<meta charset="utf-8">
	<style>${css}</style>
	<script type="text/x-mathjax-config">MathJax.Hub.Config({tex2jax: {inlineMath: [['$','$']]}});</script><script type="text/javascript" async src="https://cdn.mathjax.org/mathjax/latest/MathJax.js?config=TeX-MML-AM_CHTML"></script>
</head>
<body>
	<div class="container">
		${(header ? '<header>' + header + '</header>' : '')}
		${(navigation ? '<nav>' + navigation + '</nav>' : '')}
		<article>${htmlBody}</article>
		${(footer ? '<footer>' + footer + '</footer>' : '')}
	</div>
<script>hljs.initHighlightingOnLoad();</script>
</body>`
		}
		resolve(outputHtml)
	})
})

// MarkItDown: begins the Markdown compilation process, then sends result when done...
const compileAndSendMarkdown = (path, res, flags) => buildHTMLFromMarkDown(path, flags)
	.then(html => {
		res.writeHead(200)
		res.end(html)

	// Catch if something breaks...
	}).catch(err => {
		msg('error', 'Can\'t build HTML', flags)
		// eslint-disable-next-line no-console
		console.error(err)
	})

const compileAndSendDirectoryListing = (filepath, res, flags) => {
	const urls = fs.readdirSync(filepath)
	let list = '<ul>\n'

	let prettyPath = '/' + path.relative(process.cwd(), filepath)
	if (prettyPath[prettyPath.length] !== '/') {
		prettyPath += '/'
	}

	if (prettyPath.substr(prettyPath.length - 2, 2) === '//') {
		prettyPath = prettyPath.substr(0, prettyPath.length - 1)
	}

	urls.forEach(subPath => {
		const dir = fs.statSync(filepath + subPath).isDirectory()
		let href
		if (dir) {
			href = subPath + '/'
			list += `\t<li class="dir"><a href="${href}">${href}</a></li> \n`
		} else {
			href = subPath
			if (subPath.split('.md')[1] === '') {
				list += `\t<li class="md"><a href="${href}">${href}</a></li> \n`
			} else {
				list += `\t<li class="file"><a href="${href}">${href}</a></li> \n`
			}
		}
	})

	list += '</ul>\n'

	buildStyleSheet(flags.less).then(css => {
		const html = `
<!DOCTYPE html>
<head>
	<title>${prettyPath}</title>
	<meta charset="utf-8">
	<script src="https://code.jquery.com/jquery-2.1.1.min.js"></script>
	<script src="//cdnjs.cloudflare.com/ajax/libs/highlight.js/8.4/highlight.min.js"></script>
	<link rel="stylesheet" href="//cdnjs.cloudflare.com/ajax/libs/highlight.js/8.4/styles/default.min.css">
	<link rel="stylesheet" href="//highlightjs.org/static/demo/styles/github-gist.css">
	<link rel="shortcut icon" type="image/x-icon" href="https://cdn0.iconfinder.com/data/icons/octicons/1024/markdown-128.png" />
	<style>${css}</style>
</head>
<body>
	<article class="markdown-body">
		<h1>Index of ${prettyPath}</h1>${list}
		<sup><hr> Served by <a href="https://www.npmjs.com/package/markserv">MarkServ</a> | PID: ${process.pid}</sup>
		</article>
</body>`

		// Log if verbose

		if (flags.verbose) {
			msg('index', path, flags)
		}

		// Send file
		res.writeHead(200, {'Content-Type': 'text/html'})
		res.write(html)
		res.end()
	})
}

// Remove URL params from file being fetched
const getPathFromUrl = url => {
	return url.split(/[?#]/)[0]
}

// Http_request_handler: handles all the browser requests
const createRequestHandler = flags => {
	const dir = flags.dir

	return (req, res) => {
		const decodedUrl = getPathFromUrl(decodeURIComponent(req.originalUrl))
		const filePath = path.normalize(unescape(dir) + unescape(decodedUrl))

		if (flags.verbose) {
			msg('request', filePath, flags)
		}

		const prettyPath = filePath

		let stat
		let isDir
		let isMarkdown

		try {
			stat = fs.statSync(filePath)
			isDir = stat.isDirectory()
			isMarkdown = false
			if (!isDir) {
				isMarkdown = hasMarkdownExtension(filePath)
			}
		} catch (err) {
			res.writeHead(200, {'Content-Type': 'text/html'})
			errormsg('404', path, flags)
			res.write(`404 :'( for ${prettyPath}`)
			res.end()
			return
		}

		// Markdown: Browser is requesting a Markdown file
		if (isMarkdown) {
			msg('markdown', prettyPath, flags)
			compileAndSendMarkdown(filePath, res, flags)
		} else if (isDir) {
			// Index: Browser is requesting a Directory Index
			msg('dir', prettyPath, flags)
			compileAndSendDirectoryListing(filePath, res, flags)
		} else {
			// Other: Browser requests other MIME typed file (handled by 'send')
			msg('file', prettyPath, flags)
			send(req, filePath).pipe(res)
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

const startLiveReloadServer = (liveReloadPort, flags) =>
	liveReload.createServer({
		exts: watchExtensions,
		port: liveReloadPort
	}).watch(path.resolve(flags.dir))

const logActiveServerInfo = (httpPort, liveReloadPort, flags) => {
	const serveURL = 'http://' + flags.address + ':' + httpPort
	const dir = path.resolve(flags.dir)

	msg('start', chalk`serving content from {white ${dir}} on port: {white ${httpPort}}`, flags)
	msg('address', chalk`{underline.white ${serveURL}}`, flags)
	msg('less', chalk`using style from {white ${flags.less}}`, flags)
	msg('livereload', chalk`communicating on port: {white ${liveReloadPort}}`, flags)

	if (process.pid) {
		msg('process', chalk`your pid is: {white ${process.pid}}`, flags)
		msg('info', chalk`to stop this server, press: {white [Ctrl + C]}, or type: {white "kill ${process.pid}"}`, flags)
	}

	if (flags.open) {
		open(serveURL + '/' + flags.open)
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
