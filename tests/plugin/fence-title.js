'use strict'

// Test fixture for --plugin: wraps the fence renderer (a built-in rule
// that markdown-it-highlightjs has already replaced) and adds a title
// from the fence info string, e.g. ```js title="example.js"
module.exports = md => {
	const fence = md.renderer.rules.fence
	md.renderer.rules.fence = (tokens, idx, options, env, self) => {
		const match = tokens[idx].info.match(/title="([^"]*)"/)
		const html = fence(tokens, idx, options, env, self)
		return match ? `<div class="plugin-title">${md.utils.escapeHtml(match[1])}</div>${html}` : html
	}
}
