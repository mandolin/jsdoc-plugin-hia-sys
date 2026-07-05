# Release Checklist

## Scope

Package: `jsdoc-plugin-hia-sys`

Version: `0.1.0`

## Required Checks

- [ ] `npm run check:syntax`
- [ ] `npm test`
- [ ] `npm run test:jsdoc`
- [ ] `npm run clean:examples`
- [ ] `npm run release:check`
- [ ] `npm run test:all`
- [ ] `npm pack --dry-run`

## Manual Review

- [ ] README describes Standalone and HIA Integration use.
- [ ] `examples/basic/README.md` explains the example.
- [ ] `docs/contracts/jsdoc-hia-output-contract.md` matches current output shape.
- [ ] `THIRD_PARTY_NOTICES.md` is current.
- [ ] `CHANGELOG.md` has the target version.
- [ ] `examples/basic/out` is not present.
- [ ] No `.tgz` dry-run tarball remains.

## Current Boundaries

- API stability is not final.
- The HIA Integration IR is a draft contract, not final core schema.
- This package supports JSDoc 4.x in the current cycle.
