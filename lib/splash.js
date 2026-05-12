import path, {dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import chalk from 'chalk'
import termImg from 'term-img'

const __dirname = dirname(fileURLToPath(import.meta.url))

const message = (type, message_) => {
	console.log(chalk`{bgGreen.black   Markserv  }{white  ${type}: }` + message_)
}

const splash = flags => {
	if (flags && flags.silent) {
		return
	}

	const logoPath = path.join(__dirname, '..', 'media', 'markserv-logo-term.png')
	termImg(logoPath, {
		width: 12,
		fallback() {
}
	})

	message('boot', 'starting Markserv...', flags)
}

export default splash
