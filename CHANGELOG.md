# Changelog

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
