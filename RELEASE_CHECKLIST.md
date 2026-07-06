# Release Checklist

## Scope

Package: `@mandolin/jsdoc-plugin-hia-sys`

Version: `0.1.0`

## Required Checks

- [ ] `npm run check:syntax`
- [ ] `npm test`
- [ ] `npm run test:jsdoc`
- [ ] `npm run clean:examples`
- [ ] `npm run governance:check`
- [ ] `npm run release:check`
- [ ] `npm run test:all`
- [ ] `npm run release:gate`
- [ ] `npm pack --dry-run --json`
- [ ] GitHub Actions CI has passed on Node.js 18.x and 20.x for the release commit.

## Manual Review

- [ ] README describes Standalone and HIA Integration use.
- [ ] `examples/basic/README.md` explains the example.
- [ ] `src/runtime/output-contract.cjs` matches current output shape.
- [ ] `THIRD_PARTY_NOTICES.md` is current.
- [ ] `CHANGELOG.md` has the target version.
- [ ] `package.json` keeps `publishConfig.access` as `public`.
- [ ] Dry-run artifact contents are limited to package sources, examples and release docs.
- [ ] `examples/basic/out` is not present.
- [ ] No `.tgz` dry-run tarball remains.

## Publish Strategy

- Keep version `0.1.0` for the first public package unless registry preflight shows it is already published.
- Use `npm publish --access public` for the scoped package.
- If publishing before W-P3.5 HIA Integration hardening, publish with `--tag next` and avoid promoting to `latest` until the integration producer contract is confirmed.

## Current Boundaries

- API stability is not final.
- The HIA Integration IR is a draft contract, not final core schema.
- This package supports JSDoc 4.x in the current cycle.
