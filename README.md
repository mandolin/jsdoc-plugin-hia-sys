# jsdoc-plugin-hia-sys

`jsdoc-plugin-hia-sys` 是新的 HIA JSDoc 集成系统。

GitHub: <https://github.com/mandolin/jsdoc-plugin-hia-sys>

它不继续重构旧 `jsdoc-plugin-hia`，而是吸收旧库中已经验证过的能力，重新建立边界：

- 面向普通前端项目，可作为独立 JSDoc 插件使用。
- 面向 HIA Documentation Sys，可作为 JSDoc adapter 输出 HIA IR。
- 内部可以建立微插件体系，组合源码片段引用、源码链接、源码预览、多语言文档和诊断能力。

## 设计原则

- 保留旧 `@codeblock/@codeblockend/@coderef` 的语义价值。
- 不复制旧库的全局状态和路径耦合实现。
- JSDoc 相关逻辑留在本包，语言无关模型沉到 `packages/core`。
- HIA core 不依赖本包。
- 普通用户可以只安装本包和 `jsdoc-theme-hia`，不必理解完整 HIA 体系。

## 候选内部模块

- `code-fragment`
- `source-link`
- `source-preview`
- `doc-i18n`
- `doclet-normalizer`
- `hia-ir-exporter`
- `diagnostics`

## 当前状态

`G-JPHS-P1` 已建立最小 package、JSDoc 插件入口、内部微插件运行器、配置读取、metadata 写入、诊断收集和 fixture 测试。

`G-JPHS-P2` 已建立源码片段引用链路，支持扫描 `@codeblock/@codeblockend`、解析 `@coderef`、跨文件引用、source link、source preview 和基础诊断。

`G-JPHS-P3` 已建立多语言文档首批能力，支持 `@hiaText`、`@hiaBlock`、外部 JSON 语言资源、fallback、`perLocale`、`runtimeSwitch` 和 `hiaIntegration` metadata。

`G-JPHS-P4` 已建立 Standalone 与 HIA Integration 双模式输出契约，支持 `state.output.standalone`、`state.output.integration`、主题消费契约、doclet-node 映射和 integration JSON 文件写出。

`G-JPHS-P5` 已完成当前规划周期收尾，补齐 release check、changelog、发布检查清单、第三方审计记录、示例说明和端到端验证入口。

## 使用方式

在 JSDoc 配置中加载插件：

```json
{
  "plugins": ["./src/index.cjs"],
  "opts": {
    "hia": {
      "mode": "standalone"
    }
  }
}
```

当前支持从 `opts.hia`、`opts["jsdoc-plugin-hia-sys"]`、`hia` 或 `jsdoc-plugin-hia-sys` 读取配置。

写出 HIA Integration JSON：

```json
{
  "opts": {
    "hia": {
      "mode": "hiaIntegration",
      "integration": {
        "enabled": true,
        "outputFile": "examples/basic/out/hia-integration.json"
      }
    }
  }
}
```

## 脚本

```bash
npm run check:syntax
npm test
npm run test:jsdoc
npm run release:check
npm run test:all
```

`npm test` 使用本地 fixture runner 验证插件入口、微插件顺序、`doclet.hia` metadata 和最小 HIA Integration 输出。

`npm run test:jsdoc` 需要安装 dev dependency 后运行，用真实 JSDoc 加载 `examples/basic/jsdoc.conf.json`。

`npm run release:check` 会执行包元数据、必需文件、示例配置和未清理生成物检查，并运行 `npm pack --dry-run`。

## 已建立模块

- `src/index.cjs`: JSDoc plugin 入口。
- `src/config/defaults.cjs`: 默认配置和配置合并。
- `src/runtime/create-plugin-system.cjs`: 内部微插件运行器。
- `src/runtime/diagnostics.cjs`: 最小诊断收集器。
- `src/runtime/metadata.cjs`: `doclet.hia` metadata 写入。
- `src/runtime/output-contract.cjs`: Standalone、主题消费和 HIA Integration 输出契约。
- `src/micro-plugins/*`: 首批内置微插件。
- `examples/basic/`: 最小 JSDoc 示例。
- `test/run-fixtures.cjs`: 最小 fixture 测试。
- `scripts/release-check.cjs`: 发布前结构检查。
- `CHANGELOG.md`: 变更记录。
- `RELEASE_CHECKLIST.md`: 包级发布检查清单。
- `THIRD_PARTY_NOTICES.md`: 第三方依赖和资产审计。

## 源码片段引用

在源码中标记可引用片段：

```js
function greet(name) {
  /* @codeblock GREET_BODY */
  const message = `Hello, ${name}`;
  return message;
  /* @codeblockend GREET_BODY */
}
```

在文档注释中引用片段：

```js
/**
 * Greets a user.
 *
 * @example
 * // @coderef GREET_BODY
 * @coderef GREET_BODY
 */
function greet(name) {}
```

当前 `@coderef` 可出现在 `description`、`examples`、`properties[].description` 和 `@coderef` 标签中。插件会向 `doclet.hia.source.references` 写入引用数据，并包含 source link 与 source preview metadata。

## 多语言文档

定义文档 key、path 和内联多语言内容：

```js
/**
 * Greets a user.
 *
 * @hiaKey greet.description
 * @hiaPath api.greet
 * @hiaText zh-CN 问候一个用户。
 * @hiaText en Greets a user.
 */
function greet(name) {}
```

配置外部语言资源：

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
        "resources": ["examples/basic/i18n/docs.hia-i18n.json"]
      }
    }
  }
}
```

外部资源格式支持按 locale 分组：

```json
{
  "zh-CN": {
    "shared.helper": {
      "text": "标准化用户名称。"
    }
  },
  "en": {
    "shared.helper": {
      "text": "Normalizes a user name."
    }
  }
}
```

插件会向 `doclet.hia.i18n` 写入 `localized`、`missingLocales`、`resources` 和 `generation` 数据。`generation` 当前包含 `perLocale`、`runtimeSwitch` 和 `hiaIntegration` 三种最小数据形态。

## 输出契约

Standalone 模式面向 `jsdoc-theme-hia` 和普通 JSDoc 工程：

- 增强后的 JSDoc doclets。
- `doclet.hia` metadata。
- source fragment/link/preview 数据。
- doc-i18n 数据。
- diagnostics。

HIA Integration 模式面向后续 HIA core 和 parser-jsdoc 链路：

- `state.output.integration.ir.nodes`
- `state.output.integration.sourceFragments`
- `state.output.integration.localizationResources`
- `state.output.integration.diagnostics`
- `state.output.integration.docletNodeMap`
- `state.output.integration.parserBoundary`

正式文档见 `../../docs/contracts/jsdoc-hia-output-contract.md`。

## 当前边界

- `code-fragment`、`source-link`、`source-preview`、`doc-i18n` 已进入首批内置微插件列表。
- `@codeblock/@codeblockend/@coderef` 的基础语义已在 `G-JPHS-P2` 实现，后续可继续增强更复杂的语法和显示格式。
- 多语言文档首批链路已在 `G-JPHS-P3` 实现，后续可继续增强资源格式、生成策略和 IDE 协作。
- Standalone 和 HIA Integration 的首版输出契约已在 `G-JPHS-P4` 收敛，后续会在 `W-P2` 和 ADR 中继续稳定核心 IR schema。
