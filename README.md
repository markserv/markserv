<p align="center">
	<img alt="Markserv Logo" src="media/markserv-logo.png" width="188"/>
</p>
<p align="center">
	<img alt="Markserv Word Mark" src="media/markserv-word-mark.png" width="360"/>
</p>

> 🏁 serve markdown as html (GitHub style), index directories, and live-reload as you edit

[![Build Status](https://travis-ci.org/F1LT3R/markserv.svg?branch=master)](https://travis-ci.org/F1LT3R/markserv)
[![Coverage Status](https://coveralls.io/repos/github/F1LT3R/markserv/badge.svg?branch=master)](https://coveralls.io/github/F1LT3R/markserv?branch=master)
[![Npm Version](https://img.shields.io/npm/v/markserv.svg)](https://www.npmjs.com/package/markserv)
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)

<p align="center">
	<img alt="Markserv Demo" src="media/markserv-demo.gif" width="100%">
</p>

## 🔥 Features

- Basic HTTP server that indexes directories
- Render Markdown files as HTML on-the-fly
- Markdown rendered with GitHub flavor CSS
- LiveReload your Markdown as you edit and save
- [Just-in-Time Templating](#just-in-time-templating) of Markdown, HTML &amp; LESS
- Syntax highlighting with Github colors

Supporting: [MathJax](tests/mathjax.md), [Chineese Characters](tests/测试.md), [Tables](tests/tables.md), [Heading Anchors](tests/links.md)

## 👩‍💻  Installation

```shell
# NPM
$ npm i -g markserv

# Yarn
$ yarn --global add markserv
```

<a href="https://patreon.com/bePatron?u=9720216"><img width="160" src="https://f1lt3r.io/content/images/2018/04/become_a_patron_button@2x.png"></a>

## 🕹 Usage

To start Markserv from the CLI

```shell
# Open closest README.md
$ readme

# Open file
$ markserv README.md

# Open a directory
$ markserv node_modules
```

<p align="center">
	<img alt="Markserv CLI Splash" src="media/markserv-splash.png" width="100%">
</p>

Start Markserv and open a file or directory.

```shell
# File
$ markserv ./path/to/file.md

# Directory
$ markserv ./
```

Start Markserv and open the closest README.md file in the browser:

```shell
$ readme
```

## ⚡ Live Reload

To see real-time updates as you save your markdown files, you will need to install the LiveReload plugin for your browser:

- [Chrome](https://chrome.google.com/webstore/detail/livereload/jnihajbhpnppcggbcgedagnkighmdlei?hl=en)
- [Firefox](https://addons.mozilla.org/addon/live-reload/)
- [Internet Explorer](https://github.com/dvdotsenko/livereload_ie_extension)

With the Live Reload plugin installed and turned on, you should see the page reloading as you save your Markdown file.

<p align="center">
	<img alt="Markserv Live Reload" src="media/markserv-live-reload.gif" width="100%">
</p>

## 🔗 Markdown Links

You can link to an external Markdown file in the same way that you use GitHub Wiki links. You can use the example code here to see how external links work.

Example code:

```markdown
[Skateboarding Dog!](tests/Linked-Markdown-Example.md)
```

Example link:

[Skateboarding Dog!](tests/Linked-Markdown-Example.md)

## ⏱ Just in Time Templating

Markserv allows you to include nested content. Templates are fetched and rendered when you request them in your browser. The `maxDepth` of includes is set to `10`.

If you would like to look at an example, you can look in the [tests/templates](tests/templates/) directory of this repo.

To see the server output of this templating example:

```shell
$ git clone@github.com/f1lt3r/markserv.git
$ cd markserv
$ markserv tests/templates/index.html
```

### Include Markdown

Note: Any markdown files that you include will be transformed to HTML.

Where `foo/bar/baz/qux.md` equals:

```markdown
## Qux
```

And Markserv renders the following content:

```markdown
# Include Markdown
{markdown: foo/bar/baz/qux.md}
```

The server response will be:

```html
<h1>Include Markdown</h1>
<h2>Foo Bar</h2>
```

### Include HTML

Where `foo/bar/baz/qux.html` equals:

```html
<h2>Qux</h2>
```

And Markserv renders the following content:

```markdown
# Include Markdown
{html: foo/bar/baz/qux.html}
```

The server response will be:

```html
<h1>Include Markdown</h1>
<h2>Qux</h2>
```

### Include LESS

Note: Any LESS files that you include will be transformed to CSS.

Where `foo/bar/baz/qux.css` equals:

```less
@link-color: green;
a {color: @link-color}
```

And Markserv renders the following content:

```html
<style>{less: foo/bar/baz/qux.css}</style>
```

The server response will be:

```css
<style>
a {
  color: #008000;
}
</style>
```

## 🎌 Flags

To list the options/flags for the markserv CLI tool:

```shell
$ markserv --help
```

### Changing the HTTP Port

You can change the HTTP Port like this:

```shell
markserv -p 80
```

### Making Markserv available to external networks

In some cases `localhost` might be the address on which the server is listening, in which case it is hard to make the site available to external networks even with the right IP. Use the following as an example to make sure the server is accessible from external networks:

```shell
markserv -p 8642 -a 0.0.0.0
```

Above example runs the server on port `8642` and it can be accessed from external networks using public IP of the machine on which the server is running. If you want the server to keep running in a seperate thread even when you log out, use this:

```shell
nohup markserv -p 8642 -a 0.0.0.0 &
```

This will make the server instance persistent and will be available to access even when you log out or even when your ssh session closes (in case you are accessing a remote machine through ssh to set up `markserv` server)

## 💘 Credits

### Logo Credits

| Icon | Name | Creator |
| --- | --- | --- |
| ![Markdown Icon](https://cdn0.iconfinder.com/data/icons/octicons/1024/markdown-32.png) | **Markdown Icon** | [Octicon Icons by Github](https://www.iconfinder.com/icons/298823/markdown_icon#size=32) |
| ![File Icon](https://cdn4.iconfinder.com/data/icons/linecon/512/file-32.png) | **File icon** | [Linecon by W3 Creative Labs](https://www.iconfinder.com/icons/370083/document_file_files_page_paper_sheet_icon#size=32) |
| ![Folder Icon](https://cdn1.iconfinder.com/data/icons/hawcons/32/699086-icon-94-folder-32.png) | **Folder icon** | [Hawcons by Yannick Lung](https://www.iconfinder.com/icons/314937/folder_icon#size=32) |
