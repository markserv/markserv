#!/usr/bin/env node

'use strict';

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
  '.text',
];

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
  '.jpeg',
]);


const PORT_RANGE = {
  HTTP: [8000, 8100],
  LIVE_RELOAD: [35729, 35829]
};


// Requirements

const Promise = require('bluebird'),
  connect = require('connect'),
  http = require('http'),
  open = require("open"),
  path = require('path'),
  marked = require('marked'),
  less = require('less'),
  fs = require('fs'),
  send = require('send'),
  jsdom = require('jsdom'),
  ansi = require('ansi'),
  cursor = ansi(process.stdout),
  flags = require('commander'),
  pkg = require('./package.json'),
  liveReload = require('livereload'),
  openPort = require('openport'),
  connectLiveReload = require('connect-livereload');


// Path Variables

const GitHubStyle = __dirname+'/less/github.less',
  scriptPath = __dirname+'/script/script.js';


// Options

flags.version(pkg.version)
  .option('-d, --dir [type]', 'Serve from directory [dir]', './')
  .option('-p, --port [type]', 'Serve on port [port]', null)
  .option('-h, --header [type]', 'Header .md file', null)
  .option('-r, --footer [type]', 'Footer .md file', null)
  .option('-n, --navigation [type]', 'Navigation .md file', null)
  .option('-a, --address [type]', 'Serve on ip/address [address]', 'localhost')
  .option('-s, --less [type]', 'Path to Less styles [less]', GitHubStyle)
  .option('-f, --file [type]', 'Open specific file in browser [file]')
  .option('-x, --x', 'Don\'t open browser on run.')
  .option('-v, --verbose', 'verbose output')
  .parse(process.argv);

  console.log(flags.port);


const dir = flags.dir;
const cssPath = flags.less;

let LIVE_RELOAD_PORT,
    LIVE_RELOAD_SERVER,
    HTTP_PORT,
    HTTP_SERVER,
    CONNECT_APP;

const findOpenPort = (range) => new Promise((resolve, reject) => {
    openPort.find({startingPort: range[0], endingPort: range[1]},
      (err, port) => {
        if(err) return reject(err);
        resolve(port);
      }
    );
  });

const setLiveReloadPort = (port) => new Promise((resolve, reject) => {
    LIVE_RELOAD_PORT = port;
    resolve(port);
  });

const setHTTPPort = (port) => new Promise((resolve, reject) => {
    HTTP_PORT = port;
    resolve(port);
  });



const startConnectApp = (live_reload_port) => new Promise((resolve, reject) => {
    CONNECT_APP = connect()
      .use('/', http_request_handler)
      .use(connectLiveReload({
        port: LIVE_RELOAD_PORT
      }));
    resolve(CONNECT_APP);
  });

const startHTTPServer = () => new Promise((resolve, reject) => {
    HTTP_SERVER = http.createServer(CONNECT_APP);
    HTTP_SERVER.listen(HTTP_PORT, flags.address);
    resolve(HTTP_SERVER);
  });


const startLiveReloadServer = () => new Promise((resolve, reject) => {
    LIVE_RELOAD_SERVER = liveReload.createServer({
      exts: watchExtensions,
      port: LIVE_RELOAD_PORT
    }).watch(flags.dir);
    resolve(LIVE_RELOAD_SERVER);
  });

const serversActivated = () => {
  const address = HTTP_SERVER.address();
  //console.log(address);
  //var urlSafeAddress = address && address.address === "::" ? "localhost" : address.address || flags.address;
  const serveURL = 'http://' + flags.address+':' + HTTP_PORT;

  msg('start')
   .write('serving content from ')
   .fg.white().write(path.resolve(flags.dir)).reset()
   .write(' on port: ')
   .fg.white().write(''+HTTP_PORT).reset()
   .write('\n');

  msg('address')
   .underline().fg.white()
   .write(serveURL).reset()
   .write('\n');

  const startMsg = 'serving content from "' + flags.dir + '" on port: ' + HTTP_PORT;

  msg('less')
   .write('using style from ')
   .fg.white().write(flags.less).reset()
   .write('\n');

  msg('livereload')
    .write('communicating on port: ')
    .fg.white().write(LIVE_RELOAD_PORT + '').reset()
    .write('\n');

  if (process.pid) {
    msg('process')
      .write('your pid is: ')
      .fg.white().write(process.pid + '').reset()
      .write('\n');

    msg('info')
      .write('to stop this server, press: ')
      .fg.white().write('[Ctrl + C]').reset()
      .write(', or type: ')
      .fg.white().write('"kill ' + process.pid + '"').reset()
      .write('\n');
  }

  if (flags.file) {
    open(serveURL + '/' + flags.file);
  } else {
    if (!flags.x) {
      open(serveURL);
    }
  }
}









