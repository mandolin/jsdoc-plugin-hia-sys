# JavaScript API and generated artifacts

中文摘要：公开面包括标准JSDoc回调和已导出的_hia嵌套面；下划线不是省略资格审阅的理由。回调操作同一进程的可变状态；原状态/配置可能含私有源码，只能由受信本地代码使用，不能直接作为公开工件。

## Root exports

| Export | Signature and responsibility |
| --- | --- |
| `defineTags` | `(dictionary) → void`; registers enabled tags through the module's shared plugin system, mutating the supplied JSDoc dictionary. |
| `handlers` | Standard JSDoc event-handler object, sharing that system. |
| `_hia` | Existing nested compatibility surface described below. It is included in the public inventory. |

`handlers.beforeParse` `(event) → void` receives filename/source, collecting source and
fragments. `handlers.newDoclet` `(event) → void` enriches event.doclet in place.
`handlers.parseComplete` `(event) → void` resolves references/fields and caches parsed IR.
`handlers.processingComplete` `(event) → void` projects final output and may synchronously
write configured Integration and an opt-in documentation source map. Hook return
values are ignored. Use actual JSDoc 4.0.5 lifecycle order; invoking one hook in
isolation does not establish a complete document or source-range proof.

## Nested compatibility surface

| Property | Input/result and ownership |
| --- | --- |
| `_hia.createPluginSystem` | `(options?) → system`; options contains microPlugins and configOverrides. Defaults, JSDoc environment and explicit overrides are merged in that order. Configured names filter supplied plugin objects, sorted by order (existing fallback 100); enabled setup(context) runs immediately. |
| `_hia.builtInMicroPlugins` | Shared array of built-in plugin objects: code-fragment, source-link, source-preview, doc-i18n, doclet-normalizer, hia-ir-exporter, diagnostics. Objects expose name/order and applicable setup/tag/event hooks; they are executable trusted local objects, not immutable data. |
| `_hia.outputContract` | Namespace of actual output builders/constants, enumerated below. |
| `_hia.getState` | `() → state`; same mutable singleton state, not a clone or public-safe snapshot. |

Each factory system exposes `defineTags(dictionary)`, `handle(hookName, event)`,
`getState()` and `getMicroPlugins()`. The last returns a new array with shared
plugin objects. `handle` invokes callable hooks in order, binds this to each
plugin, and passes `(event, context)`; missing hooks are skipped. Events may be
mutated. State contains config, diagnostics collector, sourceFiles Map,
registries (including sourceFragments Map), doclets, integration and output.
Collectors provide add/list/countBySeverity; list is a shallow array copy.

Context exposes state/config/diagnostics plus addDiagnostic,
ensureDocletHia, markMicroPlugin and attachDiagnostics. These intentionally
retain local references and can mutate metadata/state. Caller-provided
diagnostics, names and settings are trusted local data, not automatically safe
for publication. Do not serialize the raw state or publish arbitrary custom
diagnostics without an explicit privacy policy.

## Output builders

All builder signatures below consume valid plugin state from the factory and,
where listed, a JSDoc doclet array. They are lower-level trusted helpers; they do
not validate arbitrary untrusted state or establish source disclosure permission.

| Property | Behavior |
| --- | --- |
| `_hia.outputContract.CONTRACT_VERSION` | Exact 0.1.0 for the existing standalone/Integration profiles. |
| `_hia.outputContract.INTEGRATION_CONTRACT` | hia-jsdoc-integration. |
| `_hia.outputContract.STANDALONE_CONTRACT` | jsdoc-plugin-hia-sys/standalone. |
| `_hia.outputContract.PRESENTATION_PROFILE_CONTRACT` | documentation-presentation-profile. |
| `_hia.outputContract.PRESENTATION_PROFILE_CONTRACT_VERSION` | Exact current 1.0.0 handoff. |
| `_hia.outputContract.buildIntegrationEntries` | `(doclets, state)` selects/deduplicates Integration entries with node/doclet association. |
| `_hia.outputContract.buildIntegrationOutput` | `(state, doclets)` projects Integration 0.1.0, IR nodes, fragments, field i18n, diagnostic summary and docletNodeMap; applies existing output sanitization. |
| `_hia.outputContract.buildStandaloneOutput` | `(state, doclets)` builds standalone metadata, theme handoff and diagnostic summary. |
| `_hia.outputContract.buildOutputContract` | `(state, doclets)` returns `{standalone, integration}`; a non-array doclet argument becomes empty. |
| `_hia.outputContract.buildPresentationHandoff` | `(state)` projects current closed page/source selections and existing fallback handling; this is not a complete generated profile. |
| `_hia.outputContract.buildThemeContract` | `(state, doclets)` constructs the existing theme metadata handoff. |
| `_hia.outputContract.resolveIntegrationOutputFile` | `(state)` returns configured absolute output or empty string. A relative configured path resolves against process cwd, not a workspace sandbox. |
| `_hia.outputContract.writeIntegrationOutput` | `(state, integrationOutput)` synchronously creates parents and writes JSON with trailing newline if enabled/configured; otherwise returns empty string. Returns the output path after writing. |

## Configuration and generation chain

Configuration aliases are documented in README. Within the factory, defaults
are merged with JSDoc environment aliases and then configOverrides. Object fields
merge recursively and arrays replace with shallow copies. Source preview/link
defaults are disabled in this independent plugin; umbrella presets may explicitly
enable them. Integration defaults enabled but an absent outputFile writes no file;
docSourceMap defaults disabled. i18n defaults enabled with zh-CN fallback, while
the umbrella may choose different explicit defaults.

Canonical @lang and inline <lang> comments populate field-level i18n on doclets;
Integration retains those fields and doclet/node associations. Source metadata
and opt-in doc-source-map@1.1.0 preserve only the producer's verified precision;
unverified references are not promoted. The theme owns topic/page/source assets,
while the shared parser/Portal owns conversion and combined rendering. The plugin
does not independently certify generated TypeScript/Vue/Sass chains or visual UI.

## Errors and Side effects

Setup errors propagate synchronously. Hook failures add HIA_PLUGIN_HOOK_FAILED
with a fixed summary that omits the thrown value/message, including non-Error
throws. With diagnostics.throwOnError true, the exact original thrown value is
rethrown for trusted local debugging; defaults continue with a diagnostic.
Caller-supplied diagnostics may still carry caller content and require separate
privacy review. Raw local errors are not a public producer-result format.

Loading the module creates shared plugin state. Event processing can read
configured local source/resources and write explicitly enabled artifacts. Output
helpers may mutate metadata/state while projecting it; writeIntegrationOutput
performs synchronous I/O. No helper executes in a sandbox. Package version and
wire identities are separate; existing Integration 0.1.0 remains a required
compatibility profile and is not relabeled by a future package 1.0.0 release.
