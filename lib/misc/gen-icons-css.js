import fs from 'fs'
import path from 'path'
import {fileURLToPath} from 'url'
import {dirname} from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

import {readFileSync} from 'fs'
const materialIcons = JSON.parse(readFileSync(new URL('../icons/material-icons.json', import.meta.url)))

const iconCSS = []

iconCSS.push(`.icon {
    content: "";
    display: block;
    position: absolute;
    width: 24px;
    height: 24px;
    float: left;
    margin: 0 -28px 0 0;
}
`)

Reflect.ownKeys(materialIcons.iconDefinitions).forEach(iconName => {
	const iconFile = materialIcons.iconDefinitions[iconName].iconPath
	iconCSS.push(`.icon.${iconName}:before {
    background: url("{markserv}icons/${iconFile}") no-repeat;
}
`)
})

fs.writeFileSync(path.join(__dirname, 'icons', 'icons.css'), iconCSS.join(''))
