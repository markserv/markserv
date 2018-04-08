#!/usr/bin/env node

'use strict'

// Markdown Extension Types
const markdownExtensions = [
  '.markdown',
  '.mdown',
  '.mkdn',
  '.md',
  '.mkd',
  '.mdwn',
  '.mdtxt',
  '.mdtext',
  '.text'
]

const watchExtensions = markdownExtensions.concat([
  '.less',
  '.js',
  '.css',
  '.html',
  '.htm',
  '.json',
  '.gif',
  '.png',
  '.jpg',
  '.jpeg'
])

const PORT_RANGE = {
  HTTP: [8000, 8100],
  LIVE_RELOAD: [35729, 35829],
  WEBSOCKETS: [3000, 4000]
}

const http = require('http')
const path = require('path')
const fs = require('fs')

const open = require('open')
const Promise = require('bluebird')
const connect = require('connect')
const commonmark = require('commonmark')
const less = require('less')
const send = require('send')
const jsdom = require('jsdom')
const flags = require('commander')
const liveReload = require('livereload')
const openPort = require('openport')
const connectLiveReload = require('connect-livereload')
const ansi = require('ansi')
const io = require('socket.io')()
const lunr = require('lunr')
const cheerio = require('cheerio')

const find = require('./find')

const cursor = ansi(process.stdout)

const pkg = require('./package.json')

// Path Variables
const GitHubStyle = path.join(__dirname, 'less/github.less')

// Options
flags.version(pkg.version)
  .option('-d, --dir [type]', 'Serve from directory [dir]', './')
  .option('-p, --port [type]', 'Serve on port [port]', null)
  .option('-h, --header [type]', 'Header template .md file', null)
  .option('-e, --searchbar', 'Turn on Lunr.js Search Bar for Markdown files', false)
  .option('-r, --footer [type]', 'Footer template .md file', null)
  .option('-n, --navigation [type]', 'Navigation .md file', null)
  .option('-a, --address [type]', 'Serve on ip/address [address]', 'localhost')
  .option('-s, --less [type]', 'Path to Less styles [less]', GitHubStyle)
  .option('-f, --file [type]', 'Open specific file in browser [file]')
  .option('-x, --x', 'Don\'t open browser on run.')
  .option('-v, --verbose', 'verbose output')
  .parse(process.argv)

const dir = flags.dir
const cssPath = flags.less

// Terminal Output Messages

const msg = type => cursor
  .bg.green()
  .fg.black()
  .write(' Markserv ')
  .reset()
  .fg.white()
  .write(' ' + type + ': ')
  .reset()

const errormsg = type => cursor
  .bg.red()
  .fg.black()
  .write(' Markserv ')
  .reset()
  .write(' ')
  .fg.black()
  .bg.red()
  .write(' ' + type + ': ')
  .reset()
  .fg.red()
  .write(' ')

// hasMarkdownExtension: check whether a file is Markdown type
const hasMarkdownExtension = path => {
  const fileExtension = path.substr(path.length - 3).toLowerCase()
  let extensionMatch = false

  markdownExtensions.forEach(extension => {
    if (extension === fileExtension) {
      extensionMatch = true
    }
  })

  return extensionMatch
}

// markdownToHTML: turns a Markdown file into HTML content
const markdownToHTML = markdownText => new Promise((resolve, reject) => {
  let result

  try {
    const reader = new commonmark.Parser()
    const writer = new commonmark.HtmlRenderer()
    const parsed = reader.parse(markdownText)
    result = writer.render(parsed)
  } catch (err) {
    return reject(err)
  }

  resolve(result)
})

const separators = [
  ' ',
  '-',
  '-'
].join('|')

const highlight = (tokens, content) => {
  let hlResult = ''
  const foundTokens = {}
  const contentLower = content.toLowerCase()

  tokens.forEach(token => {
    if (token.length < 1) {
      return
    }

    const foundIdx = contentLower.indexOf(token)
    const found = foundIdx > -1

    if (found) {
      foundTokens[token] = true
    }
  })

  if (Reflect.ownKeys(foundTokens).length >= 0) {
    const hlLine = content.replace(
      new RegExp(tokens.join('|'), 'gi'), str => {
        return `<span class="highlight">${str}</span>`
      }
    )

    // Only add the highlighted lines
    if (hlLine !== content) {
      hlResult = hlLine
    }
  }
  // console.log(hlResult)

  return hlResult
}

