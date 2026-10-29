# Moving to the 1.0.0 source candidate

中文摘要：源码候选版本为1.0.0，不代表npm已发布。升级前核对实际包来源；既有Integration/standalone wire仍0.1.0，呈现1.0.0/源码映射1.1.0与精确旧读保持，不批量给历史工件换号。

## Package and wire identities

The package and emitted pluginVersion/doclet metadata now identify 1.0.0.
Integration remains hia-jsdoc-integration@0.1.0; standalone and theme handoffs
retain their existing profiles. Documentation source maps remain opt-in 1.1.0;
unsupported parser/range evidence is not promoted to verified precision.
Consumers must distinguish package/tool version from wire/model versions.

Standard defineTags/handlers and the previously exported nested _hia surface
remain present; see [API.md](API.md) for mutation/reference/error boundaries.
Do not publish raw singleton state, configuration or caller-supplied diagnostics.
Generated hook errors now omit the original thrown message; throwOnError still
rethrows the exact original value for trusted local callers. Use diagnostic code
rather than parsing the old raw-error suffix.

## Runtime and comments

Use Node.js ^22.23.4 or ^24.22.1 and the tested JSDoc 4.0.5. Historical published
archives keep their original metadata. Current canonical documentation uses
@lang and inline <lang>; earlier compatibility inputs are retained according to
their existing reader behavior. No complete language/AST, UI visual acceptance,
source permission or multi-host execution guarantee follows from the package bump.

## Before publication

Use source-matched original tarballs for candidate consumption. Do not assume
registry installation of 1.0.0 before an explicit publication receipt. Actual
publication/provenance and target adoption remain separate release conditions.
