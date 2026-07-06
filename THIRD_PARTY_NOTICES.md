# Third Party Notices

## Runtime Dependencies

This package has no bundled runtime dependency besides Node.js built-ins.

## Peer Dependencies

- `jsdoc` `^4.0.0` (`Apache-2.0`)

`jsdoc` is expected to be installed by the consuming project or used through this package's development environment.

## Development Dependencies

- `jsdoc` `^4.0.5` (`Apache-2.0`)

## License Audit

Run the direct dependency audit before release:

```bash
npm run license:audit
```

Allowed direct dependency licenses are MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause and ISC. GPL, AGPL, LGPL, SSPL, BUSL and BSL-family licenses require explicit approval before use.

New external dependencies must update this notice file, `package.json`, `scripts/check-license-audit.cjs` and `RELEASE_CHECKLIST.md`.

## Assets

No third-party visual assets, fonts, images, or copied theme code are bundled.

## Legacy Material

Older `jsdoc-plugin-hia` ideas were used as design reference only. This package is a new implementation and does not copy source files from the old repository.