const mdToHtmlHighlighted = (tokens, mdContent) => {
  const reader = new commonmark.Parser()
  const writer = new commonmark.HtmlRenderer()
  const parsed = reader.parse(mdContent)
  const html = writer.render(parsed)

  const found = []

  const filter = (node, tokens) => {
    if (node.type === 'text') {
      const text = node.data
      const hlText = highlight(tokens, text)
      const parentNode = cheerio.load(node.parent)
      const tagName = node.parent.name
      if (hlText.length > 0 && tagName !== null) {
        const $tag = cheerio.load(parentNode.html())
        $tag(tagName).empty().prepend(hlText)
        const elemHtml = $tag(tagName).parent().html()
        found.push(elemHtml)
      }
    }

    if (Reflect.has(node, 'children')) {
      node.children.forEach(child => {
        filter(child, tokens)
      })
    }
  }

  const $ = cheerio.load(html)._root
  filter($, tokens)
  const result = found.join('\n')
  return result
}

// getFile: reads utf8 content from a file
const getFile = path => new Promise((resolve, reject) => {
  fs.readFile(path, 'utf8', (err, data) => {
    if (err) {
      return reject(err)
    }
    resolve(data)
  })
})

let searchIndex
const loadedMarkdownFiles = {}

const loadAllSearchFiles = fileList => new Promise((resolve, reject) => {
  const promises = []

  fileList.forEach(filepath => {
    promises.push(getFile(filepath))
  })

  Promise.all(promises).then(contents => {
    // console.log(contents)

    const documents = []

    contents.forEach((fileContent, idx) => {
      const fileName = fileList[idx]
      const title = path.basename(fileName)
      const href = fileName

      const documentObject = {
        id: fileName,
        title,
        href,
        body: fileContent,
        bodyHl: ''
      }

      documents.push(documentObject)
      loadedMarkdownFiles[fileName] = documentObject
    })

    searchIndex = lunr(function () {
      this.ref('id')
      this.field('title')
      this.field('body')

      documents.forEach(function (document) {
        this.add(document)
      }, this)
    })
    // console.log(searchIndex)

    resolve(searchIndex)
  }).catch(err => {
    reject(err)
  })
})

const clients = {}

io.on('connection', client => {
  console.log(client.id)
  clients[client.id] = client

  client.on('search', term => {
    if (typeof searchIndex !== 'object') {
      client.emit('search_results', false)
      return
    }

    if (term.length < 2) {
      return
    }

    console.log(`searching for: ${term}`)
    const lunrSearchResults = searchIndex.search(term)

    lunrSearchResults.map(result => {
      const tokenList = term.toLowerCase().split(new RegExp(separators, 'g'))
      const tokens = []
      tokenList.forEach(token => {
        if (token.length > 2) {
          tokens.push(token)
        }
      })

      const fileName = result.ref
      const mdContent = loadedMarkdownFiles[fileName].body

      const hlHtml = mdToHtmlHighlighted(tokens, mdContent)
      result.content = loadedMarkdownFiles[fileName]
      result.content.hl = hlHtml
      return result
    })

    client.emit('search_results', lunrSearchResults)
  })
})

io.listen(34567)

const setupSearchFeature = () => new Promise((resolve, reject) => {
  const rootPath = dir
  const filePattern = './**/*.md'

  find(rootPath, filePattern)
  .then(loadAllSearchFiles)
  .catch(err => {
    console.err(err)
    reject(err)
  })
})

setupSearchFeature()

// Get Custom Less CSS to use in all Markdown files
const buildStyleSheet = cssPath =>
  new Promise(resolve =>
    getFile(cssPath).then(data =>
      less.render(data).then(data =>
        resolve(data.css)
      )
    )
  )

