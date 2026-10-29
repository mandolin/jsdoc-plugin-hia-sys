# Changelog

## Unreleased — Supported runtime baseline

- 源清单、锁与本地/CI运行基线对齐Node.js 22.23.4和24.22.1，两平台门禁及拒绝漂移检查同步；旧已发布工件不改写，本次不发布npm。
- Align current source, locks and local/CI runtime floors on Node.js 22/24, with Windows/Ubuntu checks and drift rejection. Existing published archives remain separate; no npm release is announced.


## Unreleased — Presentation handoff 1.0.0

- Declare the current neutral presentation identity in the metadata handoff. The descriptor remains distinct from a complete profile or source publication consent; package versions and published archives are unchanged.
- Add a default-off independent `doc-source-map@1.1.0` sidecar paired to final integration nodes. Only verified native JSDoc AST ranges carry exclusive UTF-16 coordinates; unverifiable nodes retain range-free entries, and the legacy integration output is unchanged.
- Preserve full declaration ranges for JSDoc 4.0.5 assignment, object-property, variable, and default-export wrappers when the selected inner AST node directly belongs to the original wrapper. Same-endpoint guesses and virtual doclets remain range-free.

## 0.1.3 - 2026-07-30

### Added

- Optional `hia-jsdoc-presentation@0.1.0` metadata for deterministic JSDoc identity and same-page containment hints consumed by companion themes.
- Presentation metadata projection in standalone and HIA Integration output without coupling to HTML structure.

## 0.1.2 - 2026-07-27

### Fixed

- Stop JavaScript primary-block inference from treating object literals inside array-returning arrow expressions as function bodies.
- Keep the inferred source range bounded to the declaration statement instead of consuming the following JSDoc block.

## 0.1.1 - 2026-07-15

### Fixed

- Mark `<lang>` field translations as direct locale coverage and preserve their actual resolution in generated metadata.

## Unreleased

### Added

- Field-level text i18n metadata at `doclet.hia.i18n.fields`.
- `@lang` doclet description blocks and XML-like `<lang>` inline segments.
- Source metadata at `doclet.hia.source.definedIn` and `doclet.hia.source.primaryBlock`.
- Source metadata contract fields for `kind`, `referenceKind`, `model` and `modelVersion`.
- JavaScript declaration range parser for `doclet.hia.source.primaryBlock`, with heuristic fallback.

### Changed

- `@hiaText` and `@hiaBlock` remain available as compatibility inputs, while all new usage moves to canonical `@lang` and inline `<lang>`.
- `@coderef` output is modeled as extra source references rather than the only source metadata entry point.
- The default source preview range strategy is now `parser-js`.
- Release metadata now declares public scoped publishing and records the publish strategy/checklist.
- HIA Integration output now omits empty synthetic doclets, normalizes source link open modes and emits relative localization resource records.

## 0.1.0 - 2026-07-05

### Added

- JSDoc plugin entry with internal micro-plugin runner.
- `@codeblock`, `@codeblockend` and `@coderef` source fragment flow.
- Source link and source preview metadata.
- `doc-i18n` metadata with inline text, external resources, fallback and generation modes.
- Standalone output contract for `jsdoc-theme-hia`.
- HIA Integration output contract and optional JSON file output.
- Diagnostics collection and fixture coverage.

### Notes

- This is an early public package for standalone JSDoc usage and HIA metadata experiments.
- Public API stability is not guaranteed yet.
