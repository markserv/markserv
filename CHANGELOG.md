# Changelog

- Markserv uses [Semantic Versioning](http://semver.org/)
- Markserv [Keeps a ChangeLog](https://keepachangelog.com/en/1.0.0/)

## [1.12.0] - 2018-05-23

### Changed

- Updated boot - splash is now called from cli and readme to so the user can see that markserv is loading: PR [#55](https://github.com/F1LT3R/markserv/pull/53)

### Added

- Auto Upgrade - user gets option to upgrade to latest when starting Markserv: PR [#52](https://github.com/F1LT3R/markserv/pull/52)

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