// linkify: converts github style wiki markdown links to .md links
const linkify = body => new Promise((resolve, reject) => {
  jsdom.env(body, (err, window) => {
    if (err) {
      return reject(err)
    }

    const links = window.document.getElementsByTagName('a')
    const l = links.length

    let href
    let link
    let markdownFile
    let mdFileExists
    let relativeURL
    let isFileHref

    for (let i = 0; i < l; i++) {
      link = links[i]
      href = link.href
      isFileHref = href.substr(0, 8) === 'file:///'

      markdownFile = href.replace(path.join('file://', __dirname), flags.dir) + '.md'
      mdFileExists = fs.existsSync(markdownFile)

      if (isFileHref && mdFileExists) {
        relativeURL = href.replace(path.join('file://', __dirname), '') + '.md'
        link.href = relativeURL
      }
    }

    const html = window.document.getElementsByTagName('body')[0].innerHTML
    resolve(html)
  })
})

// buildHTMLFromMarkDown: compiles the final HTML/CSS output from Markdown/Less files, includes JS
const buildHTMLFromMarkDown = markdownPath => new Promise(resolve => {
  const stack = [
    buildStyleSheet(cssPath),

    // Article
    getFile(markdownPath)
      .then(markdownToHTML)
      .then(linkify),

    // Header
    flags.header && getFile(flags.header)
      .then(markdownToHTML)
      .then(linkify),

    // Footer
    flags.footer && getFile(flags.footer)
      .then(markdownToHTML)
      .then(linkify),

    // Navigation
    flags.navigation && getFile(flags.navigation)
      .then(markdownToHTML)
      .then(linkify),

    // Search Bar Template
    flags.searchbar &&
        getFile(path.join(__dirname, 'searchbar.html')),

    // Search Bar Scripts
    flags.searchbar &&
        getFile(path.join(__dirname, 'searchbar.js')),
    flags.searchbar &&
        getFile(path.join(__dirname, 'node_modules', 'lunr', 'lunr.js')),
    flags.searchbar &&
        getFile(path.join(__dirname,
            'node_modules', 'socket.io-client', 'dist', 'socket.io.js'))
  ]

  Promise.all(stack).then(data => {
    const css = data[0]
    const htmlBody = data[1]
    const dirs = markdownPath.split('/')
    const title = dirs[dirs.length - 1].split('.md')[0]

    let header
    let footer
    let navigation
    let searchbarTemplate
    let searchbarScript
    let searchbarLunrJs
    let socketIoClientJs

    let outputHtml

    if (flags.header) {
      header = data[2]
    }

    if (flags.footer) {
      footer = data[3]
    }

    if (flags.navigation) {
      navigation = data[4]
    }

    if (flags.searchbar) {
      searchbarTemplate = data[5]
      searchbarScript = data[6]
      searchbarLunrJs = data[7]
      socketIoClientJs = data[8]
    }

    if (flags.less === GitHubStyle) {
      outputHtml = `
        <!DOCTYPE html>
          <head>
            <title>${title}</title>
            <meta charset="utf-8">
            <style>${css}</style>
            <link rel="stylesheet" href="//sindresorhus.com/github-markdown-css/github-markdown.css">
            <script src="https://code.jquery.com/jquery-2.1.1.min.js"></script>
            <script src="//cdnjs.cloudflare.com/ajax/libs/highlight.js/8.4/highlight.min.js"></script>
            <link rel="stylesheet" href="https://highlightjs.org/static/demo/styles/github-gist.css">
          </head>
          <body>
            <article class="markdown-body">${htmlBody}</article>
          </body>
          <script src="http://localhost:35729/livereload.js?snipver=1"></script>
          <script>hljs.initHighlightingOnLoad();</script>`
    } else {
      outputHtml = `
        <!DOCTYPE html>
          <head>
            <title>${title}</title>
            <script>${searchbarLunrJs}</script>
            ${(flags.searchbar ? `<script>${socketIoClientJs}</script>` : '')}
            <script src="https://code.jquery.com/jquery-2.1.1.min.js"></script>
            <script src="//cdnjs.cloudflare.com/ajax/libs/highlight.js/8.4/highlight.min.js"></script>
            <link rel="stylesheet" href="https://highlightjs.org/static/demo/styles/github-gist.css">
            <meta charset="utf-8">
            <style>${css}</style>
          </head>
          <body>
            <div class="container">
              ${(header ? '<header>' + header + '</header>' : '')}
              ${(navigation ? '<nav>' + navigation + '</nav>' : '')}
              ${(flags.searchbar ? searchbarTemplate : '')}
              <article>${htmlBody}</article>
              ${(footer ? '<footer>' + footer + '</footer>' : '')}
            </div>
          </body>
          <script>${searchbarScript}</script>
          <script src="http://localhost:35729/livereload.js?snipver=1"></script>
          <script>hljs.initHighlightingOnLoad();</script>`
    }
    resolve(outputHtml)
  })
})
              // ${(searchbar ? '<div id="search-bar">' + searchbar + '</div>' : '')}

