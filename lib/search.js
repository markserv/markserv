'use strict'

const fs = require('fs')
const path = require('path')

// Markserv search index — an in-memory inverted-substring index over
// the markdown files under a served root, plus the per-page render
// cache shared by search, format=html, and site export.
//
// Pure Node module, deliberately with NO require of './server'
// (server.js requires this one for the /__markserv/search subroute; a
// circular require would hand us a partially initialised module).
// Collaborators — the slugify function, the exclusion list, the
// markdown extension list, and (in templates mode) the content
// renderer — arrive as buildIndex() parameters, so anchors match
// markdown-it-anchor exactly (server.js's slugify) and nothing is
// duplicated.
//
// Walk rules (shared with the zip export via listFiles): dot entries
// are pruned at every level — hidden things are invisible in the
// directory listings, so they are invisible to search too;
// directories whose name exactly matches an exclusion are pruned
// with their subtree; symlinks are never followed (no loops, no
// escapes). readdir results are sorted so the walk — and the index —
// is deterministic.
//
// Render cache: each entry may hold contentHtml (the implanted
// markdown→HTML body — the expensive part, rendered once per file
// per change) and deps (the files the page implants). The index
// holds reverseDeps (dependee → dependents) so invalidate() can
// re-render transitive dependents when an implanted file changes.
// The standalone page HTML is NOT cached — it is contentHtml wrapped
// in the standalone template (cheap; theme/flags are fixed per
// server instance).

const DEFAULT_MAX_FILE_SIZE = 1000000

// listFiles: shared walk. Returns [{abs, rel}] for every regular file
// under rootDir (rel is slash-separated, no leading slash). No
// extension or size filtering — callers apply their own.
const listFiles = (rootDir, {exclusions = []} = {}) => {
	const root = path.resolve(rootDir)
	const excluded = new Set(exclusions)
	const files = []

	const walk = dir => {
		let entries
		try {
			entries = fs.readdirSync(dir, {withFileTypes: true})
		} catch (_) {
			return
		}

		// Deterministic order
		entries.sort((a, b) => a.name.localeCompare(b.name))

		entries.forEach(entry => {
			// Dot entries: pruned at every level (files and dirs)
			if (entry.name.charAt(0) === '.') {
				return
			}

			// Symlinks are never followed
			if (entry.isSymbolicLink()) {
				return
			}

			const abs = path.join(dir, entry.name)

			if (entry.isDirectory()) {
				// Exact-name exclusions prune the whole subtree
				if (excluded.has(entry.name)) {
					return
				}

				walk(abs)
				return
			}

			if (!entry.isFile()) {
				return
			}

			files.push({
				abs,
				rel: path.relative(root, abs).split(path.sep).join('/')
			})
		})
	}

	walk(root)
	return files
}

// stripTags: search-text derivation — tags out, text in. v1
// limitation: HTML entities are NOT decoded (documented).
const stripTags = html => html.replace(/<[^>]+>/g, '')

