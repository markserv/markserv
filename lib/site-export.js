'use strict'

const fs = require('fs')
const path = require('path')

// Site export — renders a directory tree into a browsable static
// bundle: every markdown file becomes a rendered standalone page
// (via the provided renderPage), non-markdown files are copied
// verbatim (so relative asset references resolve as-is), and
// relative markdown links are rewritten to the bundle's .html
// names. README.md at the bundle root is promoted to index.html
// (a raw index.html, if present, wins).
//
// Pure module: no require('./server') (same circular-require rule
// as search.js) — renderPage and listFiles arrive as parameters.

// rewriteLinks: rewrite <a href> targets that point at markdown
// files inside the bundle to their .html names. Skipped: hrefs with
// a scheme (http:, https:, mailto: ...), same-page anchors (#),
// absolute paths (/), and targets that do not resolve to a bundle
// member (a missing.md link stays missing.md, not a dead
// missing.html). Fragments are preserved (b.md#sec → b.html#sec).
// <img src> targets keep their file names (assets are bundled
// verbatim).
const rewriteLinks = (html, {currentDir, bundleMdSet}) => {
	return html.replace(/(<a\s[^>]*?href=")([^"]+)(")/g, (whole, pre, href, post) => {
		if (/^([a-z][a-z0-9+.-]*:)/i.test(href)) {
			return whole
		}

		if (href.startsWith('#') || href.startsWith('/')) {
			return whole
		}

		const hashIdx = href.indexOf('#')
		const relPart = hashIdx === -1 ? href : href.slice(0, hashIdx)
		const fragment = hashIdx === -1 ? '' : href.slice(hashIdx)
		if (relPart === '') {
			return whole
		}

		let resolved
		try {
			resolved = path.normalize(path.join(currentDir || '.', relPart))
		} catch (_) {
			return whole
		}

		resolved = resolved.split(path.sep).join('/')
		// path.normalize collapses .. segments — anything that
		// still escapes the bundle root can't be a member
		if (resolved.startsWith('..')) {
			return whole
		}

		if (!bundleMdSet.has(resolved)) {
			return whole
		}

		return pre + resolved.replace(/\.[^.]+$/, '.html') + fragment + post
	})
}

// buildSite: walk dirPath (walk rules = the shared listFiles: dot-
// pruned, exclusion-pruned, no symlinks) and produce the bundle.
// Returns {entries: [{name, content: (Buffer | string)}],
// warnings: string[]}. Rendered markdown pages are link-rewritten
// against the bundle's markdown member set; name collisions (a
// rendered page name taken by another bundle member) fall back to
// <rel>.html with a warning.
const buildSite = async (dirPath, {
	exclusions,
	markdownExts,
	listFiles,
	renderPage
}) => {
	const root = path.resolve(dirPath)
	const files = listFiles(root, {exclusions})

	const isMd = abs => markdownExts.includes(path.parse(abs).ext)

	// Bundle markdown members (slash rels) — the link-rewrite set
	const bundleMdSet = new Set()
	files.forEach(f => {
		if (isMd(f.abs)) {
			bundleMdSet.add(f.rel)
		}
	})

	const warnings = []
	const entries = []
	const usedNames = new Set()

	// Verbatim names are reserved first so rendered pages can never
	// silently clobber an existing file in the bundle
	for (const f of files) {
		if (!isMd(f.abs)) {
			usedNames.add(f.rel)
		}
	}
	let readmeContent = null

	// Rendered markdown pages (walk order — deterministic)
	for (const f of files) {
		if (!isMd(f.abs)) {
			continue
		}

		const html = await renderPage(f.abs)
		let name = f.rel.replace(/\.[^.]+$/, '.html')

		// Name collision (another bundle member already has this
		// name) → <rel>.html, same convention format=html uses
		// for its download filename
		if (usedNames.has(name)) {
			warnings.push('name collision: ' + f.rel +
				' rendered page kept as ' + f.rel + '.html')
			name = f.rel + '.html'
		}

		usedNames.add(name)
		const rewritten = rewriteLinks(html, {
			currentDir: path.posix.dirname(f.rel),
			bundleMdSet
		})

		entries.push({name, content: rewritten})

		// README at the bundle root (its rewritten render is the
		// index.html content)
		if (f.rel === 'README.md' || f.rel.toLowerCase() === 'readme.md') {
			readmeContent = rewritten
		}
	}

	// README promotion: README.md at the bundle root → index.html.
	// A raw index.html already in the bundle wins (the README is
	// still available as its own .html page).
	const hasRawIndex = files.some(f => f.rel === 'index.html')
	if (readmeContent !== null && !hasRawIndex) {
		entries.push({name: 'index.html', content: readmeContent})
	}

	// Verbatim non-markdown files (assets resolve relatively)
	for (const f of files) {
		if (isMd(f.abs)) {
			continue
		}

		entries.push({name: f.rel, content: fs.readFileSync(f.abs)})
	}

	return {entries, warnings}
}

module.exports = {
	rewriteLinks,
	buildSite
}
