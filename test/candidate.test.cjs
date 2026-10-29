/**
 * @file
 * @lang zh-CN 核源码候选包/运行版本协调，同时保留已确认工件wire身份；不是registry发行检查。
 * @lang en Checks coordinated source-candidate package/runtime versions while preserving confirmed wire identities; not a registry publication check.
 */
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const manifest = require("../package.json");
const plugin = require("../src/index.cjs");
test("plugin candidate has a public 1.0.0 identity and matching runtime metadata", () => {
  assert.equal(manifest.version, "1.0.0");
  assert.equal(manifest.private, false);
  assert.equal(manifest.publishConfig.access, "public");
  assert.equal(require("../src/version.cjs").VERSION, manifest.version);
  assert.ok(manifest.files.includes("MIGRATION.md"));
});
test("candidate package version never relabels Integration or presentation wires", () => {
  assert.equal(plugin._hia.outputContract.CONTRACT_VERSION, "0.1.0");
  assert.equal(plugin._hia.outputContract.PRESENTATION_PROFILE_CONTRACT_VERSION, "1.0.0");
});
