/**
 * @file
 * @lang zh-CN 固定CommonJS嵌套公开面和hook错误公开摘要，保留可信本地重抛。
 * @lang en Pins the nested CommonJS public surface and public hook-error summaries while retaining trusted local rethrows.
 */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const plugin = require("../src/index.cjs");

test("hook diagnostics omit raw errors including non-Error throws", () => {
  for (const thrown of [new Error("SYNTHETIC_PRIVATE_HOOK"), "SYNTHETIC_PRIVATE_HOOK", null]) {
    const microPlugin = {name: "test-hook", newDoclet() {throw thrown;}};
    const system = plugin._hia.createPluginSystem({microPlugins: [microPlugin], configOverrides: {microPlugins: ["test-hook"], diagnostics: {throwOnError: false}}});
    assert.doesNotThrow(() => system.handle("newDoclet", {doclet: {}}));
    const diagnostics = system.getState().diagnostics.list();
    assert.equal(diagnostics[0].code, "HIA_PLUGIN_HOOK_FAILED");
    assert.equal(diagnostics[0].plugin, "test-hook");
    assert.equal(JSON.stringify(diagnostics).includes("SYNTHETIC_PRIVATE_HOOK"), false);
  }
});

test("throwOnError preserves the exact original object for trusted local callers", () => {
  const error = new Error("SYNTHETIC_PRIVATE_LOCAL_ERROR");
  const system = plugin._hia.createPluginSystem({microPlugins: [{name: "test-hook", newDoclet() {throw error;}}], configOverrides: {microPlugins: ["test-hook"], diagnostics: {throwOnError: true}}});
  assert.throws(() => system.handle("newDoclet", {}), (actual) => actual === error);
});

test("API reference inventories root exports and all exposed nested keys", () => {
  const reference = fs.readFileSync(path.join(__dirname, "../API.md"), "utf8");
  for (const name of Object.keys(plugin)) assert.ok(reference.includes(`\`${name}\``), name);
  for (const [prefix, namespace] of [["handlers", plugin.handlers], ["_hia", plugin._hia], ["_hia.outputContract", plugin._hia.outputContract]]) {
    for (const name of Object.keys(namespace)) assert.ok(reference.includes(`\`${prefix}.${name}\``), `${prefix}.${name}`);
  }
  assert.ok(reference.includes("Side effects") && reference.includes("Errors"));
});
