"use strict";

const codeFragment = require("./code-fragment.cjs");
const diagnostics = require("./diagnostics.cjs");
const docI18n = require("./doc-i18n.cjs");
const docletNormalizer = require("./doclet-normalizer.cjs");
const hiaIrExporter = require("./hia-ir-exporter.cjs");
const sourceLink = require("./source-link.cjs");
const sourcePreview = require("./source-preview.cjs");

/**
 * @lang zh-CN 按默认顺序提供的内置微插件对象数组，宿主按配置筛选并调度其钩子。
 * @lang en Built-in micro-plugin objects in their default order, filtered and scheduled by host configuration.
 */
const builtInMicroPlugins = [
  codeFragment,
  sourceLink,
  sourcePreview,
  docI18n,
  docletNormalizer,
  hiaIrExporter,
  diagnostics
];

module.exports = {
  builtInMicroPlugins
};
