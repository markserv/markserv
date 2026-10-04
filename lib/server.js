'use strict'

const http = require('http')
const https = require('https')
const path = require('path')
const fs = require('fs')

const chalk = require('chalk')
const opn = require('open')
const Promise = require('bluebird')
const connect = require('connect')
const less = require('less')
const send = require('send')
const WebSocket = require('ws')
const getPort = require('get-port')
const implant = require('implant')
const deepmerge = require('deepmerge')
const handlebars = require('handlebars')
const MarkdownIt = require('markdown-it')
const mdItAnchor = require('markdown-it-anchor')
const mdItTaskLists = require('markdown-it-task-lists')
const mdItHLJS = require('markdown-it-highlightjs')
const mdItTOC = require('markdown-it-table-of-contents')
// markdown-it-emoji@3 dropped the single default plugin in favor of
// named sets (bare/full/light); 'full' is the v1-equivalent set
const mdItEmoji = require('markdown-it-emoji')
const mdItMathJax = require('markdown-it-mathjax')
const emojiRegex = require('emoji-regex')()
const promptly = require('promptly')
const searchLib = require(path.join(__dirname, 'search'))
const siteExportLib = require(path.join(__dirname, 'site-export'))

const pkg = require(path.join('..', 'package.json'))

const style = {
	link: chalk.blueBright.underline.italic,
	github: chalk.blue.underline.italic,
	address: chalk.greenBright.underline.italic,
	port: chalk.reset.cyanBright,
	pid: chalk.reset.cyanBright
}

