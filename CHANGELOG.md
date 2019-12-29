# Changelog

- Markserv uses [Semantic Versioning](http://semver.org/)
- Markserv [Keeps a ChangeLog](https://keepachangelog.com/en/1.0.0/)

## [1.17.4] - 2019-12-28

### Added

- Added test for LESS implant. [#99]

### Changed

- Update to latest packages using `npm-check-updates`. Update new linting errors from latest XO package. [#99]

## [1.17.3] - 2019-12-28

### Added

- Added test for file implant. [#98]

### Changed

- Process MathJax with Markdown-It-MathJax. [#93]
- Update all-contibutors table. [#98]

### Removed

- Removed unused Patreon links. [#98]

### Fixed

- Fixed Live-Reload for browsers without Plugin. [#92]
- Documentation fixes. [#97], [#89]

### Security

- NPM audit fix --force. Resulted in AVA update to 2.x requiring package script test runner path change. [#98]

## [1.17.2] - 2019-02-26

### Fixed

- Missing CLI packages. [#79], [#81]

## [1.17.1] - 2019-02-23

### Fixed

- Snyk security audit & fixed CLI launch bug. [#77]

## [1.17.0] - 2019-02-23

### Added

- Added contributors table to README. [#76]

## [1.16.0] - 2019-02-23

### Changed

- Updated CSS page width in stylesheets to reflect GitHubs styles. [#74]
- Replace Commander with Meow. [#75]

### Fixed

- Fixed README CLI command. [#75]

## [1.15.1] - 2018-10-14

### Added

- Added `markserv --livereloadport false` to disable LiveReload. [#65] 
- Added `markserv --browser false` to disable Browser Launch. [#65] 
- Added contributors to `package.json` [#65] 

### Fixed

- Fix launch of relative files and dirs from `markserv` and `readme` commands. [#63]

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

- Updated README after changing github:filter/markserv to github/markserv/markserv (no PR)

## [1.10.0] - 2018-05-22

### Changed

- Updated README after changing github:filter/markserv to github/markserv/markserv (no PR)

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
- Added ChangeLog