// markItDown: begins the Markdown compilation process, then sends result when done...
const compileAndSendMarkdown = (path, res) => buildHTMLFromMarkDown(path)
  .then(html => {
    res.writeHead(200)
    res.end(html)

  // Catch if something breaks...
  }).catch(err => {
    msg('error')
    .write('Can\'t build HTML: ', err)
    .reset().write('\n')
  })

const compileAndSendDirectoryListing = (path, res) => {
  const urls = fs.readdirSync(path)
  let list = '<ul>\n'

  urls.forEach(subPath => {
    const dir = fs.statSync(path + subPath).isDirectory()
    let href
    if (dir) {
      href = subPath + '/'
      list += `\t<li class="dir"><a href="${href}">${href}</a></li> \n`
    } else {
      href = subPath
      if (subPath.split('.md')[1] === '') {
        list += `\t<li class="md"><a href="${href}">${href}</a></li> \n`
      } else {
        list += `\t<li class="file"><a href="${href}">${href}</a></li> \n`
      }
    }
  })

  list += '</ul>\n'

  buildStyleSheet(cssPath).then(css => {
    const html = `
      <!DOCTYPE html>
        <head>
          <title>${path.slice(2)}</title>
          <meta charset="utf-8">
          <script src="https://code.jquery.com/jquery-2.1.1.min.js"></script>
          <script src="//cdnjs.cloudflare.com/ajax/libs/highlight.js/8.4/highlight.min.js"></script>
          <link rel="stylesheet" href="//cdnjs.cloudflare.com/ajax/libs/highlight.js/8.4/styles/default.min.css">
          <link rel="stylesheet" href="//highlightjs.org/static/demo/styles/github-gist.css">
          <link rel="shortcut icon" type="image/x-icon" href="https://cdn0.iconfinder.com/data/icons/octicons/1024/markdown-128.png" />
          <style>${css}</style>
        </head>
        <body>
          <article class="markdown-body">
            <h1>Index of ${path.slice(2)}</h1>${list}
            <sup><hr> Served by <a href="https://www.npmjs.com/package/markserv">MarkServ</a> | PID: ${process.pid}</sup>
          </article>
        </body>
        <script src="http://localhost:35729/livereload.js?snipver=1"></script>`

    // Log if verbose

    if (flags.verbose) {
      msg('index').write(path).reset().write('\n')
    }

    // Send file
    res.writeHead(200, {'Content-Type': 'text/html'})
    res.write(html)
    res.end()
  })
}

