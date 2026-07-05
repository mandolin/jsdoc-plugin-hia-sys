"use strict";

const codeFragment = require("./code-fragment.cjs");
const diagnostics = require("./diagnostics.cjs");
const docI18n = require("./doc-i18n.cjs");
const docletNormalizer = require("./doclet-normalizer.cjs");
const hiaIrExporter = require("./hia-ir-exporter.cjs");
const sourceLink = require("./source-link.cjs");
const sourcePreview = require("./source-preview.cjs");

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