// extract: derive the indexed fields from a markdown file's text.
// title: the first H1 line (a single '#'), else the basename.
// headings: every heading line → {slug, text} — the caller's slugify
// guarantees the anchors match the rendered heading ids.
// Inline code-fence false positives are a known v1 limitation.
const extract = (text, baseName, slugify) => {
	const titleMatch = text.match(/^#\s+(.*)$/m)
	const title = (titleMatch && titleMatch[1].trim()) ||
		path.parse(baseName).name

	const headings = []
	const headingRe = /^(#{1,6})\s+(.*)$/gm
	let m
	while ((m = headingRe.exec(text)) !== null) {
		const headingText = m[2].trim()
		headings.push({
			slug: slugify(headingText),
			text: headingText
		})
	}

	return {title, headings}
}

// relOf: root-relative slash path for an abs path, or null when the
// path is outside the index root.
const relOf = (index, absPath) => {
	const rel = path.relative(index.rootDir, path.resolve(absPath))
		.split(path.sep).join('/')
	if (rel.startsWith('..') || path.isAbsolute(rel)) {
		return null
	}

	return rel
}

// rebuildReverseDeps: dependee → dependents, from every entry's deps.
// Rebuilt (not incrementally maintained) at each change — entries are
// small and this stays correct by construction.
const rebuildReverseDeps = index => {
	const reverseDeps = new Map()

	for (const [rel, entry] of index.entries) {
		for (const dep of entry.deps) {
			if (!reverseDeps.has(dep)) {
				reverseDeps.set(dep, new Set())
			}

			reverseDeps.get(dep).add(rel)
		}
	}

	index.reverseDeps = reverseDeps
}

// buildIndex: walk the root and index every markdown file
// (markdownExts) at most maxFileSize bytes. With a render callback
// (templates mode) each file's contentHtml is the implanted body and
// text is its tag-stripped form — search matches what the page
// shows. Returns {rootDir, entries, reverseDeps, options}.
const buildIndex = async (rootDir, {
	exclusions = [],
	slugify,
	markdownExts = [],
	maxFileSize = DEFAULT_MAX_FILE_SIZE,
	render = null
}) => {
	const entries = new Map()
	const index = {
		rootDir: path.resolve(rootDir),
		entries,
		reverseDeps: new Map(),
		options: {exclusions, slugify, markdownExts, maxFileSize, render}
	}

	for (const {abs, rel} of listFiles(rootDir, {exclusions})) {
		if (!markdownExts.includes(path.parse(abs).ext)) {
			continue
		}

		let stat
		try {
			stat = fs.statSync(abs)
		} catch (_) {
			continue
		}

		if (stat.size > maxFileSize) {
			continue
		}

		let raw
		try {
			raw = fs.readFileSync(abs, 'utf8')
		} catch (_) {
			continue
		}

		// title/headings always come from the raw source (anchors
		// must match the rendered heading ids)
		const {title, headings} = extract(raw, path.parse(abs).base, slugify)

		let contentHtml = null
		let deps = new Set()
		if (render) {
			const result = await render(abs)
			contentHtml = result.contentHtml
			deps = result.deps || new Set()
		}

		entries.set(rel, {
			title,
			headings,
			// raw mode: text IS the raw source (today's behavior);
			// templates mode: the stripped rendered body
			text: render ? stripTags(contentHtml) : raw,
			size: stat.size,
			mtimeMs: stat.mtimeMs,
			contentHtml,
			deps
		})
	}

	rebuildReverseDeps(index)
	return index
}

// search: case-insensitive substring search across the indexed files.
// score = body occurrence count + 10 per matched heading (a heading
// matches when the query equals its slug or is a substring of its
// text; anchor = first matching slug). Snippet = up to 120 chars of
// the first matching line, centred on the match, with ellipses where
// truncated; when only a heading matched the snippet is that
// heading's text. Sorted score desc, then path asc; capped by limit
// (clamped 1..100).
//
// path (scope): optional subtree prefix. empty/'all' → whole tree;
// a '..' segment → no match (the index only holds root-relative keys,
// so nothing can escape); an exact file key → that single entry;
// otherwise a directory prefix match.
const search = (index, query, {limit = 50, path: scope} = {}) => {
	const q = String(query == null ? '' : query).trim().toLowerCase()
	if (!q) {
		return []
	}

	const lim = Math.max(1, Math.min(100, limit))

	let scopeNorm = ''
	if (scope != null) {
		scopeNorm = String(scope).trim()
		if (scopeNorm.startsWith('/')) {
			scopeNorm = scopeNorm.slice(1)
		}

		scopeNorm = scopeNorm.replace(/\/+$/, '')
	}

	const scopeInvalid = scopeNorm !== '' &&
		scopeNorm !== 'all' &&
		scopeNorm.split('/').includes('..')

	const scopeIsFile = scopeNorm !== '' &&
		scopeNorm !== 'all' &&
		!scopeInvalid &&
		index.entries.has(scopeNorm)

	const inScope = rel => {
		if (!scopeNorm || scopeNorm === 'all') {
			return true
		}

		if (scopeInvalid) {
			return false
		}

		if (scopeIsFile) {
			return rel === scopeNorm
		}

		return rel === scopeNorm || rel.startsWith(scopeNorm + '/')
	}

	const results = []

	for (const [rel, entry] of index.entries) {
		if (!inScope(rel)) {
			continue
		}

		let bodyScore = 0
		let snippet = null

		// Line-based: keeps raw/upper-lower offsets simple and
		// bounds the per-line work
		for (const line of entry.text.split('\n')) {
			const lineLower = line.toLowerCase()
			let idx = lineLower.indexOf(q)
			if (idx === -1) {
				continue
			}

			while (idx !== -1) {
				bodyScore += 1
				idx = lineLower.indexOf(q, idx + q.length)
			}

			if (snippet === null) {
				const local = lineLower.indexOf(q)
				const start = Math.max(0, local - 60)
				const end = Math.min(line.length, local + q.length + 60)
				snippet = (start > 0 ? '…' : '') +
					line.slice(start, end) +
					(end < line.length ? '…' : '')
			}
		}

		let anchor = null
		let headingScore = 0
		for (const h of entry.headings) {
			if (h.slug === q || h.text.toLowerCase().includes(q)) {
				headingScore += 10
				if (anchor === null) {
					anchor = h.slug
				}
			}
		}

		const score = bodyScore + headingScore
		if (score === 0) {
			continue
		}

		if (snippet === null) {
			// Only a heading matched: the snippet is that heading
			const heading = entry.headings.find(h => h.slug === anchor)
			snippet = heading ? heading.text : ''
		}

		results.push({
			path: rel,
			title: entry.title,
			snippet,
			anchor,
			score
		})
	}

	results.sort((a, b) => {
		if (b.score !== a.score) {
			return b.score - a.score
		}

		return a.path.localeCompare(b.path)
	})

	return results.slice(0, lim)
}

// renderFromIndex: the single cache-lookup primitive. Returns the
// cached contentHtml when the entry is present and the file's
// current mtime/size match the entry's, else null.
const renderFromIndex = (index, absPath) => {
	const rel = relOf(index, absPath)
	if (rel === null) {
		return null
	}

	const entry = index.entries.get(rel)
	if (!entry || entry.contentHtml === null) {
		return null
	}

	let stat
	try {
		stat = fs.statSync(path.resolve(absPath))
	} catch (_) {
		return null
	}

	if (stat.mtimeMs !== entry.mtimeMs || stat.size !== entry.size) {
		return null
	}

	return entry.contentHtml
}

// storeContent: upsert a file's cached render (contentHtml + deps +
// stripped text + mtime/size) and refresh reverseDeps. Only files
// that meet the index's inclusion rules (markdownExts + maxFileSize)
// are stored: a > 1 MB export renders fine but is never cached, so it
// can't pollute the search index.
const storeContent = (index, absPath, {contentHtml, deps}) => {
	const abs = path.resolve(absPath)
	if (!index.options.markdownExts.includes(path.parse(abs).ext)) {
		return
	}

	let stat
	try {
		stat = fs.statSync(abs)
	} catch (_) {
		return
	}

	if (!stat.isFile() || stat.size > index.options.maxFileSize) {
		return
	}

	const rel = relOf(index, abs)
	if (rel === null) {
		return
	}

	// Raw source is needed for title/headings (and, in raw mode, as
	// the search text)
	let raw
	try {
		raw = fs.readFileSync(abs, 'utf8')
	} catch (_) {
		return
	}

	const {title, headings} = extract(raw, path.parse(abs).base, index.options.slugify)
	const entry = index.entries.get(rel) || {
		title,
		headings,
		text: raw,
		size: 0,
		mtimeMs: 0,
		contentHtml: null,
		deps: new Set()
	}

	entry.contentHtml = contentHtml
	entry.deps = deps || new Set()

	// raw mode (no render callback): text stays the raw source;
	// templates mode: the stripped rendered body
	if (index.options.render) {
		entry.text = stripTags(contentHtml)
	} else {
		entry.text = raw
	}

	entry.size = stat.size
	entry.mtimeMs = stat.mtimeMs
	index.entries.set(rel, entry)
	rebuildReverseDeps(index)
}

// invalidate: refresh (or drop) one file's entry after a watcher
// event, then re-render every transitive implant dependent (a
// changed implanted file must not leave its dependents' cached
// text/contentHtml stale). No-op for non-markdown extensions and
// paths outside the index root; a no-op mtime/size check skips
// redundant watcher events; a missing file drops its entry.
const invalidate = async (index, absPath) => {
	const abs = path.resolve(absPath)
	if (!index.options.markdownExts.includes(path.parse(abs).ext)) {
		return
	}

	const rel = relOf(index, abs)
	if (rel === null) {
		return
	}

	// Mtime/size no-op check (editors that touch files without
	// changing content are common)
	let stat
	try {
		stat = fs.statSync(abs)
	} catch (_) {
		stat = null
	}

	const entry = index.entries.get(rel)
	if (stat && entry &&
		stat.mtimeMs === entry.mtimeMs && stat.size === entry.size) {
		return
	}

	const refresh = async () => {
		if (index.options.render) {
			// Re-render through the render callback (pulls fresh
			// implanted content; a deleted implant resolves to the
			// marker text, matching the served page)
			const result = await index.options.render(abs)
			storeContent(index, abs, {
				contentHtml: result.contentHtml,
				deps: result.deps || new Set()
			})
		} else if (!stat) {
			index.entries.delete(rel)
			rebuildReverseDeps(index)
		} else {
			let raw
			try {
				raw = fs.readFileSync(abs, 'utf8')
			} catch (_) {
				index.entries.delete(rel)
				rebuildReverseDeps(index)
				return
			}

			const {title, headings} = extract(raw, path.parse(abs).base, index.options.slugify)
			const existing = index.entries.get(rel)
			index.entries.set(rel, {
				title,
				headings,
				text: raw,
				size: stat.size,
				mtimeMs: stat.mtimeMs,
				contentHtml: existing ? existing.contentHtml : null,
				deps: existing ? existing.deps : new Set()
			})
			rebuildReverseDeps(index)
		}
	}

	await refresh()

	// Transitive dependents (cycle-safe via the seen set; implant
	// depth is bounded upstream anyway)
	if (!index.reverseDeps) {
		return
	}

	const dependents = index.reverseDeps.get(rel)
	if (!dependents || dependents.size === 0) {
		return
	}

	const stack = [...dependents]
	const seen = new Set([rel])
	while (stack.length > 0) {
		const depRel = stack.pop()
		if (seen.has(depRel)) {
			continue
		}

		seen.add(depRel)
		const depAbs = path.join(index.rootDir, depRel.split('/').join(path.sep))

		// Re-render the dependent (its render pulls the fresh
		// changed file) and cascade to its dependents
		if (index.entries.has(depRel) && index.options.render) {
			const result = await index.options.render(depAbs)
			storeContent(index, depAbs, {
				contentHtml: result.contentHtml,
				deps: result.deps || new Set()
			})
		}

		const next = index.reverseDeps.get(depRel)
		if (next) {
			for (const d of next) {
				if (!seen.has(d)) {
					stack.push(d)
				}
			}
		}
	}
}

module.exports = {
	listFiles,
	buildIndex,
	search,
	invalidate,
	renderFromIndex,
	storeContent
}
