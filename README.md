# @mandolin/jsdoc-plugin-hia-sys

HIA metadata plugin for JSDoc.

`@mandolin/jsdoc-plugin-hia-sys` extends JSDoc with structured metadata for source references, source previews, multilingual documentation and optional HIA integration output. It can be used as a standalone JSDoc plugin in ordinary JavaScript projects, or as a JSDoc adapter in a larger HIA documentation pipeline.

GitHub: <https://github.com/mandolin/jsdoc-plugin-hia-sys>

## Features

- Adds `doclet.hia` metadata to JSDoc doclets.
- Supports source fragment markers with `@codeblock`, `@codeblockend` and `@coderef`.
- Generates `definedIn`, `primaryBlock`, source link and source preview metadata for themes.
- Supports `@lang`, XML-like `<lang>` inline segments and resource-backed multilingual documentation metadata.
- Provides a small internal micro-plugin pipeline for feature composition.
- Can write an HIA Integration JSON file for downstream tooling.
- Can opt in to a separate `doc-source-map@1.1.0` artifact with verified JSDoc AST ranges.
- Includes diagnostics for missing fragments, missing translations and related metadata issues.

## Install

```bash
npm install --save-dev jsdoc @mandolin/jsdoc-plugin-hia-sys
```

For projects that also need the companion HTML theme:

```bash
npm install --save-dev jsdoc @mandolin/jsdoc-plugin-hia-sys @mandolin/jsdoc-theme-hia
```

## Basic Usage

Add the plugin to your JSDoc configuration:

```json
{
  "plugins": ["node_modules/@mandolin/jsdoc-plugin-hia-sys/src/index.cjs"],
  "source": {
    "include": ["src"]
  },
  "opts": {
    "destination": "docs/api",
    "recurse": true,
    "hia": {
      "mode": "standalone"
    }
  }
}
```

Configuration can be placed under `opts.hia`, `hia`, `opts["jsdoc-plugin-hia-sys"]`, `opts["@mandolin/jsdoc-plugin-hia-sys"]`, `jsdoc-plugin-hia-sys` or `@mandolin/jsdoc-plugin-hia-sys`.

## Source Metadata

Each doclet receives source metadata when JSDoc provides file and line information:

- `doclet.hia.source.definedIn`: relative path, line, language and source link metadata.
- `doclet.hia.source.primaryBlock`: a source preview block for the doclet itself. The default range strategy uses a JavaScript declaration parser with heuristic fallback.
- `doclet.hia.source.references`: extra source fragments referenced with `@coderef`.

Enable source links and previews in JSDoc configuration:

```json
{
  "opts": {
    "hia": {
      "source": {
        "basePath": ".",
        "mode": "all",
        "link": {
          "enabled": true,
          "rootUrl": "https://github.com/example/project/blob/main",
          "openMode": "new-tab"
        },
        "preview": {
          "enabled": true,
          "defaultExpanded": false,
          "rangeStrategy": "parser-js"
        }
      }
    }
  }
}
```

## Source References

Mark reusable source fragments in code:

```js
function greet(name) {
  /* @codeblock GREET_BODY */
  const message = `Hello, ${name}`;
  return message;
  /* @codeblockend GREET_BODY */
}
```

Reference the fragment from a JSDoc comment:

```js
/**
 * Greets a user.
 *
 * @example <caption>Basic greeting</caption>
 * @coderef GREET_BODY
 */
function greet(name) {}
```

The plugin writes reference data to `doclet.hia.source.references`, including source link and preview metadata when enabled.

## Presentation Metadata

Version `0.1.3` adds the optional JPHS/JTH companion profile at
`doclet.hia.presentation`. It contains a deterministic `stableId`, a public
`parentLongname` and a navigation group derived only from JSDoc `kind`,
`longname` and `memberof`.

The profile is additive and intended for companion themes. It does not define
inheritance or composition, does not expose file paths/source bodies/AST data,
and does not prescribe HTML structure. Consumers must tolerate a missing or an
unknown profile version. JTH uses it as a same-page navigation hint and falls
back to plain JSDoc `memberof` when the profile is absent.

For the `0.1.x` JPHS/JTH pair, a compatible consumer may use the hint only
when `identity.kind` and `identity.longname` match the current JSDoc doclet and
`stableId` is exactly `jsdoc:${kind}:${longname}`. A stale or malformed hint is
ignored, so the consumer can retain its ordinary JSDoc `memberof` fallback.
The companion `stableId` is metadata identity; it does not replace a theme's
own public HTML fragment-anchor compatibility surface.

## Multilingual Metadata

Use `@lang` for localized doclet descriptions:

