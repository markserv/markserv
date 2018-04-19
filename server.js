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

const PORT_RANGE = {
	HTTP: [8000, 8100],
	LIVE_RELOAD: [35729, 35829],
	WEBSOCKETS: [3000, 4000]
}

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
const openPort = require('openport')
const connectLiveReload = require('connect-livereload')
const chalk = require('chalk')

const MarkdownIt = require('markdown-it')
const markdownItAnchor = require('markdown-it-anchor')

const {JSDOM} = jsdom

const md = new MarkdownIt({
	linkify: true,
	html: true
}).use(markdownItAnchor)

// eslint-disable-next-line no-console
const log = str => console.log(str)
const msg = (type, msg) => log(chalk`{bgGreen.black  Markserv } {white  ${type}: }` + msg)
const errormsg = (type, msg) => log(chalk`{bgRed.black  Markserv } {red  ${type}: }` + msg)

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
			outputHtml = `<!DOCTYPE html>
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
	          </body>
	          <script>hljs.initHighlightingOnLoad();</script>`
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
	          </body>
	          <script>hljs.initHighlightingOnLoad();</script>`
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
		msg('error', 'Can\'t build HTML')
		// eslint-disable-next-line no-console
		console.error(err)
	})

const compileAndSendDirectoryListing = (path, res, flags) => {
	const urls = fs.readdirSync(path)
	let list = '<ul>\n'

	urls.forEach(subPath => {
		const dir = fs.statSync(path + subPath).isDirectory()
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
					<title>${path.slice(2)}</title>
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
						<h1>Index of ${path.slice(2)}</h1>${list}
						<sup><hr> Served by <a href="https://www.npmjs.com/package/markserv">MarkServ</a> | PID: ${process.pid}</sup>
					</article>
				</body>
				<script src="http://localhost:35729/livereload.js?snipver=1"></script>`

		// Log if verbose

		if (flags.verbose) {
			msg('index').write(path).reset().write('\n')
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

		if (flags.verbose) {
			msg('request')
				.write(unescape(dir) + unescape(decodedUrl))
				.reset().write('\n')
		}

		const filePath = unescape(dir) + unescape(decodedUrl)
		const prettyPath = filePath.slice(2)

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
			errormsg('404', prettyPath)
			res.write(`404 :'( for ${prettyPath}`)
			res.end()
			return
		}

		// Markdown: Browser is requesting a Markdown file
		if (isMarkdown) {
			msg('markdown', prettyPath)
			compileAndSendMarkdown(filePath, res, flags)
		} else if (isDir) {
			// Index: Browser is requesting a Directory Index
			msg('dir', prettyPath)
			compileAndSendDirectoryListing(filePath, res, flags)
		} else {
			// Other: Browser requests other MIME typed file (handled by 'send')
			msg('file', prettyPath)
			send(req, filePath, {root: dir}).pipe(res)
		}
	}
}

const findOpenPort = range => new Promise((resolve, reject) => {
	const props = {
		startingPort: range[0],
		endingPort: range[1]
	}

	openPort.find(props, (err, port) => {
		if (err) {
			return reject(err)
		}
		resolve(port)
	})
})

const startConnectApp = (liveReloadPort, httpRequestHandler) => connect()
	.use('/', httpRequestHandler)
	.use(connectLiveReload({
		port: liveReloadPort
	}))

const startHTTPServer = (connectApp, port, flags) => {
	const httpServer = http.createServer(connectApp)
	httpServer.listen(port, flags.address)
	return httpServer
}

const startLiveReloadServer = (liveReloadPort, flags) => liveReload.createServer({
	exts: watchExtensions,
	port: liveReloadPort
}).watch(path.resolve(flags.dir))

const logActiveServerInfo = (httpPort, liveReloadPort, flags) => {
	const serveURL = 'http://' + flags.address + ':' + httpPort
	const dir = path.resolve(flags.dir)

	msg('start', chalk`serving content from {white ${dir}} on port: {white ${httpPort}}`)
	msg('address', chalk`{underline.white ${serveURL}}`)
	msg('less', chalk`using style from {white ${flags.less}}`)
	msg('livereload', chalk`communicating on port: {white ${liveReloadPort}}`)

	if (process.pid) {
		msg('process', chalk`your pid is: {white ${process.pid}}`)
		msg('info', chalk`to stop this server, press: {white [Ctrl + C]}, or type: {white "kill ${process.pid}"}`)
	}

	if (flags.file) {
		open(serveURL + '/' + flags.file)
	} else if (!flags.x) {
		open(serveURL)
	}
}

const init = async flags => {
	const liveReloadPort = await findOpenPort(PORT_RANGE.LIVE_RELOAD)
	const httpRequestHandler = createRequestHandler(flags)
	const connectApp = startConnectApp(liveReloadPort, httpRequestHandler)

	let httpPort
	if (flags.port === null) {
		httpPort = await findOpenPort(PORT_RANGE.HTTP)
	} else {
		httpPort = flags.port
	}
	const httpServer = await startHTTPServer(connectApp, httpPort, flags)

	const liveReloadServer = await startLiveReloadServer(liveReloadPort, flags)

	// Log server info to CLI
	logActiveServerInfo(httpPort, liveReloadPort, flags)

	const service = {
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
