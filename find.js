const fs = require('fs')
const path = require('path')
const Promise = require('bluebird')
const micromatch = require('micromatch')

const ignoredDirs = [
    '**/node_modules',
    '**/.git',
    '**/.svn',
    '**/tmp'
]

const recursiveRead = (dir, filePattern) => new Promise((resolve, reject) => {
    const readDir = uri => new Promise((resolve, reject) => {
        fs.readdir(uri, (err, data) => {
            if (err) {
                reject(err)
            }

            resolve(data)
        })
    })

    const stat = filepath => new Promise((resolve, reject) => {
        fs.stat(filepath, (err, stat) => {
            if (err) {
                // return reject(err)
                return resolve(false)
            }

            resolve(stat)
        })
    })

    const filterFiles = files => new Promise((resolve, reject) => {
        const stats = []

        files.forEach(file => {
            const filepath = path.join(dir, file)
            stats.push(stat(filepath))
        })

        Promise.all(stats).then(results => {
            const dirs = []
            let fileList = []

            results.forEach((stat, idx) => {
                const filepath = path.join(dir, files[idx])
                if (!stat) {
                  return
                }

                if (stat.isFile()) {
                    const matches = micromatch([filepath], filePattern, {dot: true})
                    if (matches.length > 0) {
                        fileList.push(filepath)
                    }
                } else if (stat.isDirectory()) {
                    if (filepath === '..' && filepath === '.') {
                        return
                    }

                    const matches = micromatch([filepath], ignoredDirs, {dot: true})
                    if (matches.length > 0) {
                        return
                    }

                    dirs.push(filepath)
                }
            })

            if (dirs.length === 0) {
                return resolve(fileList)
            }

            const nextReads = []

            dirs.forEach(dir => {
                nextReads.push(recursiveRead(dir, filePattern))
            })

            Promise.all(nextReads)
            .then(results => {
                results.forEach(dirResult => {
                    fileList = fileList.concat(dirResult)
                })

                resolve(fileList)
            })
            .catch(err => {
                reject(err)
            })
        })
    })

    readDir(dir)
    .then(filterFiles)
    .then(files => {
        resolve(files)
    })
    .catch(err => {
        reject(err)
    })
})

module.exports = (rootPath, filePattern) => new Promise((resolve, reject) => {
    recursiveRead(rootPath, filePattern)
    .then(results => {
        resolve(results)
    })
    .catch(err => {
        reject(err)
    })
})
