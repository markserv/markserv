# Changelog

- Markserv uses [Semantic Versioning](http://semver.org/)
- Markserv [Keeps a ChangeLog](https://keepachangelog.com/en/1.0.0/)

## [Unreleased]

## [1.20.1] - 2026-09-25

### Fixed

- `npm test` on Node 24+ (legacy `util.isDate`/`util.isRegExp` removed): `xo` crashed before ava ever ran because `eslint-plugin-ava` → `deep-strict-equal` → `core-assert` call those removed APIs in `_deepEqual`. A `patch-package` patch (`patches/core-assert+0.2.1.patch`) replaces them with `instanceof Date` / `instanceof RegExp` (identical semantics) and is applied on `postinstall`: [8920788](https://github.com/markserv/markserv/commit/8920788)

### Security

- Path traversal (CWE-22): request paths and implant file reads (`{file:}`, `{markdown:}`, `{html:}`, `{less:}`) are now confined to the served root. Out-of-root request paths return `403`, hot-reload no longer pushes out-of-root content, and escaping implants are refused instead of inlined into rendered pages or hot-reload pushes (#139): PR [#147](https://github.com/markserv/markserv/pull/147)

## [1.20.0] - 2026-09-22

### Added

- Mermaid diagram support: ` ```mermaid ` fences render as client-side diagrams (Mermaid v10). The library lazy-loads from the same CDN as MathJax only on pages that contain a mermaid fence, so other pages cost nothing, and diagrams degrade to their source text when the CDN is unreachable: [75acf21](https://github.com/markserv/markserv/commit/75acf21)
- Diagrams follow the page theme (dark/light/solarized) and re-render when the theme is toggled: [75acf21](https://github.com/markserv/markserv/commit/75acf21)
- Diagrams re-render on hot-reload, including when a mermaid fence is added to a previously plain page: [75acf21](https://github.com/markserv/markserv/commit/75acf21)

## [1.19.1] - 2026-03-07

### Fixed

- WebSocket reconnection no longer overwhelms the browser when the server is stopped. Previously, `setInterval` calls stacked exponentially on disconnect, causing "not responding" hangs. Now uses `setTimeout` with exponential backoff (1s → 30s cap, max 20 retries): [cbc1f9f](https://github.com/markserv/markserv/commit/cbc1f9f)

## [1.19.0] - 2026-03-02

### Added

- Body width slider: adjustable slider next to the theme toggle button controls the `<body>` width from 0 to viewport width: [e07bd4a](https://github.com/markserv/markserv/commit/e07bd4a)
- Pixel tooltip appears above the slider thumb while dragging or using arrow keys: [e07bd4a](https://github.com/markserv/markserv/commit/e07bd4a)
- Width persists per project via localStorage, keyed by the served root directory: [e07bd4a](https://github.com/markserv/markserv/commit/e07bd4a)
- Double-click the slider to reset to the default width (978px): [e07bd4a](https://github.com/markserv/markserv/commit/e07bd4a)
- Theme-aware slider styling with custom track and thumb colors for all four themes: [e07bd4a](https://github.com/markserv/markserv/commit/e07bd4a)

### Changed

- Theme toggle button slightly smaller (40px → 34px) for a cleaner look: [e07bd4a](https://github.com/markserv/markserv/commit/e07bd4a)
- Solarized page border slightly brighter for better visibility: [e07bd4a](https://github.com/markserv/markserv/commit/e07bd4a)
- Width slider and theme button vertically aligned: [e07bd4a](https://github.com/markserv/markserv/commit/e07bd4a)
- Width control hidden in print view alongside theme toggle: [e07bd4a](https://github.com/markserv/markserv/commit/e07bd4a)

## [1.18.0] - 2026-03-01

### Added

- Built-in WebSocket hot-reload: content updates in-place without full page reload and without any browser plugin: [de3cabe](https://github.com/markserv/markserv/commit/de3cabe)
- Dark, light, synthwave, and solarized themes with in-browser toggle button (persists via localStorage): [d932127](https://github.com/markserv/markserv/commit/d932127)
- `--hotreload` / `--no-hotreload` flag to enable/disable hot-reload: [de3cabe](https://github.com/markserv/markserv/commit/de3cabe)
- `--light`, `--synthwave`, and `--theme` CLI flags for theme selection (e.g. `--theme solarized`): [d932127](https://github.com/markserv/markserv/commit/d932127)
- Solarized Dark theme with colors from [Better Solarized Dark](https://github.com/edheltzel/vscode-better-solarized), including highlight.js syntax highlighting: [f55acc7](https://github.com/markserv/markserv/commit/f55acc7)
- Server-side initial stylesheet selection so `--theme` / `--light` / `--synthwave` render correctly from first paint: [b7e60a8](https://github.com/markserv/markserv/commit/b7e60a8)

### Changed

- Hot-reload uses `ws` package over WebSocket instead of `livereload` + `connect-livereload` on a separate port: [de3cabe](https://github.com/markserv/markserv/commit/de3cabe)
- WebSocket port is auto-found via `get-port`, supporting multiple simultaneous instances: [de3cabe](https://github.com/markserv/markserv/commit/de3cabe)
- HTTP port auto-finds a free port when no explicit `--port` is given, avoiding conflicts with other instances: [73778b1](https://github.com/markserv/markserv/commit/73778b1)
- File watching uses Node.js built-in `fs.watch` (recursive) with 150ms debounce: [de3cabe](https://github.com/markserv/markserv/commit/de3cabe)
- Updated README to document hot-reload and themes: [b75d36a](https://github.com/markserv/markserv/commit/b75d36a)

### Fixed

- Fixed path resolution when launched from external directories (e.g. from fstop or other tools): [77272b6](https://github.com/markserv/markserv/commit/77272b6)
- Fixed misplaced folder icon in directory listing header: [4263dda](https://github.com/markserv/markserv/commit/4263dda)

### Removed

- Removed `livereload` and `connect-livereload` dependencies: [de3cabe](https://github.com/markserv/markserv/commit/de3cabe)
- Removed `--livereloadport` CLI flag (replaced by `--hotreload`): [de3cabe](https://github.com/markserv/markserv/commit/de3cabe)

## [1.17.4] - 2019-12-28

### Added

- Added test for LESS implant: PR [#99](https://github.com/markserv/markserv/pull/99)

### Changed

- Update to latest packages using `npm-check-updates`. Update new linting errors from latest XO package: PR [#99](https://github.com/markserv/markserv/pull/99)

## [1.17.3] - 2019-12-28

### Added

- Added test for file implant: PR [#98](https://github.com/markserv/markserv/pull/98)

### Changed

- Process MathJax with Markdown-It-MathJax: PR [#93](https://github.com/markserv/markserv/pull/93)
- Update all-contibutors table: PR [#98](https://github.com/markserv/markserv/pull/98)

### Removed

- Removed unused Patreon links: PR [#98](https://github.com/markserv/markserv/pull/98)

### Fixed

- Fixed Live-Reload for browsers without Plugin: PR [#92](https://github.com/markserv/markserv/pull/92)
- Documentation fixes: PR [#97](https://github.com/markserv/markserv/pull/97), PR [#89](https://github.com/markserv/markserv/pull/89)

### Security

- NPM audit fix --force. Resulted in AVA update to 2.x requiring package script test runner path change: PR [#98](https://github.com/markserv/markserv/pull/98)

## [1.17.2] - 2019-02-26

### Fixed

- Missing CLI packages: PR [#79](https://github.com/markserv/markserv/pull/79), PR [#81](https://github.com/markserv/markserv/pull/81)

## [1.17.1] - 2019-02-23

### Fixed

- Snyk security audit & fixed CLI launch bug: PR [#77](https://github.com/markserv/markserv/pull/77)

## [1.17.0] - 2019-02-23

### Added

- Added contributors table to README: PR [#76](https://github.com/markserv/markserv/pull/76)

## [1.16.0] - 2019-02-23

### Changed

- Updated CSS page width in stylesheets to reflect GitHubs styles: PR [#74](https://github.com/markserv/markserv/pull/74)
- Replace Commander with Meow: PR [#75](https://github.com/markserv/markserv/pull/75)

### Fixed

- Fixed README CLI command: PR [#75](https://github.com/markserv/markserv/pull/75)

## [1.15.1] - 2018-10-14

### Added

- Added `markserv --livereloadport false` to disable LiveReload: PR [#65](https://github.com/markserv/markserv/pull/65)
- Added `markserv --browser false` to disable Browser Launch: PR [#65](https://github.com/markserv/markserv/pull/65)
- Added contributors to `package.json`: PR [#65](https://github.com/markserv/markserv/pull/65)

### Fixed

- Fix launch of relative files and dirs from `markserv` and `readme` commands: PR [#63](https://github.com/markserv/markserv/pull/63)

## [1.13.2] - 2018-09-14

### Fixed

- Clean `npm audit`: PR [#59](https://github.com/F1LT3R/markserv/pull/59)

## [1.13.1] - 2018-09-14

### Fixed

- Check for updates only when online: PR [#56](https://github.com/F1LT3R/markserv/pull/56)

## [1.13.0] - 2018-09-14

### Added

- Mobile Font - does not look squished on smaller screens: PR [#55](https://github.com/F1LT3R/markserv/pull/55)

### Changed

- Removed useless CSS, and border from printing and mobile view: PR [#55](https://github.com/F1LT3R/markserv/pull/55)

## [1.12.0] - 2018-05-23

### Changed

- Updated boot - splash is now called from cli and readme to so the user can see that markserv is loading: PR [#53](https://github.com/F1LT3R/markserv/pull/53)

### Added

- Auto Upgrade - user gets option to upgrade to latest when starting Markserv: PR [#52](https://github.com/F1LT3R/markserv/pull/52)

## [1.11.0] - 2018-05-22

### Changed

- Updated README after changing github:filter/markserv to github/markserv/markserv: [5cb8a25](https://github.com/markserv/markserv/commit/5cb8a25)

## [1.10.0] - 2018-05-22

### Changed

- Updated README after changing github:filter/markserv to github/markserv/markserv: [5cb8a25](https://github.com/markserv/markserv/commit/5cb8a25)

## [1.9.0] - 2018-05-21

### Changed

- Better breadcrumbs: PR [#52](https://github.com/F1LT3R/markserv/pull/52)
- All folders now use the same icon, to reduce visual noise: PR [#52](https://github.com/F1LT3R/markserv/pull/52)

### Added

- Sanitize urls in breadcrumbs: PR [#52](https://github.com/F1LT3R/markserv/pull/52)
	+ Thanks @ChenYingChou PR [#48](https://github.com/F1LT3R/markserv/pull/48)
- Error page with back links: PR [#52](https://github.com/F1LT3R/markserv/pull/52)
	+ Thanks @ChenYingChou PR [#48](https://github.com/F1LT3R/markserv/pull/48)
- Slugify Links (w/ Emojis) PR [#51](https://github.com/F1LT3R/markserv/pull/51)
	+ Thanks @ChenYingChou PR [#48](https://github.com/F1LT3R/markserv/pull/48)

## [1.8.0] - 2018-05-13

### Added

- Emoji support with `mdItEmoji`. Example: `:fire:` now renders as :fire:
	+ Thanks @ChenYingChou PR [#48](https://github.com/F1LT3R/markserv/pull/48/files)
- Indent size 4 to `.editorconfig` - @ChenYingChou PR [#48](https://github.com/F1LT3R/markserv/pull/48/files)

## [1.7.3] - 2018-05-13

### Fixed

- Emojis require \:colon-syntax\: to render correctly on NPMJS.org
	+ Thanks @ChenYingChou PR [#48](https://github.com/F1LT3R/markserv/pull/48/files)
- Added ChangeLog: [c3350fb](https://github.com/markserv/markserv/commit/c3350fb)