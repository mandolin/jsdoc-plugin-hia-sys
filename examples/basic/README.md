# Basic Example

This example shows the core plugin features:

- JSDoc plugin loading.
- `@codeblock`, `@codeblockend` and `@coderef`.
- Source `definedIn`, `primaryBlock`, link and preview metadata.
- `@lang`, `<lang>` inline segments and resource-backed `doc-i18n`.
- HIA Integration JSON output.

Run:

```bash
npm run test:jsdoc
```

Expected generated files under `examples/basic/out`:

- Standard JSDoc output files.
- `hia-integration.json` from `opts.hia.integration.outputFile`.

Generated files are test artifacts and should not be committed.
