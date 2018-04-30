const http = require('http')
const fs = require('fs')
const path = require('path')
const send = require('send')

const port = 8421

const getPathFromUrl = url => {
	return url.split(/[?#]/)[0]
}

const requestHandler = (req, res) => {
	const decodedUrl = getPathFromUrl(decodeURIComponent(req.url))
	const filePath = path.normalize(unescape(__dirname) + unescape(decodedUrl))
	// const baseDir = path.parse(filePath).dir

	console.log(filePath)
	try {
		const stat = fs.statSync(filePath)
	} catch (err) {
		console.error(err)
	}
	send(req, filePath).pipe(res)
}

const server = http.createServer(requestHandler)

server.listen(port, (err) => {
	if (err) {
		return console.log('something bad happened', err)
	}

	console.log(`server is listening on ${port}`)
})
