<img src="media/markserv-logo.png" width="188">

# markserv

> `markserv` serves Markdown files as GitHub style HTML and LiveReloads your changes in the browser while you edit

[![Build Status](https://travis-ci.org/F1LT3R/markserv.svg?branch=master)](https://travis-ci.org/F1LT3R/markserv)
[![Coverage Status](https://coveralls.io/repos/github/F1LT3R/markserv/badge.svg?branch=master)](https://coveralls.io/github/F1LT3R/markserv?branch=master)
[![Npm Version](https://img.shields.io/npm/v/markserv.svg)](https://www.npmjs.com/package/markserv)
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)

Support the development of Markserv.

<a href="https://patreon.com/bePatron?u=9720216"><img width="160" src="https://f1lt3r.io/content/images/2018/04/become_a_patron_button@2x.png"></a>

## Features

 - Basic HTTP server that indexes directories
 - Render Markdown files as HTML on-the-fly
 - Markdown rendered with GitHub flavor CSS
 - LiveReload your Markdown as you edit and save
 - GitHub style rendering w/ Syntax Rendering

Supporting: [MathJax](tests/mathjax.md), [Chineese Characters](tests/测试.md), [Tables](tests/tables.md), [Heading Anchors](tests/links.md)

## Example

Click this image to see the animated example:

[![http://imgur.com/a/b8Cje](http://i.imgur.com/FrO2ilv.png)](http://i.imgur.com/D4MFCMr.gif)

## Installation

```shell
npm install markserv -g
```

## Usage

Change to the directory of your CLI

```shell
cd path/to/serve/from
```

Start the HTTP markdown server in the current directory on port 8080

```shell
markserv
```

You should see something like this:

![markserv CLI output](http://i.imgur.com/Ii8ydEN.png)

Click on the address link such as [http://0.0.0.0:8080](http://0.0.0.0:8080) in your terminal to open the browser and index the directory:

![Showing Indexes in markserv](http://i.imgur.com/fjMPutk.png)

In the browser, click on a Markdown file, like "README.md", and markserv should render the Markdown file as HTML in your browser.

![Expected output](http://i.imgur.com/yWv8dGZ.png)

Watch your CLI for server hints:

 - Diretory Indexes
 - Files Served
 - Markdown file updates
 - Errors

![markserv CLI being chatty](http://i.imgur.com/TuO78gt.png)

### Realtime/Live editing

Edit your markdown file, and you should now see the page reloading as you save your Markdown file. It should save your scroll position, which helps when editing extemely large documents.

[![http://imgur.com/a/b8Cje](http://i.imgur.com/FrO2ilv.png)](http://i.imgur.com/D4MFCMr.gif)

### Linking to an external Markdown file

You can link to an external Markdown file in the same way that you use GitHub Wiki links. You can use the example code here to see how external links work.

Example code:

```markdown
[Skateboarding Dog!](tests/Linked-Markdown-Example.md)
```

Example link:

[Skateboarding Dog!](tests/Linked-Markdown-Example.md)

## Options/Flags

To list the options/flags for the markserv CLI tool:

```shell
markserv --help
```

### Changing the HTTP Directory

You can serve content from a different path using the following command:

```shell
markserv -h /path/to/dir
```

### Changing the HTTP Port

You can change the HTTP Port like this:

```shell
markserv -p 80
```

### Making it available to external networks

In some cases `localhost` might be the address on which the server is listening, in which case it is hard to make the site available to external networks even with the right IP. Use the following as an example to make sure the server is accessible from external networks:

```shell
markserv -p 8642 -a 0.0.0.0
```

Above example runs the server on port `8642` and it can be accessed from external networks using public IP of the machine on which the server is running. If you want the server to keep running in a seperate thread even when you log out, use this:

```shell
nohup markserv -p 8642 -a 0.0.0.0 &
```

This will make the server instance persistent and will be available to access even when you log out or even when your ssh session closes (in case you are accessing a remote machine through ssh to set up `markserv` server)


## Pre-Requisites

 - Node.js & NPM
 - Web Browser
 - Text Editor

## How does it work?

markserv watches for file updates to the markdown file, and to the CSS directory, and automatically reloads the Markdown page via LiveReload. markserv remembers the scroll position you were at in the web browser, and reloads the page with the same scroll position when you make changes.

markserv was built for working on projects that contain a combination of web content and Markdown, where the markdown gets reloaded on the fly as the file is saved in your text editor. But it also serves regular HTTP content, replacing the need for a more bulky web server setup using MAMP, etc.


## Why Does It Exist?

markserv is designed to replace a Apache + Marked2 workflow.

I purchased [Marked2](http://marked2app.com/) after seeing a colleage use it to edit markdown content. It looked awesome, but it felt clunky. And it didn't integrate with my almost constant CLI usage. While I found Marked2 to have a very well-rounded feature set, it was simply too slow, and too memory intensive.

## Credits

### Logo Credits

![Markdown Icon](https://cdn0.iconfinder.com/data/icons/octicons/1024/markdown-32.png)

**Markdown Icon** | [Octicon Icons by Github](https://www.iconfinder.com/icons/298823/markdown_icon#size=32)

![File Icon](https://cdn4.iconfinder.com/data/icons/linecon/512/file-32.png)

**File icon** | [Linecon by W3 Creative Labs](https://www.iconfinder.com/icons/370083/document_file_files_page_paper_sheet_icon#size=32)

![Folder Icon](https://cdn1.iconfinder.com/data/icons/hawcons/32/699086-icon-94-folder-32.png)

**Folder icon** | [Hawcons by Yannick Lung](https://www.iconfinder.com/icons/314937/folder_icon#size=32)
