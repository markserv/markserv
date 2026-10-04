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
//
// Output form: by default the rewritten href is the bundle-root-
// relative name (the site export's established behavior). With
// pageRelative (the single-page export path) the rewritten href is
// relative to the page's own directory — the reader opens the page
// from wherever it ships, so the link must be page-relative.
const rewriteLinks = (html, {currentDir, bundleMdSet, pageRelative = false}) => {
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

		const out = pageRelative ?
			path.relative(currentDir || '.', resolved) :
			resolved
		return pre + out.replace(/\.[^.]+$/, '.html') + fragment + post
	})
}

// buildSite: walk dirPath (walk rules = the shared listFiles: dot-
// pruned, exclusion-pruned, no symlinks) and produce the static
// bundle. Membership is what a static host actually needs — and
// nothing else a visitor would load: every markdown file becomes a
// rendered standalone page (via the provided renderPage, document
// links rewritten PAGE-RELATIVE to the bundle's .html names so
// nested pages' links resolve), and a non-markdown file ships iff
// a rendered page references it (or is the raw index.html entry).
// Unreferenced files — LICENSE, package.json, source code, … — stay
// out of the bundle. Name collisions (a rendered page name taken
// by a shipping bundle member) fall back to <rel>.html with a
// warning. Returns {entries: [{name, content: (Buffer | string)}],
// warnings: string[], pages: number, assets: number}.
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
	const usedNames = new Set()

	// Pass 1: render every markdown page (walk order —
	// deterministic), rewrite document links, and collect the asset
	// references that define the verbatim members of the bundle.
	const rendered = []
	const referenced = new Set()
	for (const f of files) {
		if (!isMd(f.abs)) {
			continue
		}

		const html = await renderPage(f.abs)
		const {assets} = collectAssets(html, {
			pageDir: path.parse(f.abs).dir,
			rootDir: root,
			markdownExts
		})
		assets.forEach(a => {
			referenced.add(path.relative(root, a.abs).split(path.sep).join('/'))
		})

		rendered.push({
			rel: f.rel,
			rewritten: rewriteLinks(html, {
				currentDir: path.posix.dirname(f.rel),
				bundleMdSet,
				// Page-relative: a nested page's links must resolve
				// from that page's location in the bundle
				pageRelative: true
			})
		})
	}

	// Verbatim shipping rule: a raw index.html is the bundle's entry
	// (always ships); any other non-markdown file ships iff a
	// rendered page references it. Names are reserved first so a
	// rendered page can never silently clobber a shipping file.
	const ships = f => !isMd(f.abs) &&
		(f.rel === 'index.html' || referenced.has(f.rel))
	files.forEach(f => {
		if (ships(f)) {
			usedNames.add(f.rel)
		}
	})

	// Pass 2: assign names (collision fallback) + README promotion
	const entries = []
	let readmeContent = null
	for (const {rel, rewritten} of rendered) {
		let name = rel.replace(/\.[^.]+$/, '.html')

		// Name collision (another shipping member already has this
		// name) → <rel>.html, same convention format=html uses
		// for its download filename
		if (usedNames.has(name)) {
			warnings.push('name collision: ' + rel +
				' rendered page kept as ' + rel + '.html')
			name = rel + '.html'
		}

		usedNames.add(name)
		entries.push({name, content: rewritten})

		// README at the bundle root (its rewritten render is the
		// index.html content)
		if (rel === 'README.md' || rel.toLowerCase() === 'readme.md') {
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

	// Pass 3: verbatim referenced assets (+ the raw index.html entry)
	for (const f of files) {
		if (!ships(f)) {
			continue
		}

		entries.push({name: f.rel, content: fs.readFileSync(f.abs)})
	}

	return {
		entries,
		warnings,
		pages: rendered.length,
		assets: files.filter(ships).length
	}
}

// inlineMarkservAssets: inlines the {markserv} template stylesheets
// into the final standalone HTML (single-page and site exports alike).
// Every <link rel="stylesheet" href="{markserv}templates/<name>"> is
// replaced in place by a <style> element carrying the link's
// id/disabled attributes when present (the four theme links have
// both — the kept theme toggle switches theme by toggling `disabled`,
// which is valid on <style>, so no client change is needed); content
// is read from the package's templates directory per page (the files
// are small; no cache). The MathJax CDN <script> and the mermaid
// lazy-loader <script> stay as-is (MathJax needs the network; a
// mermaid fence degrades to its source text because /vendor/mermaid/
// only resolves on a live markserv instance). The transform matches
// <link> tag forms only — page text quoting the {markserv}templates/
// string is untouched.
const inlineMarkservAssets = html => {
	return html.replace(/<link\b[^>]*>/gi, tag => {
		if (!/rel="stylesheet"/.test(tag)) {
			return tag
		}

		const href = tag.match(/href="\{markserv\}templates\/([A-Za-z0-9._-]+)"/)
		if (!href) {
			return tag
		}

		let css
		try {
			css = fs.readFileSync(path.join(__dirname, 'templates', href[1]), 'utf8')
		} catch (_) {
			// Unknown file: leave the link as-is
			return tag
		}

		let attrs = ''
		const id = tag.match(/\bid="([^"]*)"/)
		if (id) {
			attrs += ' id="' + id[1] + '"'
		}

		if (/\bdisabled\b/.test(tag)) {
			attrs += ' disabled'
		}

		return '<style' + attrs + '>' + css + '</style>'
	})
}

