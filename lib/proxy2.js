/**
 * Once this is running open your browser and hit http://localhost
 * You'll see that the request hits the proxy and you get the HTML back
 */

'use strict';

const net = require('net');
const http = require('http');
const fs = require('fs')
const path = require('path')
const send = require('send')

const PROXY_PORT = 8887;
const HTTP_SERVER_PORT = 8886;

let proxy = net.createServer(socket => {
	socket.on('data', message => {
		console.log('---PROXY- got message', message.toString());

		let serviceSocket = new net.Socket();

		serviceSocket.connect(HTTP_SERVER_PORT, 'localhost', () => {
			console.log('---PROXY- Sending message to server');
			serviceSocket.write(message);
		});

		serviceSocket.on('data', data => {
			console.log('---PROXY- Receiving message from server', data.toString());
			socket.write(data);
		});
	});
});

const requestHandler = (req, res) => {
	const decodedUrl = decodeURIComponent(req.url)
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

let httpServer = http.createServer(requestHandler);

proxy.listen(PROXY_PORT);
httpServer.listen(HTTP_SERVER_PORT);
