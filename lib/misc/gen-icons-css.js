import fs, {readFileSync} from 'node:fs';
import path, {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const materialIcons = JSON.parse(readFileSync(new URL('../icons/material-icons.json', import.meta.url)));

const iconCSS = [`.icon {
    content: "";
    display: block;
    position: absolute;
    width: 24px;
    height: 24px;
    float: left;
    margin: 0 -28px 0 0;
}
`];

for (const iconName of Reflect.ownKeys(materialIcons.iconDefinitions)) {
	const iconFile = materialIcons.iconDefinitions[iconName].iconPath;
	iconCSS.push(`.icon.${iconName}:before {
    background: url("{markserv}icons/${iconFile}") no-repeat;
}
`);
}

fs.writeFileSync(path.join(__dirname, 'icons', 'icons.css'), iconCSS.join(''));
