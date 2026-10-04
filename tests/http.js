'use strict'

const http = require('http')

// Minimal GET client replacing the deprecated `request` dependency
// (which pulled in a vulnerable form-data/qs/tough-cookie/uuid chain).
// The core http client sends the request path exactly as written —
// no dot-segment normalization — which the path-traversal tests rely
// on: the server, not the client, must reject /a.md/../../secret.md.
// Like request, only network failures reject; any HTTP status
// resolves. ECONNREFUSED is retried: a getPort() allocation can race
// the server's listen (repo pattern: client-side handshake retry).
const get = opts => new Promise((resolve, reject) => {
	const u = new URL(opts.url)
	const timeout = (opts && opts.timeout) || 2000
	// The raw path as written, minus the origin (u.pathname would
	// have normalized dot segments)
	const rawPath = opts.url.slice(u.origin.length)

	const attempt = left => {
		const req = http.request({
			hostname: u.hostname,
			port: u.port,
			path: rawPath,
			method: 'GET',
			timeout
		}, res => {
			// Binary-safe: accumulate raw chunks; body is the utf8
			// string (existing contract) and buffer the raw bytes
			// (zip and other binary exports)
			const chunks = []
			res.on('data', chunk => {
				chunks.push(chunk)
			})
			res.on('end', () => {
				resolve({
					statusCode: res.statusCode,
					headers: res.headers,
					body: chunks.map(c => c.toString('utf8')).join(''),
					buffer: Buffer.concat(chunks)
				})
			})
		})

		req.on('timeout', () => {
			req.destroy(new Error('request timeout'))
		})
		req.on('error', err => {
			if (err.code === 'ECONNREFUSED' && left > 1) {
				setTimeout(() => attempt(left - 1), 100)
				return
			}
			reject(err)
		})
		req.end()
	}

	attempt(3)
})

module.exports = {get}
