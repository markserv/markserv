const path = require('path')
const chalk = require('chalk')
const termImg = require('term-img')

const msg = (type, msg) => {
	console.log(chalk`{bgGreen.black   Markserv  }{white  ${type}: }` + msg)
}

const splash = flags => {
	if (flags && flags.silent) {
		return
	}

	const logoPath = path.join(__dirname, '..', 'media', 'markserv-logo-term.png')
	termImg(logoPath, {
		width: 12,
		fallback: () => {}
	})

	msg('boot', 'starting Markserv...', flags)
}

module.exports = splash