const slugify = text => {
	return text.toLowerCase().replace(/\s/g, '-')
		// Remove punctuations other than hyphen and underscore
		.replace(/[`~!@#$%^&*()+=<>?,./:;"'|{}[\]\\\u2000-\u206F\u2E00-\u2E7F]/g, '')
		// Remove emojis
		.replace(emojiRegex, '')
		// Remove CJK punctuations
		.replace(/[\u3000。？！，、；：“”【】（）〔〕［］﹃﹄“”‘’﹁﹂—…－～《》〈〉「」]/g, '')
}

const md = new MarkdownIt({
	linkify: false,
	html: true
})
	.use(mdItAnchor, {slugify})
	.use(mdItTaskLists)
	.use(mdItHLJS)
	.use(mdItEmoji.full)
	.use(mdItMathJax())
	.use(mdItTOC, {
		includeLevel: [1, 2, 3, 4, 5, 6],
		slugify
	})

// Mermaid fences are rendered client-side by the lazy loader in
// templates/markdown.html. Pass the source through escaped (the loader
// reads it back via innerHTML) and keep highlight.js away from it, which
// would otherwise log "Could not find the language 'mermaid'".
// markdown-it passes strings starting with <pre straight through.
const {highlight} = md.options
md.options.highlight = (code, lang) => {
	if (lang === 'mermaid') {
		return `<pre class="mermaid">${md.utils.escapeHtml(code)}</pre>`
	}

	return highlight(code, lang)
}

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

	// Exact directory names. collectWatchDirs prunes these subtrees
	// from the watch set; the change callback below additionally
	// substring-filters basenames (trailing-slash-free so both match).
	exclusions: [
		'node_modules',
		'.git'
	]
}

fileTypes.watch = fileTypes.watch
	.concat(fileTypes.markdown)
	.concat(fileTypes.html)

const materialIcons = require(path.join(__dirname, 'icons', 'material-icons.json'))

const faviconPath = path.join(__dirname, 'icons', 'markserv.svg')
const faviconData = fs.readFileSync(faviconPath)

// The mermaid client library (v11+) is a code-split ESM build: a
// dist/mermaid.esm.min.mjs shim plus its ./chunks/ directory. It is
// served under the reserved /vendor/mermaid/ prefix (see
// createRequestHandler), whose client-controllable suffix is confined
// to the package's dist root. Served locally instead of a CDN, so
// pages with diagrams work offline and no third-party host sits in the
// page load path.
const MERMAID_VENDOR_PREFIX = '/vendor/mermaid/'

const resolveMermaidDistRoot = () => {
	try {
		return path.dirname(require.resolve('mermaid/dist/mermaid.esm.min.mjs'))
	} catch (error) {
		return null
	}
}

// Reserved control prefix for markserv's own subroutes (search,
// export). Like MERMAID_VENDOR_PREFIX it is checked before file
// resolution, so a real file can never satisfy it.
const MARKSERV_RESERVED_PREFIX = '/__markserv/'

const log = (str, flags, err) => {
	if (flags.silent) {
		return
	}

	if (str) {
		console.log(str)
	}

	if (err) {
		console.error(err)
	}
}

const msg = (type, msg, flags) => {
	if (type === 'github') {
		return log(chalk`{bgYellow.black     GitHub  } ` + msg, flags)
	}

	log(chalk`{bgGreen.black   Markserv  }{white  ${type}: }` + msg, flags)
}

const errormsg = (type, msg, flags, err) =>
	log(chalk`{bgRed.white   Markserv  }{red  ${type}: }` + msg, flags, err)

const warnmsg = (type, msg, flags) =>
	log(chalk`{bgYellow.black   Markserv  }{yellow  ${type}: }` + msg, flags)

const isType = (exts, filePath) => {
	const fileExt = path.parse(filePath).ext
	return exts.includes(fileExt)
}

// Root confinement: true when resolvedPath is rootDir itself or
// resolves beneath it. Both sides are resolved first so relative
// inputs compare on equal footing, and the prefix includes the path
// separator so a sibling like /root-evil never matches /root.
const isWithinRoot = (rootDir, resolvedPath) => {
	const root = path.resolve(rootDir)
	const resolved = path.resolve(resolvedPath)

	return resolved === root || resolved.startsWith(root + path.sep)
}

// MarkdownToHTML: turns a Markdown file into HTML content
const markdownToHTML = markdownText => new Promise((resolve, reject) => {
	let result

	try {
		result = md.render(markdownText)
	} catch (error) {
		return reject(error)
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
	new Promise((resolve, reject) =>
		getFile(cssPath).then(data =>
			less.render(data).then(data =>
				resolve(data.css)
			)
		).catch(reject)
	)

const baseTemplate = (templateUrl, handlebarData) => new Promise((resolve, reject) => {
	getFile(templateUrl).then(source => {
		const template = handlebars.compile(source)
		const output = template(handlebarData)
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

	if (prettyPath.slice(prettyPath.length - 2, 2) === '//') {
		prettyPath = prettyPath.slice(0, prettyPath.length - 1)
	}

	urls.forEach(subPath => {
		if (subPath.charAt(0) === '.') {
			return
		}

		const dir = fs.statSync(filePath + subPath).isDirectory()
		let href
		if (dir) {
			href = subPath + '/'
			list += `\t<li class="icon folder isfolder"><a href="${href}">${href}</a></li> \n`
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

const secureUrl = url => {
	const encodedUrl = encodeURI(url.replace(/%/g, '%25'))
	return encodedUrl
}

// Create breadcrumb trail tracks
const createBreadcrumbs = path => {
	const crumbs = [{
		href: '/',
		text: './'
	}]

	const dirParts = path.replace(/(^\/+|\/+$)/g, '').split('/')
	const urlParts = dirParts.map(secureUrl)

	if (path.length === 0) {
		return crumbs
	}

	let collectPath = '/'

	dirParts.forEach((dirName, i) => {
		const fullLink = collectPath + urlParts[i] + '/'

		const crumb = {
			href: fullLink,
			text: dirName + '/'
		}

		crumbs.push(crumb)
		collectPath = fullLink
	})

	return crumbs
}

// Http_request_handler: handles all the browser requests
const resolveTheme = flags => {
	if (flags.light) {
		return 'light'
	}

	if (flags.synthwave) {
		return 'synthwave'
	}

	if (flags.theme && flags.theme !== 'dark') {
		return flags.theme
	}

	return 'dark'
}

// Render pipeline: everything below the HTTP boundary that renders
// markdown — the implant handlers/opts, the search index, the
// content-level render, and the standalone page wrap. Module scope
// (hoisted out of the request-handler closure) so exportSite can
// build the exact same pipeline offline — one shared code path for
// serve and export.
const makeRenderPipeline = async (flags, rootDir) => {
	const theme = resolveTheme(flags)
	const themeFlags = {
		themeDark: theme === 'dark',
		themeLight: theme === 'light',
		themeSynthwave: theme === 'synthwave',
		themeSolarized: theme === 'solarized'
	}

	const implantOpts = {
		maxDepth: 10,
		// Implant file resolution is confined to the served root;
		// the level-2 template pass inherits the same confinement
		confinementRoot: rootDir
	}

	// Record an implant dependency for the render cache: the rel
	// path of a successfully implanted file is appended to the
	// per-render deps set so invalidation can re-render dependents
	// when an implanted file changes.
	const recordImplantDep = (opts, absUrl) => {
		if (!(opts && opts.renderDeps instanceof Set)) {
			return
		}

		if (!isWithinRoot(rootDir, absUrl)) {
			return
		}

		opts.renderDeps.add(
			path.relative(rootDir, absUrl).split(path.sep).join('/')
		)
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
			if (typeof url !== 'string' || typeof (opts && opts.baseDir) !== 'string') {
				return resolve(false)
			}

			const absUrl = path.join(opts.baseDir, url)
			if (typeof opts.confinementRoot !== 'string' ||
				!isWithinRoot(opts.confinementRoot, absUrl)) {
				// Implant file escapes the served root: refuse
				warnmsg('implant 403', style.link(absUrl), flags)
				return resolve(false)
			}

			getFile(absUrl)
				.then(data => {
					recordImplantDep(opts, absUrl)
					msg('implant', style.link(absUrl), flags)
					resolve(data)
				})
				.catch(error => {
					warnmsg('implant 404', style.link(absUrl), flags, error)
					resolve(false)
				})
		}),

		less: (url, opts) => new Promise(resolve => {
			if (typeof url !== 'string' || typeof (opts && opts.baseDir) !== 'string') {
				return resolve(false)
			}

			const absUrl = path.join(opts.baseDir, url)
			if (typeof opts.confinementRoot !== 'string' ||
				!isWithinRoot(opts.confinementRoot, absUrl)) {
				// Implant file escapes the served root: refuse
				warnmsg('implant 403', style.link(absUrl), flags)
				return resolve(false)
			}

			buildLessStyleSheet(absUrl)
				.then(data => {
					recordImplantDep(opts, absUrl)
					msg('implant', style.link(absUrl), flags)
					resolve(data)
				})
				.catch(error => {
					warnmsg('implant 404', style.link(absUrl), flags, error)
					resolve(false)
				})
		}),

		markdown: (url, opts) => new Promise(resolve => {
			if (typeof url !== 'string' || typeof (opts && opts.baseDir) !== 'string') {
				return resolve(false)
			}

			const absUrl = path.join(opts.baseDir, url)
			if (typeof opts.confinementRoot !== 'string' ||
				!isWithinRoot(opts.confinementRoot, absUrl)) {
				// Implant file escapes the served root: refuse
				warnmsg('implant 403', style.link(absUrl), flags)
				return resolve(false)
			}

			getFile(absUrl).then(markdownToHTML)
				.then(data => {
					recordImplantDep(opts, absUrl)
					msg('implant', style.link(absUrl), flags)
					resolve(data)
				})
				.catch(error => {
					warnmsg('implant 404', style.link(absUrl), flags, error)
					resolve(false)
				})
		}),

		html: (url, opts) => new Promise(resolve => {
			if (typeof url !== 'string' || typeof (opts && opts.baseDir) !== 'string') {
				return resolve(false)
			}

			const absUrl = path.join(opts.baseDir, url)
			if (typeof opts.confinementRoot !== 'string' ||
				!isWithinRoot(opts.confinementRoot, absUrl)) {
				// Implant file escapes the served root: refuse
				warnmsg('implant 403', style.link(absUrl), flags)
				return resolve(false)
			}

			getFile(absUrl)
				.then(data => {
					recordImplantDep(opts, absUrl)
					msg('implant', style.link(absUrl), flags)
					resolve(data)
				})
				.catch(error => {
					warnmsg('implant 404', style.link(absUrl), flags, error)
					resolve(false)
				})
		})
	}

	// Content-level render for the search index / render cache:
	// markdown → implanted body (no template pass — page chrome is
	// irrelevant to search text). A fresh deps Set per pass records
	// which files the page implants, so invalidation can re-render
	// dependents when an implanted file changes.
	const renderContentHtml = abs => {
		const deps = new Set()
		return getFile(abs)
			.then(markdownToHTML)
			.then(html => implant(html, implantHandlers, {
				...implantOpts,
				baseDir: path.parse(abs).dir,
				renderDeps: deps
			}))
			.then(html => ({contentHtml: html, deps}))
	}

	// Search index over the markdown files under the served root:
	// dot entries and fileTypes.exclusions pruned, symlinks never
	// followed, files over 1 MB skipped. --no-search (flags.search
	// === false) disables it. The $-prefixed internal flag (like
	// $wsPort/$hotreload) lets startHotReload's watcher keep the
	// index fresh. With --templates the index stores each file's
	// rendered, implanted, tag-stripped text (search matches what
	// the page shows) and the render is cached for the exports.
	const searchIndex = flags.search === false ?
		null :
		await searchLib.buildIndex(rootDir, {
			exclusions: fileTypes.exclusions,
			slugify,
			markdownExts: fileTypes.markdown,
			maxFileSize: 1000000,
			render: flags.templates ? renderContentHtml : null
		})

	flags.$searchIndex = searchIndex

	if (searchIndex) {
		msg('search', 'indexed ' + searchIndex.entries.size + ' files', flags)
	}

	// Standalone page render with the render cache: the expensive
	// part (markdown-it + implant) is stored on the index entry and
	// reused across format=html, html-assets, and site export; only
	// the cheap template wrap (theme/flags are fixed per server
	// instance) happens per request. implantOpts.baseDir is set per
	// file — the handler's top-level baseDir is stale for this
	// purpose.
	//
	// Options: docMdSet (a Set of root-relative markdown rels) makes
	// this a single-page export — relative document links in the
	// implanted content are rewritten to the set's .html names
	// before the template wrap (the site export passes null: its
	// per-bundle rewrite is unchanged, and an already-rewritten
	// .html href never resolves to a .md file, so a double pass
	// would be a no-op anyway). withContent also returns the
	// pre-wrap contentHtml (asset discovery scans that, not the
	// template chrome).
	const renderStandalonePage = async (exportPath, {docMdSet = null, withContent = false} = {}) => {
		let contentHtml = flags.$searchIndex ?
			searchLib.renderFromIndex(flags.$searchIndex, exportPath) :
			null
		const deps = new Set()

		if (contentHtml === null) {
			implantOpts.baseDir = path.parse(exportPath).dir
			const rendered = await getFile(exportPath).then(markdownToHTML)
			contentHtml = flags.templates ?
				await implant(rendered, implantHandlers, {
					...implantOpts,
					baseDir: path.parse(exportPath).dir,
					renderDeps: deps
				}) :
				rendered

			if (flags.$searchIndex) {
				searchLib.storeContent(flags.$searchIndex, exportPath, {contentHtml, deps})
			}
		}

		if (docMdSet instanceof Set) {
			const rel = path.relative(rootDir, exportPath)
				.split(path.sep).join('/')
			// Page-relative output: the reader opens the exported page
			// from wherever it ships, so document links must resolve
			// against the page, not the served root
			contentHtml = siteExportLib.rewriteLinks(contentHtml, {
				currentDir: path.posix.dirname(rel),
				bundleMdSet: docMdSet,
				pageRelative: true
			})
		}

		const templateUrl = path.join(__dirname, 'templates/markdown.html')
		const handlebarData = {
			title: path.parse(exportPath).base,
			content: contentHtml,
			pid: process.pid | 'N/A',
			theme,
			...themeFlags,
			hotreload: flags.$hotreload,
			wsPort: flags.$wsPort,
			rootDir: flags.dir,
			mermaidLoose: !!flags.mermaidLoose,
			standalone: true
		}

		let final = await baseTemplate(templateUrl, handlebarData)

		if (flags.templates) {
			const lvl2Dir = path.parse(templateUrl).dir
			const lvl2Opts = deepmerge(implantOpts, {baseDir: lvl2Dir})
			final = await implant(final, implantHandlers, lvl2Opts)
		}

		// Inline the {markserv} template stylesheets so every
		// standalone render is self-contained (single-page and site
		// pages alike)
		final = siteExportLib.inlineMarkservAssets(final)

		return withContent ? {html: final, contentHtml} : final
	}

	return {
		implantOpts,
		implantHandlers,
		theme,
		themeFlags,
		searchIndex,
		renderContentHtml,
		renderStandalonePage
	}
}

// CreateRequestHandler: builds the shared render pipeline (one code
// path for serve and export), then the HTTP handler.
const createRequestHandler = async flags => {
	let {dir} = flags
	const isDir = fs.statSync(dir).isDirectory()
	if (!isDir) {
		dir = path.parse(flags.dir).dir
	}

	flags.$openLocation = path.relative(dir, flags.dir)
	const rootDir = path.resolve(dir)

	const pipeline = await makeRenderPipeline(flags, rootDir)
	const {
		implantOpts,
		implantHandlers,
		theme,
		themeFlags,
		renderStandalonePage
	} = pipeline

	const markservUrlLead = '%7Bmarkserv%7D'

	return (req, res) => {
		const decodedUrl = getPathFromUrl(decodeURIComponent(req.originalUrl))
		const filePath = path.normalize(unescape(dir) + unescape(decodedUrl))
		if (!isWithinRoot(rootDir, filePath)) {
			// Path traversal: refuse anything that escapes the served
			// root. The body stays minimal on purpose: no resolved
			// path, no stack, no errno details.
			res.writeHead(403, {'content-type': 'text/plain; charset=utf-8'})
			res.end('Forbidden')
			return
		}

		const baseDir = path.parse(filePath).dir
		implantOpts.baseDir = baseDir

		const errorPage = (code, filePath, err) => {
			errormsg(code, filePath, flags, err)

			const templateUrl = path.join(__dirname, 'templates/error.html')
			const fileName = path.parse(filePath).base
			const referer = unescape(req.headers.referer || path.parse(decodedUrl).dir + '/')
			const errorMsg = md.utils.escapeHtml(err.message)
			const errorStack = md.utils.escapeHtml(String(err.stack))

			const handlebarData = {
				pid: process.pid | 'N/A',
				code,
				fileName,
				filePath,
				errorMsg,
				errorStack,
				referer,
				theme,
				...themeFlags,
				hotreload: flags.$hotreload,
				wsPort: flags.$wsPort,
				rootDir: flags.dir
			}

			return baseTemplate(templateUrl, handlebarData).then(final => {
				res.writeHead(200, {
					'content-type': 'text/html; charset=utf-8'
				})
				res.end(final)
			})
		}

		if (flags.verbose) {
			msg('request', filePath, flags)
		}

		// Reserved vendor prefix: serves the mermaid npm package's dist
		// tree (ESM shim + chunks) for the client-side diagram loader.
		// The suffix is confined to the dist root — a fixed resource
		// root, not an open node_modules bridge.
		if (req.url.startsWith(MERMAID_VENDOR_PREFIX)) {
			const mermaidDistRoot = resolveMermaidDistRoot()
			const rel = getPathFromUrl(decodeURIComponent(req.url))
				.slice(MERMAID_VENDOR_PREFIX.length)
			const filePath = path.normalize(path.join(mermaidDistRoot || __dirname, rel))

			if (!mermaidDistRoot || !isWithinRoot(mermaidDistRoot, filePath)) {
				// Path traversal above the dist root: refuse
				res.writeHead(403, {'content-type': 'text/plain; charset=utf-8'})
				res.end('Forbidden')
				return
			}

			if (!fs.existsSync(filePath)) {
				warnmsg('vendor 404', rel, flags)
				res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'})
				res.end('Not Found')
				return
			}

			if (flags.verbose) {
				msg('{vendor mermaid}', style.link(rel), flags)
			}

			send(req, filePath).pipe(res)
			return
		}

		// Reserved markserv control prefix: /__markserv/search and
		// /__markserv/export. This URL already passed the first
		// root-confinement gate above (root/__markserv/... resolves
		// under the root); the export subroute re-confines its
		// decoded target, because the first gate cannot see through
		// percent-encoded dot segments.
		if (req.url.startsWith(MARKSERV_RESERVED_PREFIX)) {
			const rawSub = req.url.slice(MARKSERV_RESERVED_PREFIX.length)
			const qMark = rawSub.indexOf('?')
			const route = qMark === -1 ? rawSub : rawSub.slice(0, qMark)
			const query = qMark === -1 ? '' : rawSub.slice(qMark + 1)
			const params = new URL('http://localhost/?' + query).searchParams
			const kind = route.split('/')[0]

			if (kind === 'search') {
				if (!flags.$searchIndex) {
					warnmsg('search', 'disabled (--no-search)', flags)
					res.writeHead(503, {'content-type': 'application/json; charset=utf-8'})
					res.end(JSON.stringify({error: 'search disabled'}))
					return
				}

				const q = params.get('q') || ''
				let limit = parseInt(params.get('limit'), 10)
				if (Number.isNaN(limit)) {
					limit = 50
				}

				limit = Math.max(1, Math.min(100, limit))
				let perFile = parseInt(params.get('perFile'), 10)
				if (Number.isNaN(perFile)) {
					perFile = 3
				}

				perFile = Math.max(1, Math.min(10, perFile))
				const {results, matches, files} = searchLib.search(
					flags.$searchIndex,
					q,
					{limit, perFile, path: params.get('path') ?? undefined}
				)

				if (flags.verbose) {
					msg('search', style.link(q || '(empty)') + ' → ' +
						results.length + ' results (' + matches +
						' matches across ' + files + ' files)', flags)
				}

				res.writeHead(200, {'content-type': 'application/json; charset=utf-8'})
				res.end(JSON.stringify({results, matches, files}))
				return
			}

			if (kind === 'export') {
				// --no-exports: the endpoint is disabled — surfaces no
				// targets at all (before target resolve / 403 / 404 /
				// format validation), mirroring the --no-search 503
				if (flags.exports === false) {
					warnmsg('export', 'disabled (--no-exports)', flags)
					res.writeHead(503, {'content-type': 'application/json; charset=utf-8'})
					res.end(JSON.stringify({error: 'exports disabled'}))
					return
				}

				const targetRaw = route.slice('export/'.length)
				const exportPath = path.normalize(
					path.join(rootDir, unescape(decodeURIComponent(targetRaw)))
				)

				if (!isWithinRoot(rootDir, exportPath)) {
					// Decoded target escapes the served root: refuse.
					// The body stays minimal on purpose: no resolved
					// path, no stack, no errno details.
					warnmsg('export 403', exportPath, flags)
					res.writeHead(403, {'content-type': 'text/plain; charset=utf-8'})
					res.end('Forbidden')
					return
				}

				let exportStat
				try {
					exportStat = fs.statSync(exportPath)
				} catch (error) {
					warnmsg('export 404', exportPath, flags, error)
					res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'})
					res.end('Not Found')
					return
				}

				const format = params.get('format')
				if (format !== 'html' && format !== 'md' &&
					format !== 'zip' && format !== 'site' &&
					format !== 'html-assets') {
					res.writeHead(400, {'content-type': 'text/plain; charset=utf-8'})
					res.end('Bad Request')
					return
				}

				const base = path.parse(exportPath).base || 'root'

				if (format === 'zip' || format === 'site') {
					if (!exportStat.isDirectory()) {
						res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'})
						res.end('Not Found')
						return
					}

					const archiver = require('archiver')
					const zipName = base + '.zip'

					res.writeHead(200, {
						'content-type': 'application/zip',
						'content-disposition': 'attachment; filename="' + zipName + '"'
					})

					const archive = archiver('zip', {zlib: {level: 9}})
					archive.on('error', error => {
						warnmsg('export zip', exportPath, flags, error)
						if (!res.writableEnded) {
							res.destroy()
						}
					})
					archive.pipe(res)

					if (format === 'zip') {
						// Raw archive: same walk rules as the search
						// index — dot entries pruned at every level,
						// exclusion dirs pruned, symlinks never
						// followed.
						searchLib.listFiles(exportPath, {exclusions: fileTypes.exclusions})
							.forEach(({abs, rel}) => {
								archive.file(abs, {name: rel})
							})

						archive.finalize()

						if (flags.verbose) {
							msg('export', style.link(exportPath) + ' (zip)', flags)
						}
					} else {
						// Site: rendered standalone pages (link-
						// rewritten so the bundle browses from disk)
						// + verbatim non-markdown files. Indexed pages
						// are render-cache hits.
						siteExportLib.buildSite(exportPath, {
							exclusions: fileTypes.exclusions,
							markdownExts: fileTypes.markdown,
							listFiles: searchLib.listFiles,
							renderPage: abs => renderStandalonePage(abs)
						}).then(({entries}) => {
							entries.forEach(({name, content}) => {
								archive.append(
									Buffer.isBuffer(content) ? content : Buffer.from(content),
									{name}
								)
							})

							if (flags.verbose) {
								msg('export', style.link(exportPath) + ' (site, ' + entries.length + ' entries)', flags)
							}

							archive.finalize()
						}).catch(error => {
							warnmsg('export site', exportPath, flags, error)
							if (!res.writableEnded) {
								res.destroy()
							}
						})
					}
					return
				}

				if (exportStat.isDirectory()) {
					// md/html/html-assets exports are for files only
					res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'})
					res.end('Not Found')
					return
				}

				if (format === 'md') {
					msg('export', style.link(exportPath) + ' (md)', flags)
					res.writeHead(200, {
						'content-type': 'text/plain; charset=utf-8',
						'content-disposition': 'attachment; filename="' + base + '"'
					})
					fs.readFile(exportPath, (err, data) => {
						if (err) {
							warnmsg('export', exportPath, flags, err)
							if (!res.writableEnded) {
								res.destroy()
							}
							return
						}

						res.end(data)
					})
					return
				}

				if (format === 'html-assets') {
					// File-only (markdown) — a raw HTML file is 404,
					// like format=html (a raw HTML page's assets are
					// not re-packaged)
					if (!isType(fileTypes.markdown, exportPath)) {
						res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'})
						res.end('Not Found')
						return
					}

					// docMdSet: the markdown files of the whole served
					// root (one walk per single-page export —
					// acceptable) so relative document links rewrite
					// to .html names
					const docMdSet = new Set(
						searchLib.listFiles(rootDir, {exclusions: fileTypes.exclusions})
							.filter(f => isType(fileTypes.markdown, f.abs))
							.map(f => f.rel)
					)

					renderStandalonePage(exportPath, {docMdSet, withContent: true})
						.then(({html, contentHtml}) => {
							// Asset discovery scans the implanted page
							// content (post-implant, pre-template-wrap —
							// template/CSS chrome cannot leak in)
							const {assets, skipped} = siteExportLib.collectAssets(
								contentHtml, {
									pageDir: path.parse(exportPath).dir,
									rootDir,
									markdownExts: fileTypes.markdown
								}
							)

							if (flags.verbose) {
								skipped.forEach(s => {
									warnmsg('export html-assets',
										s.ref + ' (' + s.reason + ')', flags)
								})
							}

							// Zip layout rooted at the lowest common
							// ancestor of the page and its assets — the
							// common case (assets inside the page's
							// directory) is just the page's directory.
							// Every entry stays a valid downward-relative
							// name (no .. in zip names).
							const pageRel = path.relative(rootDir, exportPath)
								.split(path.sep)
							const assetRels = assets.map(a =>
								path.relative(rootDir, a.abs).split(path.sep))
							const common = []
							const minLen = Math.min(
								pageRel.length,
								...assetRels.map(l => l.length)
							)
							for (let i = 0; i < minLen; i++) {
								if (assetRels.every(l => l[i] === pageRel[i])) {
									common.push(pageRel[i])
								} else {
									break
								}
							}

							const pageNameParts = pageRel.slice(common.length)
							pageNameParts[pageNameParts.length - 1] =
								pageNameParts[pageNameParts.length - 1]
									.replace(/\.[^.]+$/, '.html')
							const pageName = pageNameParts.join('/')
							const assetName = parts =>
								parts.slice(common.length).join('/')

							const archiver = require('archiver')
							const zipName = path.parse(exportPath).name + '.assets.zip'

							res.writeHead(200, {
								'content-type': 'application/zip',
								'content-disposition': 'attachment; filename="' + zipName + '"'
							})

							const archive = archiver('zip', {zlib: {level: 9}})
							archive.on('error', error => {
								warnmsg('export html-assets', exportPath, flags, error)
								if (!res.writableEnded) {
									res.destroy()
								}
							})
							archive.pipe(res)
							archive.append(Buffer.from(html), {name: pageName})
							assets.forEach(a => {
								archive.file(a.abs, {
									name: assetName(path.relative(rootDir, a.abs).split(path.sep))
								})
							})
							archive.finalize()

							if (flags.verbose) {
								msg('export', style.link(exportPath) + ' (html-assets, ' + assets.length + ' assets)', flags)
							}
						})
						.catch(error => {
							errormsg('export', exportPath, flags, error)
							if (!res.headersSent) {
								res.writeHead(500, {'content-type': 'text/plain; charset=utf-8'})
								res.end('Internal Server Error')
							} else if (!res.writableEnded) {
								res.destroy()
							}
						})
					return
				}

				// format === 'html'
				if (isType(fileTypes.html, exportPath)) {
					// A raw HTML file's "standalone" is itself
					msg('export', style.link(exportPath) + ' (html)', flags)
					res.writeHead(200, {
						'content-type': 'text/html; charset=utf-8',
						'content-disposition': 'attachment; filename="' + base + '"'
					})
					fs.readFile(exportPath, (err, data) => {
						if (err) {
							warnmsg('export', exportPath, flags, err)
							if (!res.writableEnded) {
								res.destroy()
							}
							return
						}

						res.end(data)
					})
					return
				}

				if (!isType(fileTypes.markdown, exportPath)) {
					res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'})
					res.end('Not Found')
					return
				}

				// Markdown: render through the normal pipeline into
				// the standalone template (styles inlined; the search
				// box, export menu, and hot-reload stripped, while the
				// reading chrome — width slider, theme toggle — is
				// kept), via the render cache. docMdSet rewrites
				// relative document links to .html names.
				const docMdSet = new Set(
					searchLib.listFiles(rootDir, {exclusions: fileTypes.exclusions})
						.filter(f => isType(fileTypes.markdown, f.abs))
						.map(f => f.rel)
				)

				msg('export', style.link(exportPath) + ' (standalone html)', flags)

				renderStandalonePage(exportPath, {docMdSet}).then(final => {
					res.writeHead(200, {
						'content-type': 'text/html; charset=utf-8',
						'content-disposition': 'attachment; filename="' + base + '.html"'
					})
					res.end(final)
				}).catch(error => {
					errormsg('export', exportPath, flags, error)
					if (!res.headersSent) {
						res.writeHead(500, {'content-type': 'text/plain; charset=utf-8'})
						res.end('Internal Server Error')
					} else if (!res.writableEnded) {
						res.destroy()
					}
				})
				return
			}

			// Unknown subroute under the reserved prefix
			res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'})
			res.end('Not Found')
			return
		}

		const isMarkservUrl = req.url.includes(markservUrlLead)
		if (isMarkservUrl) {
			const markservFilePath = req.url.split(markservUrlLead)[1]
			const markservRelFilePath = path.join(__dirname, markservFilePath)
			if (!isWithinRoot(__dirname, markservRelFilePath)) {
				// Internal {markserv} URLs may only reach into lib/
				res.writeHead(403, {'content-type': 'text/plain; charset=utf-8'})
				res.end('Forbidden')
				return
			}

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
		} catch (error) {
			const fileName = path.parse(filePath).base
			if (fileName === 'favicon.ico') {
				res.writeHead(200, {'Content-Type': 'image/x-icon'})
				res.write(faviconData)
				res.end()
				return
			}

			errormsg('404', filePath, flags, error)
			errorPage(404, filePath, error)
			return
		}

		// Markdown: Browser is requesting a Markdown file
		if (isMarkdown) {
			msg('markdown', style.link(prettyPath), flags)
			getFile(filePath).then(markdownToHTML).then(filePath).then(html => {
				const contentPromise = flags.templates ?
					implant(html, implantHandlers, implantOpts) :
					Promise.resolve(html)

				return contentPromise.then(output => {
					const templateUrl = path.join(__dirname, 'templates/markdown.html')

					// Search scope: the page's directory ('' = the
					// root folder = the whole tree)
					const pagePath = getPathFromUrl(req.originalUrl)
					const pageDir = path.posix.dirname(pagePath || '.')
					const scopePath = (pageDir === '/' || pageDir === '.')
						? '' : pageDir.replace(/^\/+/, '')

					const handlebarData = {
						title: path.parse(filePath).base,
						content: output,
						pid: process.pid | 'N/A',
						theme,
						...themeFlags,
						hotreload: flags.$hotreload,
						wsPort: flags.$wsPort,
						rootDir: flags.dir,
						mermaidLoose: !!flags.mermaidLoose,
						pagePath,
						scopePath,
						noExports: flags.exports === false
					}

					return baseTemplate(templateUrl, handlebarData).then(final => {
						if (flags.templates) {
							const lvl2Dir = path.parse(templateUrl).dir
							const lvl2Opts = deepmerge(implantOpts, {baseDir: lvl2Dir})

							return implant(final, implantHandlers, lvl2Opts)
								.then(output => {
									res.writeHead(200, {
										'content-type': 'text/html'
									})
									res.end(output)
								})
						}

						res.writeHead(200, {
							'content-type': 'text/html'
						})
						res.end(final)
					})
				})
			}).catch(error => {
				console.error(error)
			})
		} else if (isHtml) {
			msg('html', style.link(prettyPath), flags)
			getFile(filePath).then(html => {
				const contentPromise = flags.templates ?
					implant(html, implantHandlers, implantOpts) :
					Promise.resolve(html)

				return contentPromise.then(output => {
					res.writeHead(200, {
						'content-type': 'text/html'
					})
					res.end(output)
				})
			}).catch(error => {
				console.error(error)
			})
		} else if (isDir) {
			try {
				// Index: Browser is requesting a Directory Index
				msg('dir', style.link(prettyPath), flags)

				const templateUrl = path.join(__dirname, 'templates/directory.html')

				const dirPagePath = getPathFromUrl(req.originalUrl)
				// Search scope: this directory itself ('' = root)
				const scopePath = dirPagePath.replace(/^\/+|\/+$/g, '')

				const handlebarData = {
					dirname: path.parse(filePath).dir,
					content: dirToHtml(filePath),
					title: path.parse(filePath).base,
					pid: process.pid | 'N/A',
					breadcrumbs: createBreadcrumbs(path.relative(dir, filePath)),
					theme,
					...themeFlags,
					hotreload: flags.$hotreload,
					wsPort: flags.$wsPort,
					rootDir: flags.dir,
					pagePath: dirPagePath.endsWith('/') ? dirPagePath : dirPagePath + '/',
					scopePath,
					noExports: flags.exports === false
				}

				return baseTemplate(templateUrl, handlebarData).then(final => {
					if (flags.templates) {
						const lvl2Dir = path.parse(templateUrl).dir
						const lvl2Opts = deepmerge(implantOpts, {baseDir: lvl2Dir})
						return implant(final, implantHandlers, lvl2Opts).then(output => {
							res.writeHead(200, {
								'content-type': 'text/html'
							})
							res.end(output)
						}).catch(error => {
							console.error(error)
						})
					}

					res.writeHead(200, {
						'content-type': 'text/html'
					})
					res.end(final)
				})
			} catch (error) {
				errorPage(500, filePath, error)
			}
		} else {
			// Other: Browser requests other MIME typed file (handled by 'send')
			msg('file', style.link(prettyPath), flags)
			send(req, filePath, {dotfiles: 'allow'}).pipe(res)
		}
	}
}

const startConnectApp = httpRequestHandler => {
	return connect()
		.use('/', httpRequestHandler)
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

// CollectWatchDirs: depth-first walk of root returning an array of
// absolute directory paths to watch: root itself plus every
// subdirectory at any depth. Directories whose name exactly matches
// an exclusion (fileTypes.exclusions) are pruned — neither returned
// nor descended into — so their subtrees never get a watcher.
// Symlinks are never followed (lstat), which prevents symlink loops
// and watching outside the tree.
const collectWatchDirs = root => {
	const dirs = []
	const excluded = new Set(fileTypes.exclusions)

	const walk = dir => {
		dirs.push(dir)

		let entries
		try {
			entries = fs.readdirSync(dir)
		} catch (_) {
			return
		}

		entries.forEach(entry => {
			let stat

			try {
				stat = fs.lstatSync(path.join(dir, entry))
			} catch (_) {
				return
			}

			// Symlinks are never followed; files are irrelevant
			if (stat.isSymbolicLink() || !stat.isDirectory()) {
				return
			}

			// Exact-name exclusions prune the whole subtree
			if (excluded.has(entry)) {
				return
			}

			walk(path.join(dir, entry))
		})
	}

	walk(path.resolve(root))
	return dirs
}

// Bind the ws server on a verified port. The port can be taken
// between getPort and listen (EADDRINUSE) — retry on a freshly
// verified port rather than crashing the process.
const bindWss = async (port, flags) => {
	for (let attempt = 0; attempt < 5; attempt++) {
		const wss = new WebSocket.Server({port})
		const bound = await new Promise(resolve => {
			const onError = error => {
				wss.close()
				resolve(error)
			}

			wss.once('listening', () => {
				wss.removeListener('error', onError)
				resolve(true)
			})

			wss.once('error', onError)
		})

		if (bound === true) {
			return wss
		}

			errormsg('hotreload', 'ws port ' + port, flags, bound)
		port = await getPort({port: port + 1})
	}

	throw new Error('could not bind a hot-reload ws port')
}

const startHotReload = async (wsPort, flags) => {
	let {dir} = flags
	const isDir = fs.statSync(dir).isDirectory()
	if (!isDir) {
		dir = path.parse(flags.dir).dir
	}

	const wss = await bindWss(wsPort, flags)
	// A retried bind may have landed on another port: keep
	// flags.$wsPort (and the ws:// banner) accurate.
	const boundPort = wss.address().port
	if (boundPort !== wsPort) {
		flags.$wsPort = boundPort
	}
	const clients = new Map()

	// A post-bind wss error must not crash the process: log it and
	// keep serving over HTTP without hot reload.
	wss.on('error', error => {
		errormsg('hotreload', 'ws port ' + boundPort, flags, error)
	})

	wss.on('connection', ws => {
		ws.on('message', data => {
			try {
				const msg_ = JSON.parse(data)
				if (msg_.path) {
					clients.set(ws, msg_.path)
				}
			} catch (_) {}
		})

		ws.on('close', () => {
			clients.delete(ws)
		})
	})

	const sendToClients = (sockets, content) => {
		for (const ws of sockets) {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(content)
			}
		}
	}

	// Debounced file watcher
	let debounceTimer
	const rootDir = path.resolve(dir)
	const watchDir = rootDir

	const handleChange = () => {
		// Group clients by path
		const pathClients = new Map()
		for (const [ws, clientPath] of clients) {
			if (ws.readyState !== WebSocket.OPEN) {
				continue
			}

			if (!pathClients.has(clientPath)) {
				pathClients.set(clientPath, [])
			}

			pathClients.get(clientPath).push(ws)
		}

		const implantOpts = {maxDepth: 10, confinementRoot: rootDir}

		const implantHandlers = {
			markserv: () => new Promise(resolve => {
				const value = path.relative(dir, __dirname)
				resolve(value)
			}),

			file: (url, opts) => new Promise(resolve => {
				if (typeof url !== 'string' || typeof opts.confinementRoot !== 'string') {
					return resolve(false)
				}

				const absUrl = path.join(opts.baseDir, url)
				if (!isWithinRoot(opts.confinementRoot, absUrl)) {
					// Implant file escapes the served root: refuse
					return resolve(false)
				}

				getFile(absUrl).then(data => resolve(data)).catch(() => resolve(false))
			}),

			less: (url, opts) => new Promise(resolve => {
				if (typeof url !== 'string' || typeof opts.confinementRoot !== 'string') {
					return resolve(false)
				}

				const absUrl = path.join(opts.baseDir, url)
				if (!isWithinRoot(opts.confinementRoot, absUrl)) {
					// Implant file escapes the served root: refuse
					return resolve(false)
				}

				buildLessStyleSheet(absUrl).then(data => resolve(data)).catch(() => resolve(false))
			}),

			markdown: (url, opts) => new Promise(resolve => {
				if (typeof url !== 'string' || typeof opts.confinementRoot !== 'string') {
					return resolve(false)
				}

				const absUrl = path.join(opts.baseDir, url)
				if (!isWithinRoot(opts.confinementRoot, absUrl)) {
					// Implant file escapes the served root: refuse
					return resolve(false)
				}

				getFile(absUrl).then(markdownToHTML).then(data => resolve(data)).catch(() => resolve(false))
			}),

			html: (url, opts) => new Promise(resolve => {
				if (typeof url !== 'string' || typeof opts.confinementRoot !== 'string') {
					return resolve(false)
				}

				const absUrl = path.join(opts.baseDir, url)
				if (!isWithinRoot(opts.confinementRoot, absUrl)) {
					// Implant file escapes the served root: refuse
					return resolve(false)
				}

				getFile(absUrl).then(data => resolve(data)).catch(() => resolve(false))
			})
		}

		for (const [clientPath, sockets] of pathClients) {
			const decodedUrl = getPathFromUrl(decodeURIComponent(clientPath))
			const filePath = path.normalize(unescape(dir) + unescape(decodedUrl))
			if (!isWithinRoot(rootDir, filePath)) {
				// Skip clients that registered a path outside the root
				continue
			}

			const baseDir = path.parse(filePath).dir
			implantOpts.baseDir = baseDir

			let stat
			let isDir_
			let isMarkdown

			try {
				stat = fs.statSync(filePath)
				isDir_ = stat.isDirectory()
				if (!isDir_) {
					isMarkdown = isType(fileTypes.markdown, filePath)
				}
			} catch (_) {
				continue
			}

			if (isMarkdown) {
				getFile(filePath)
					.then(markdownToHTML)
					.then(html => implant(html, implantHandlers, Object.assign({}, implantOpts, {baseDir})))
					.then(output => {
						sendToClients(sockets, output)
					})
					.catch(error => {
						errormsg('hotreload', filePath, flags, error)
					})
			} else if (isDir_) {
				try {
					const content = dirToHtml(filePath)
					const breadcrumbHtml = createBreadcrumbs(path.relative(dir, filePath))
					let headerHtml = '<h1 class="icon folder isfolder">'
					for (const crumb of breadcrumbHtml) {
						headerHtml += `<a href="${crumb.href}">${crumb.text}</a>`
					}

					headerHtml += '</h1>\n'
					const fullContent = headerHtml + content +
						'<footer><sup><hr> Served by <a href="https://www.npmjs.com/package/markserv">MarkServ</a> | PID: ' + (process.pid || 'N/A') + '</sup></footer>'

					sendToClients(sockets, fullContent)
				} catch (error) {
					errormsg('hotreload', filePath, flags, error)
				}
			}
		}
	}

	// Bounded per-directory watchers: one non-recursive fs.watch per
	// collected directory (uniform on all platforms — older Node has
	// no recursive mode on Linux, and newer Node's internal recursive
	// walk would subscribe every subdirectory, excluded ones
	// included). Handles are tracked so shutdown can close them.
	const watchHandles = new Map()

	const attachWatch = (dirPath, handle) => {
		handle.on('error', error => {
			// A removed or inaccessible directory must never crash the
			// server: drop the handle and keep serving
			watchHandles.delete(dirPath)
			errormsg('watch', dirPath, flags, error)
		})

		watchHandles.set(dirPath, handle)
	}

	const onDirChange = dirPath => (eventType, filename) => {
		if (!filename) {
			return
		}

		// Lazy add: Node reports a new directory as rename (both
		// darwin and linux); give it its own watcher unless its name
		// is an exclusion
		if (eventType === 'rename' && !fileTypes.exclusions.includes(filename)) {
			const fullPath = path.join(dirPath, filename)

			try {
				if (fs.statSync(fullPath).isDirectory() &&
					!watchHandles.has(fullPath)) {
					attachWatch(fullPath, fs.watch(fullPath, onDirChange(fullPath)))
				}
			} catch (_) {}
		}

		// Check exclusions
		for (const exclusion of fileTypes.exclusions) {
			if (filename.includes(exclusion.replace(/\/$/, ''))) {
				return
			}
		}

		// Check if file extension is watched
		const ext = path.extname(filename)
		if (ext && !fileTypes.watch.includes(ext)) {
			return
		}

		// Keep the search index fresh for markdown files (single-file
		// re-render + transitive implant dependents; runs alongside
		// the debounced handleChange)
		if (flags.$searchIndex && fileTypes.markdown.includes(ext)) {
			searchLib.invalidate(flags.$searchIndex, path.join(dirPath, filename))
				.catch(error => {
					warnmsg('search', 'invalidate ' + filename, flags, error)
				})
		}

		clearTimeout(debounceTimer)
		debounceTimer = setTimeout(handleChange, 150)
	}

	// Initial bounded set: one handle per collected directory
	for (const dirPath of collectWatchDirs(watchDir)) {
		try {
			attachWatch(dirPath, fs.watch(dirPath, onDirChange(dirPath)))
		} catch (error) {
			errormsg('watch', dirPath, flags, error)
		}
	}

	// Expose the handle map and a close path: FSWatcher has no
	// public closed state, so the close path marks each handle it
	// stops. Hooking wss 'close' keeps shutdown (hotReloadServer.
	// close()) from leaking watchers.
	wss.watchHandles = watchHandles
	wss.closeWatchHandles = () => {
		for (const handle of watchHandles.values()) {
			if (!handle.closed) {
				handle.closed = true

				try {
					handle.close()
				} catch (_) {}
			}
		}
	}

	wss.on('close', () => {
		wss.closeWatchHandles()
	})

	return wss
}

const logActiveServerInfo = async (serveURL, httpPort, wsPort, flags) => {
	const dir = path.resolve(flags.dir)

	const githubLink = 'github.com/markserv'

	msg('address', style.address(serveURL), flags)
	msg('path', chalk`{grey ${style.address(dir)}}`, flags)

	if (wsPort) {
		msg('hotreload', chalk`{grey ws://localhost:${style.port(wsPort)}}`, flags)
	}

	if (process.pid) {
		msg('process', chalk`{grey your pid is: ${style.pid(process.pid)}}`, flags)
		msg('stop', chalk`{grey press {magenta [Ctrl + C]} or type {magenta "sudo kill -9 ${process.pid}"}}`, flags)
	}

	msg('github', chalk`Contribute on Github - {yellow.underline ${githubLink}}`, flags)
}

const REGISTRY_URL = 'https://registry.npmjs.org/markserv'

// Fetch a JSON document from the npm registry — the only network
// dependency of the upgrade prompt. Failures are not fatal: they simply
// mean no upgrade prompt (this request doubles as the connectivity
// probe, so the previous is-online gate is no longer needed).
const fetchRegistryJson = (url, timeout) => new Promise((resolve, reject) => {
	const req = https.get(url, {timeout}, res => {
		let data = ''
		res.on('data', chunk => {
			data += chunk
		})
		res.on('end', () => {
			try {
				resolve(JSON.parse(data))
			} catch (error) {
				reject(error)
			}
		})
	})
	req.on('timeout', () => {
		req.destroy(new Error('registry timeout'))
	})
	req.on('error', reject)
})

// Numeric compare of the first three x.y.z components; the registry
// 'latest' dist-tag always resolves to a clean release version.
const isNewerVersion = (candidate, current) => {
	const parts = version => version.split('.').map(Number)
	const a = parts(candidate)
	const b = parts(current)
	for (let i = 0; i < 3; i++) {
		if ((a[i] || 0) > (b[i] || 0)) {
			return true
		}
		if ((a[i] || 0) < (b[i] || 0)) {
			return false
		}
	}
	return false
}

const checkForUpgrade = () => new Promise(resolve => {
	fetchRegistryJson(REGISTRY_URL + '/latest', 5000)
		.then(latest => {
			resolve(latest && latest.version &&
				isNewerVersion(latest.version, pkg.version) ?
				latest.version :
				false)
		})
		.catch(error => {
			resolve(false)
		})
})

const doUpgrade = (newerVersion, flags) => {
	const {spawn} = require('child_process')

	msg(chalk.bgRed('✨UPGRADE✨'), 'Upgrade beginning...', flags)
	const ls = spawn('npm', ['i', '-g', `markserv@${newerVersion}`], {stdio: [0, 1, 2]})

	ls.on('exit', code => {
		if (code) {
			return msg(chalk.bgRed('✨UPGRADE✨'), 'Markserv could not upgrade.', flags)
		}

		msg(chalk.bgRed('✨UPGRADE✨'), 'Upgrade finished!', flags)
	})
}

const optionalUpgrade = async flags => {
	if (flags.silent) {
		return
	}

	msg('upgrade', 'checking for upgrade...', flags)

	return checkForUpgrade(flags).then(async version => {
		if (version === false) {
			msg('upgrade', 'no upgrade available', flags)
			return
		}

		msg(chalk.bgRed('✨UPGRADE✨'), `Markserv version: ${version} is available!`, flags)

		const logInstallNotes = () => {
			msg(chalk.bgRed('✨UPGRADE✨'), 'Upgrade cancelled. To upgrade manually:', flags)
			msg(chalk.bgRed('✨UPGRADE✨'), chalk`{bgYellow.black.bold  npm i -g markserv@${version} }`, flags)
			msg(chalk.bgRed('✨UPGRADE✨'), chalk`{bgYellow.black.bold  yarn global add markserv@${version} }`, flags)
		}

		const choice = await promptly.choose(chalk`{bgGreen.black   Markserv  } {bgRed ✨UPGRADE✨}: Do you want to upgrade automatically? (y/n)`, ['y', 'n'])

		if (choice === 'y') {
			return doUpgrade(version, flags)
		}

		logInstallNotes()
	}).catch(error => {
		console.error(error)
	})
}

const init = async flags => {
	const preferredPort = Number(flags.port) || 8642
	const httpPort = flags.port ? preferredPort : await getPort({port: preferredPort})

	let wsPort = null
	const hotreloadEnabled = flags.hotreload !== false && flags.hotreload !== 'false'
	if (hotreloadEnabled) {
		wsPort = await getPort({port: httpPort + 1})
	}

	flags.$wsPort = wsPort
	flags.$hotreload = hotreloadEnabled

	const httpRequestHandler = await createRequestHandler(flags)
	const connectApp = startConnectApp(httpRequestHandler)
	const httpServer = await startHTTPServer(connectApp, httpPort, flags)

	let hotReloadServer
	if (hotreloadEnabled) {
		hotReloadServer = await startHotReload(wsPort, flags)
	}

	const serveURL = 'http://' + flags.address + ':' + httpPort

	// Log server info to CLI
	logActiveServerInfo(serveURL, httpPort, flags.$wsPort, flags)

	let launchUrl = false
	if (flags.$openLocation || flags.$pathProvided) {
		launchUrl = serveURL + '/' + flags.$openLocation
	}

	const service = {
		pid: process.pid,
		httpServer,
		hotReloadServer,
		// Additional field: the hot-reload watcher handle map (null
		// when hot reload is disabled) so callers can audit and
		// close it. Existing callers close hotReloadServer / httpServer
		// individually and are unaffected.
		watchHandles: hotReloadServer ? hotReloadServer.watchHandles : null,
		connectApp,
		launchUrl
	}

	const launchBrowser = () => {
		if (flags.browser === false ||
			flags.browser === 'false') {
			return
		}

		if (launchUrl) {
			opn(launchUrl)
		}
	}

	// The registry fetch inside checkForUpgrade doubles as the
	// connectivity probe; offline simply yields no prompt.
	optionalUpgrade(flags)

	launchBrowser()

	return service
}

// exportSite: the CLI export path — renders a directory to a
// static site bundle without any serving (no HTTP server, ws, or
// watcher; flags are forced accordingly). --no-exports does not
// affect this: a local file operation, not an endpoint. target is
// an output directory (the bundle unpacked; a pre-existing
// non-empty directory aborts — no silent clobber; an empty
// existing directory proceeds) or a .zip path.
const exportSite = async (flags, target) => {
	const rootDir = path.resolve(flags.dir)

	let stat
	try {
		stat = fs.statSync(rootDir)
	} catch (error) {
		throw new Error('export: ' + flags.dir + ' does not exist')
	}

	if (!stat.isDirectory()) {
		throw new Error('export: ' + flags.dir + ' is not a directory')
	}

	// Offline: no hot reload, no browser launch
	flags.hotreload = false
	flags.browser = false

	// One shared code path with the request handler
	const {renderStandalonePage} = await makeRenderPipeline(flags, rootDir)
	const {entries} = await siteExportLib.buildSite(rootDir, {
		exclusions: fileTypes.exclusions,
		markdownExts: fileTypes.markdown,
		listFiles: searchLib.listFiles,
		renderPage: abs => renderStandalonePage(abs, {docMdSet: null})
	})

	const targetPath = path.resolve(target)
	const toBuffer = content =>
		Buffer.isBuffer(content) ? content : Buffer.from(content)

	if (/\.zip$/i.test(targetPath)) {
		fs.mkdirSync(path.dirname(targetPath), {recursive: true})

		await new Promise((resolve, reject) => {
			const output = fs.createWriteStream(targetPath)
			const archive = require('archiver')('zip', {zlib: {level: 9}})
			archive.on('error', reject)
			output.on('error', reject)
			output.on('close', resolve)
			archive.pipe(output)

			entries.forEach(({name, content}) => {
				archive.append(toBuffer(content), {name})
			})

			archive.finalize()
		})
	} else {
		if (fs.existsSync(targetPath)) {
			if (!fs.statSync(targetPath).isDirectory()) {
				throw new Error('export: target ' + targetPath +
					' is not a directory')
			}

			// A pre-existing non-empty target directory aborts —
			// no silent clobber; an empty one proceeds
			if (fs.readdirSync(targetPath).length > 0) {
				throw new Error('export: target directory ' +
					targetPath + ' is not empty')
			}
		}

		fs.mkdirSync(targetPath, {recursive: true})
		for (const {name, content} of entries) {
			const dest = path.join(targetPath, name)
			fs.mkdirSync(path.dirname(dest), {recursive: true})
			fs.writeFileSync(dest, toBuffer(content))
		}
	}

	const files = searchLib.listFiles(rootDir, {exclusions: fileTypes.exclusions})
	const isMd = abs => fileTypes.markdown.includes(path.parse(abs).ext)
	const pages = files.filter(f => isMd(f.abs)).length

	msg('export', pages + ' pages, ' + (files.length - pages) +
		' assets → ' + targetPath, flags)

	return {pages, assets: files.length - pages, target: targetPath}
}

module.exports = {
	getFile,
	markdownToHTML,
	init,
	// The CLI export path (lib/cli.js) — offline, no serving
	exportSite,
	// Internal API, exported for tests (tests/hot-reload-watch.test.js)
	collectWatchDirs
}
