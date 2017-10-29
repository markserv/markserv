const mm = require('micromatch')

const ignoredDirs = [
    '**/node_modules',
    '**/.git',
    '**/.svn',
    '**/tmp'
]

const dir = '/Users/al/repos/markserv/node_modules'
const matches = mm([dir], ignoredDirs, {dot: true})
console.log(matches)