// collectAssets: discover the relative assets a rendered page
// references — src="…" on <img|video|audio|source|script> and
// href="…" on <a>|<link> — from the page's implanted content
// (post-implant, pre-template-wrap, so implanted content's assets
// count and template/CSS chrome cannot leak in). A reference is
// included iff: no URL scheme (which also excludes data:), does not
// start with # or /, is not a markdown extension (documents are
// links, not assets — they get the .html rewrite instead), resolves
// inside the served root, and exists as a regular file. Everything
// else is skipped (with a reason). rel is relative to the page's
// directory — .. segments are allowed at this stage; the caller's
// LCA layout normalizes them.
const collectAssets = (html, {pageDir, rootDir, markdownExts = []}) => {
	const assets = []
	const skipped = []
	const seen = new Set()
	const refRe = /<(?:img|video|audio|source|script)\b[^>]*?\bsrc="([^"]*)"|<(?:a|link)\b[^>]*?\bhref="([^"]*)"/gi

	const root = path.resolve(rootDir)
	let m
	while ((m = refRe.exec(html)) !== null) {
		const ref = m[1] !== undefined ? m[1] : m[2]
		if (ref === '' || seen.has(ref)) {
			continue
		}

		seen.add(ref)

		// URL scheme (http:, https:, mailto:, data: …) — not ours
		if (/^([a-z][a-z0-9+.-]*:)/i.test(ref)) {
			skipped.push({ref, reason: 'scheme'})
			continue
		}

		if (ref.startsWith('#')) {
			skipped.push({ref, reason: 'anchor'})
			continue
		}

		if (ref.startsWith('/')) {
			skipped.push({ref, reason: 'absolute'})
			continue
		}

		// Documents are links, not assets
		const filePart = ref.split('#')[0]
		if (markdownExts.includes(path.parse(filePart).ext)) {
			skipped.push({ref, reason: 'document'})
			continue
		}

		const abs = path.normalize(path.join(pageDir, filePart))
		const resolved = path.resolve(abs)
		if (resolved !== root && !resolved.startsWith(root + path.sep)) {
			skipped.push({ref, reason: 'out-of-root'})
			continue
		}

		let stat
		try {
			stat = fs.statSync(abs)
		} catch (_) {
			skipped.push({ref, reason: 'missing'})
			continue
		}

		if (!stat.isFile()) {
			skipped.push({ref, reason: 'not-a-file'})
			continue
		}

		assets.push({
			abs,
			rel: path.relative(pageDir, abs).split(path.sep).join('/')
		})
	}

	return {assets, skipped}
}

module.exports = {
	rewriteLinks,
	buildSite,
	inlineMarkservAssets,
	collectAssets
}