// Terminal Output Messages

const msg = (type) => cursor
                        .bg.green()
                        .fg.black()
                        .write(' Markserv ')
                        .reset()
                        .fg.white()
                        .write(' ' + type + ': ')
                        .reset();



const boohoo = (type) => cursor
                          .bg.red()
                          .fg.black()
                          .write(' Markserv ')
                          .reset()
                          .write(' ')
                          .fg.black()
                          .bg.red()
                          .write(' ' + type+': ')
                          .reset()
                          .fg.red()
                          .write(' ');




// getFile: reads utf8 content from a file

const getFile = (path) => new Promise((resolve, reject) => {
    fs.readFile(path, 'utf8', (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });


// Get Custom Less CSS to use in all Markdown files

const buildStyleSheet = (cssPath) => new Promise((resolve, reject) => getFile(cssPath).then((data) => less.render(data).then((data) => resolve(data.css))));



// linkify: converts github style wiki markdown links to .md links

const linkify = (body) => new Promise((resolve, reject) => {
    jsdom.env(body, (err, window) => {
      if (err) return reject(err);

      const links = window.document.getElementsByTagName('a'),
            l     = links.length;
      let  href,
           link,
           markdownFile,
           mdFileExists,
           relativeURL,
           isFileHref;

      for (let i = 0; i < l; i++) {
        link = links[i];
        href = link.href;
        isFileHref = href.substr(0,8) ==='file:///';

        markdownFile = href.replace('file://' + __dirname, flags.dir) + '.md';
        mdFileExists = fs.existsSync(markdownFile);

        if (isFileHref && mdFileExists) {
          relativeURL = href.replace('file://' + __dirname, '') + '.md';
          link.href=relativeURL;
        }
      }

      const html = window.document.getElementsByTagName('body')[0].innerHTML;

      resolve(html);
    });
  });



// markdownToHTML: turns a Markdown file into HTML content

const markdownToHTML = (markdownText) => new Promise((resolve, reject) => {
    marked(markdownText, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });

// buildHTMLFromMarkDown: compiles the final HTML/CSS output from Markdown/Less files, includes JS

const buildHTMLFromMarkDown = (markdownPath) => new Promise((resolve, reject) => {

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
    ];
    Promise.all(stack).then((data) => {

      const css = data[0],
            html_body = data[1],
            dirs = markdownPath.split('/'),
            title = dirs[dirs.length-1].split('.md')[0];

      let header,
          footer,
          navigation,
          output_html;

      if (flags.header) header = data[2];
      if (flags.footer) footer = data[3];
      if (flags.navigation) navigation = data[4];
      if (flags.less === GitHubStyle) {
        output_html = `
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
              <article class="markdown-body">${html_body}</article>
            </body>
            <script src="http://localhost:35729/livereload.js?snipver=1"></script>
            <script>hljs.initHighlightingOnLoad();</script>`;
      } else {
        output_html = `
          <!DOCTYPE html>
            <head>
              <title>${title}</title>
              <script src="https://code.jquery.com/jquery-2.1.1.min.js"></script>
              <script src="//cdnjs.cloudflare.com/ajax/libs/highlight.js/8.4/highlight.min.js"></script>
              <link rel="stylesheet" href="https://highlightjs.org/static/demo/styles/github-gist.css">
              <meta charset="utf-8">
              <style>${css}</style>
            </head>
            <body>
              <div class="container">
                ${(header ? '<header>' + header + '</header>' : '' )}
                ${(navigation ? '<nav>' + navigation + '</nav>' : '' )}
                <article>${html_body}</article>
                ${(footer ? '<footer>' + footer + '</footer>' : '' )}
              </div>
            </body>
            <script src="http://localhost:35729/livereload.js?snipver=1"></script>
            <script>hljs.initHighlightingOnLoad();</script>`;

      }
      resolve(output_html);
    });
  });




// markItDown: begins the Markdown compilation process, then sends result when done...

const compileAndSendMarkdown = (path, res) => buildHTMLFromMarkDown(path)
    .then((html) => {
      res.writeHead(200);
      res.end(html);

    // Catch if something breaks...
    }).catch((err) => {
      msg('error')
      .write('Can\'t build HTML: ', err)
      .reset().write('\n');
    });


// hasMarkdownExtension: check whether a file is Markdown type

const  hasMarkdownExtension = (path) => {
  const fileExtension = path.substr(path.length-3).toLowerCase();
  let extensionMatch = false;

  markdownExtensions.forEach((extension) => {
    if (extension === fileExtension){
      extensionMatch = true;
    }
  });

  return extensionMatch;
}



const compileAndSendDirectoryListing = (path, res) => {
  const urls = fs.readdirSync(path);
  let list = '<ul>\n';

  urls.forEach((subPath) => {
    const dir = fs.statSync(path + subPath).isDirectory();
    let href;
    if (dir){
      href = subPath + '/';
      list += `\t<li class="dir"><a href="${href}">${href}</a></li> \n`;
    } else {
      href = subPath;
      if (subPath.split('.md')[1] === '') {
        list += `\t<li class="md"><a href="${href}">${href}</a></li> \n`;
      } else {
        list += `\t<li class="file"><a href="${href}">${href}</a></li> \n`;
      }
    }
  });

  list += '</ul>\n';

  buildStyleSheet(cssPath).then((css) => {
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
        <script src="http://localhost:35729/livereload.js?snipver=1"></script>`;

    // Log if verbose

    if (flags.verbose) {
      msg('index').write(path).reset().write('\n');
    }

    // Send file
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(html);
    res.end();
  });
}


// http_request_handler: handles all the browser requests

const http_request_handler = (req, res, next) => {
  if (flags.verbose) {
    msg('request')
     .write(unescape(dir)+unescape(req.originalUrl))
     .reset().write('\n');
  }

  const path = unescape(dir)+unescape(req.originalUrl);

  let stat,
      isDir,
      isMarkdown;

  try {
    stat = fs.statSync(path);
    isDir = stat.isDirectory();
    isMarkdown = false;
    if (!isDir) {
      isMarkdown = hasMarkdownExtension(path);
    }
  }
  catch (e) {
    res.writeHead(200, {'Content-Type': 'text/html'});
    boohoo('404').write(path.slice(2)).reset().write('\n');
    res.write("404 :'(");
    res.end();
    return;
  }

  // Markdown: Browser is requesting a Markdown file
  if (isMarkdown) {
    msg('markdown').write(path.slice(2)).reset().write('\n');
    compileAndSendMarkdown(path, res);
  }

  // Index: Browser is requesting a Directory Index
  else if (isDir) {
    msg('dir').write(path.slice(2)).reset().write('\n');
    compileAndSendDirectoryListing(path, res);
  }

  // Other: Browser requests other MIME typed file (handled by 'send')
  else {
    msg('file').write(path.slice(2)).reset().write('\n');
    send(req, path, {root:dir}).pipe(res);
  }
}



// Initialize MarkServ

findOpenPort(PORT_RANGE.LIVE_RELOAD)
  .then(setLiveReloadPort)
  .then(startConnectApp)
  .then(() => {
    if (!flags.port) {
      return findOpenPort(PORT_RANGE.HTTP);
    }
    else {
      return flags.port;
    }
  })
  .then(setHTTPPort)
  .then(startHTTPServer)
  .then(startLiveReloadServer)
  .then(serversActivated);
  