// Remove URL params from file being fetched
const getPathFromUrl = url => {
  return url.split(/[?#]/)[0]
}

// http_request_handler: handles all the browser requests
const httpRequestHandler = (req, res) => {
  const originalUrl = getPathFromUrl(req.originalUrl)

  if (flags.verbose) {
    msg('request')
     .write(unescape(dir) + unescape(originalUrl))
     .reset().write('\n')
  }

  const path = unescape(dir) + unescape(originalUrl)

  let stat
  let isDir
  let isMarkdown

  try {
    stat = fs.statSync(path)
    isDir = stat.isDirectory()
    isMarkdown = false
    if (!isDir) {
      isMarkdown = hasMarkdownExtension(path)
    }
  } catch (err) {
    res.writeHead(200, {'Content-Type': 'text/html'})
    errormsg('404').write(path.slice(2)).reset().write('\n')
    res.write('404 :\'(')
    res.end()
    return
  }

  // Markdown: Browser is requesting a Markdown file
  if (isMarkdown) {
    msg('markdown').write(path.slice(2)).reset().write('\n')
    compileAndSendMarkdown(path, res)
  } else if (isDir) {
    // Index: Browser is requesting a Directory Index
    msg('dir').write(path.slice(2)).reset().write('\n')
    compileAndSendDirectoryListing(path, res)
  } else {
    // Other: Browser requests other MIME typed file (handled by 'send')
    msg('file').write(path.slice(2)).reset().write('\n')
    send(req, path, {root: dir}).pipe(res)
  }
}

let LIVE_RELOAD_PORT
let LIVE_RELOAD_SERVER
let HTTP_PORT
let HTTP_SERVER
let CONNECT_APP

const findOpenPort = range => new Promise((resolve, reject) => {
  const props = {
    startingPort: range[0],
    endingPort: range[1]
  }

  openPort.find(props, (err, port) => {
    if (err) {
      return reject(err)
    }
    resolve(port)
  })
})

const setLiveReloadPort = port => new Promise(resolve => {
  LIVE_RELOAD_PORT = port
  resolve(port)
})

const setHTTPPort = port => new Promise(resolve => {
  HTTP_PORT = port
  resolve(port)
})

const startConnectApp = () => new Promise(resolve => {
  CONNECT_APP = connect()
    .use('/', httpRequestHandler)
    .use(connectLiveReload({
      port: LIVE_RELOAD_PORT
    }))
  resolve(CONNECT_APP)
})

const startHTTPServer = () => new Promise(resolve => {
  HTTP_SERVER = http.createServer(CONNECT_APP)
  HTTP_SERVER.listen(HTTP_PORT, flags.address)
  resolve(HTTP_SERVER)
})

const startLiveReloadServer = () => new Promise(resolve => {
  LIVE_RELOAD_SERVER = liveReload.createServer({
    exts: watchExtensions,
    port: LIVE_RELOAD_PORT
  }).watch(flags.dir)

  resolve(LIVE_RELOAD_SERVER)
})

const serversActivated = () => {
  const serveURL = 'http://' + flags.address + ':' + HTTP_PORT

  msg('start')
   .write('serving content from ')
   .fg.white().write(path.resolve(flags.dir)).reset()
   .write(' on port: ')
   .fg.white().write(String(HTTP_PORT)).reset()
   .write('\n')

  msg('address')
   .underline().fg.white()
   .write(serveURL).reset()
   .write('\n')

  msg('less')
   .write('using style from ')
   .fg.white().write(flags.less).reset()
   .write('\n')

  msg('livereload')
    .write('communicating on port: ')
    .fg.white().write(String(LIVE_RELOAD_PORT)).reset()
    .write('\n')

  if (process.pid) {
    msg('process')
      .write('your pid is: ')
      .fg.white().write(String(process.pid)).reset()
      .write('\n')

    msg('info')
      .write('to stop this server, press: ')
      .fg.white().write('[Ctrl + C]').reset()
      .write(', or type: ')
      .fg.white().write('"kill ' + process.pid + '"').reset()
      .write('\n')
  }

  if (flags.file) {
    open(serveURL + '/' + flags.file)
  } else if (flags.x === false) {
    open(serveURL)
  }
}

// Initialize MarkServ
findOpenPort(PORT_RANGE.LIVE_RELOAD)
  .then(setLiveReloadPort)
  .then(startConnectApp)
  .then(() => {
    if (flags.port === null) {
      return findOpenPort(PORT_RANGE.HTTP)
    }
    return flags.port
  })
  .then(setHTTPPort)
  .then(startHTTPServer)
  .then(startLiveReloadServer)
  .then(serversActivated)
