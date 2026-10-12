const path = require('path')
const test = require('ava')
const markserv = require('../lib/server.js')

const dir = path.join(__dirname, 'testdir')

test.serial('exit-on-tab-close: flag off leaves the instance self-sustaining', async t => {
	const service = await markserv.init({
		dir,
		hotreload: false,
		address: 'localhost',
		silent: true,
		browser: false
	})

	try {
		t.is(service.tabCloseTimer, null)
	} finally {
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test.serial('exit-on-tab-close: unenumerable tabs (unknown) never stop the instance', async t => {
	// The tab check resolves 'unknown' when tabs cannot be enumerated
	// (no osascript, no scriptable browser, query failure). The
	// instance must keep running — only a positive 'gone' may stop it.
	let gone = false
	const service = await markserv.init({
		dir,
		hotreload: false,
		address: 'localhost',
		silent: true,
		browser: false,
		exitOnTabClose: true,
		$pathProvided: true,
		$checkTabAlive: async () => 'unknown',
		$tabClosePollMs: 50,
		$onTabGone: () => { gone = true }
	})

	try {
		t.truthy(service.tabCloseTimer, 'the poll must be armed when the flag is on')
		await new Promise(resolve => setTimeout(resolve, 300))
		t.false(gone)
	} finally {
		clearInterval(service.tabCloseTimer)
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test.serial('exit-on-tab-close: a positive gone stops the instance', async t => {
	let gone = false
	const service = await markserv.init({
		dir,
		hotreload: false,
		address: 'localhost',
		silent: true,
		browser: false,
		exitOnTabClose: true,
		$pathProvided: true,
		$checkTabAlive: async () => 'gone',
		$tabClosePollMs: 50,
		$onTabGone: () => { gone = true }
	})

	try {
		await new Promise(resolve => setTimeout(resolve, 300))
		t.true(gone, 'the instance must stop once the tab check reports gone')
	} finally {
		clearInterval(service.tabCloseTimer)
		await new Promise(resolve => service.httpServer.close(resolve))
	}
})

test('checkBrowserTabAlive resolves to a known state without throwing', async t => {
	// A dedicated test port no browser tab points at: on a Mac with a
	// scriptable browser this resolves 'gone', elsewhere 'unknown'.
	const state = await markserv.checkBrowserTabAlive('http://localhost:8799')
	t.true(['alive', 'gone', 'unknown'].includes(state))
})
