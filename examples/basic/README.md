# Basic Example

This example verifies the first JPHS planning-cycle feature set:

- JSDoc plugin loading.
- `@codeblock`, `@codeblockend` and `@coderef`.
- Source link and source preview metadata.
- Inline and resource-backed `doc-i18n`.
- HIA Integration JSON output.

Run:

```bash
npm run test:jsdoc
```

Expected generated files under `examples/basic/out`:

- Standard JSDoc output files.
- `hia-integration.json` from `opts.hia.integration.outputFile`.

Generated files are test artifacts and should not be committed.
