'use strict'

const fs = require('fs')
const path = require('path')

// Markserv search index — an in-memory inverted-substring index over
// the markdown files under a served root.
//
// Pure Node module, deliberately with NO require of './server'
// (server.js requires this one for the /__markserv/search subroute; a
// circular require would hand us a partially initialised module).
// Collaborators — the slugify function, the exclusion list, the
// markdown extension list — arrive as buildIndex() parameters, so
// anchors match markdown-it-anchor exactly (server.js's slugify) and
// nothing is duplicated.
//
// Walk rules (shared with the zip export via listFiles): dot entries
// are pruned at every level — hidden things are invisible in the
// directory listings, so they are invisible to search too;
// directories whose name exactly matches an exclusion are pruned
// with their subtree; symlinks are never followed (no loops, no
// escapes). readdir results are sorted so the walk — and the index —
// is deterministic.

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

// buildIndex: walk the root and index every markdown file
// (markdownExts) at most maxFileSize bytes. Returns
// {rootDir, entries, options}; entries is a Map keyed by slash-
// relative path → {title, headings, text, size, mtimeMs}.
const buildIndex = (rootDir, {
	exclusions = [],
	slugify,
	markdownExts = [],
	maxFileSize = DEFAULT_MAX_FILE_SIZE
}) => {
	const entries = new Map()

	listFiles(rootDir, {exclusions}).forEach(({abs, rel}) => {
		if (!markdownExts.includes(path.parse(abs).ext)) {
			return
		}

		let stat
		try {
			stat = fs.statSync(abs)
		} catch (_) {
			return
		}

		if (stat.size > maxFileSize) {
			return
		}

		let text
		try {
			text = fs.readFileSync(abs, 'utf8')
		} catch (_) {
			return
		}

		const {title, headings} = extract(text, path.parse(abs).base, slugify)
		entries.set(rel, {
			title,
			headings,
			text,
			size: stat.size,
			mtimeMs: stat.mtimeMs
		})
	})

	return {
		rootDir: path.resolve(rootDir),
		entries,
		options: {exclusions, slugify, markdownExts, maxFileSize}
	}
}

// search: case-insensitive substring search across the indexed files.
// score = body occurrence count + 10 per matched heading (a heading
// matches when the query equals its slug or is a substring of its
// text; anchor = first matching slug). Snippet = up to 120 chars of
// the first matching line, centred on the match, with ellipses where
// truncated; when only a heading matched the snippet is that
// heading's text. Sorted score desc, then path asc; capped by limit
// (clamped 1..100).
const search = (index, query, {limit = 50} = {}) => {
	const q = String(query == null ? '' : query).trim().toLowerCase()
	if (!q) {
		return []
	}

	const lim = Math.max(1, Math.min(100, limit))
	const results = []

	for (const [rel, entry] of index.entries) {
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

// invalidate: refresh (or drop) one file's entry after a watcher
// event. No-op for non-markdown extensions and paths outside the
// index root; a missing file drops its entry.
const invalidate = (index, absPath) => {
	const abs = path.resolve(absPath)
	if (!index.options.markdownExts.includes(path.parse(abs).ext)) {
		return
	}

	const rel = path.relative(index.rootDir, abs).split(path.sep).join('/')
	if (rel.startsWith('..') || path.isAbsolute(rel)) {
		// Outside the index root: nothing to refresh
		return
	}

	let stat
	try {
		stat = fs.statSync(abs)
	} catch (_) {
		index.entries.delete(rel)
		return
	}

	if (!stat.isFile() || stat.size > index.options.maxFileSize) {
		index.entries.delete(rel)
		return
	}

	let text
	try {
		text = fs.readFileSync(abs, 'utf8')
	} catch (_) {
		index.entries.delete(rel)
		return
	}

	const {title, headings} = extract(text, path.parse(abs).base, index.options.slugify)
	index.entries.set(rel, {
		title,
		headings,
		text,
		size: stat.size,
		mtimeMs: stat.mtimeMs
	})
}

module.exports = {
	listFiles,
	buildIndex,
	search,
	invalidate
}