```js
/**
 * @hiaKey user.greet
 * @hiaPath api.user.greet
 * @lang zh-CN 问候一个用户。
 * @lang en Greets a user.
 */
function greet(name) {}
```

Use `<lang>` inside any description text field:

```js
/**
 * Greets a <lang key="greet.target"><zh-CN>用户</zh-CN><en>user</en></lang>.
 *
 * @param {string} name User <lang key="greet.param.name"><zh-CN>名称</zh-CN><en>name</en></lang>.
 */
function greet(name) {}
```

The plugin writes field-level data to `doclet.hia.i18n.fields`. During the output-model transition it also keeps the older `doclet.hia.i18n.localized` and generation fields. The canonical syntax for all new usage is `@lang` plus inline `<lang>`. The earlier `@hiaText` and `@hiaBlock` tags remain accepted as compatibility inputs and are not yet deprecated.

External resource files are also supported:

```json
{
  "opts": {
    "hia": {
      "i18n": {
        "enabled": true,
        "defaultLocale": "zh-CN",
        "fallbackLocale": "en",
        "locales": ["zh-CN", "en"],
        "mode": "runtimeSwitch",
        "resources": ["docs/i18n/docs.hia-i18n.json"]
      }
    }
  }
}
```

Resource files can be grouped by locale:

```json
{
  "zh-CN": {
    "user.greet": {
      "text": "问候一个用户。"
    }
  },
  "en": {
    "user.greet": {
      "text": "Greets a user."
    }
  }
}
```

## HIA Integration Output

Standalone mode enriches JSDoc doclets for themes and local tooling. HIA Integration mode additionally writes a JSON artifact for downstream processing:

```json
{
  "opts": {
    "hia": {
      "mode": "hiaIntegration",
      "integration": {
        "enabled": true,
        "outputFile": "docs/api/hia-integration.json"
      }
    }
  }
}
```

The integration artifact currently contains IR nodes, source fragments, localization resources, diagnostics, a doclet-to-node map and the optional presentation hint.

Current integration output keeps user-facing doclets only, omitting empty JSDoc synthetic nodes created by module/export inference. Source links use `same-tab` or `new-tab`; legacy `currentPage` input is normalized when metadata is produced. Resource records use relative `external-resource` entries, and generated integration JSON does not expose local `filePath` values.

## Independent Documentation Source Map

Set `opts.hia.docSourceMap.enabled` to write `hia-doc-source-map.json` beside the configured integration output:

```json
{
  "opts": {
    "hia": {
      "source": { "basePath": "." },
      "integration": {
        "enabled": true,
        "outputFile": "docs/api/hia-integration.json"
      },
      "docSourceMap": { "enabled": true }
    }
  }
}
```

The option is off by default and requires an integration output file. The separate map uses the `doc-source-map` contract at version `1.1.0`; enabling it does not change the existing integration JSON. Its entries pair with the doclets selected for that integration output. An exact source range currently requires the verified JSDoc `4.0.5` parser, a selected doclet with a directly matching native AST range or a proven native `AssignmentExpression`, `Property`, `VariableDeclarator`, or `ExportDefaultDeclaration` parent-child relationship and matching original event node ID in a `.js`, `.mjs`, `.cjs` or `.jsx` file, final parser input matching the file on disk without JSDoc pretreatment, and a real file under `source.basePath`. The proven wrapper uses the full original declaration range, including the assignment target, property key, variable name, or export prefix. Such ranges use one-based lines and columns, UTF-16 code units, and an exclusive end. Other JSDoc versions, virtual or rewritten doclets, hashbang files and otherwise unverifiable inputs retain entries without source ranges. The map contains relative source paths and no source text; inferred `primaryBlock` ranges are not promoted to exact AST ranges.

## Scripts

```bash
npm run check:syntax
npm test
npm run test:jsdoc
npm run release:check
npm run test:all
```

`npm test` runs fixture coverage and the opt-in source-map regression cases, including a small real JSDoc run. `npm run test:jsdoc` loads the plugin through real JSDoc. `npm run release:check` validates package metadata and required release files.

## Compatibility

- Node.js 18 or newer.
- JSDoc 4.x.
- CommonJS runtime.
- `doclet.hia.presentation` is an additive `hia-jsdoc-presentation@0.1.0` companion profile; it is not a language-neutral HIA core contract.

## Stability

Version `0.1.x` is an early public package. The Standalone metadata shape is intended for experimentation and companion-theme use. The HIA Integration IR is still a draft contract and may change before a stable release.

## License

MIT

## Presentation identity

The current metadata handoff declares documentation-presentation-profile 1.0.0. Pair it with a theme supporting that exact identity. This handoff is not a full profile validator or source-publication authorization. Package versions and published archives are unchanged by this source update.
