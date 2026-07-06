"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const requiredFiles = [
  "package.json",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "RELEASE_CHECKLIST.md",
  "THIRD_PARTY_NOTICES.md",
  "src/index.cjs",
  "src/runtime/output-contract.cjs",
  "examples/basic/README.md",
  "examples/basic/jsdoc.conf.json",
  "examples/basic/src/greet.js",
  "examples/basic/src/shared.js",
  "examples/basic/i18n/docs.hia-i18n.json",
  "test/run-fixtures.cjs"
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assertNoGeneratedOutput() {
  assert.equal(exists("examples/basic/out"), false, "examples/basic/out must not be committed");
  assert.equal(exists("mandolin-jsdoc-plugin-hia-sys-0.1.0.tgz"), false, "dry-run tarball must not remain");
}

function run() {
  const pkg = readJson("package.json");
  const exampleConfig = readJson("examples/basic/jsdoc.conf.json");
  const i18nResource = readJson("examples/basic/i18n/docs.hia-i18n.json");

  assert.equal(pkg.name, "@mandolin/jsdoc-plugin-hia-sys");
  assert.equal(pkg.version, "0.1.0");
  assert.equal(pkg.license, "MIT");
  assert.equal(pkg.private, false);
  assert.equal(pkg.main, "src/index.cjs");
  assert.equal(pkg.repository.url, "git+https://github.com/mandolin/jsdoc-plugin-hia-sys.git");
  assert.equal(pkg.bugs.url, "https://github.com/mandolin/jsdoc-plugin-hia-sys/issues");
  assert.equal(pkg.homepage, "https://github.com/mandolin/jsdoc-plugin-hia-sys#readme");
  assert.equal(pkg.peerDependencies.jsdoc, "^4.0.0");
  assert.ok(pkg.scripts.test);
  assert.ok(pkg.scripts["test:jsdoc"]);
  assert.ok(pkg.scripts["check:syntax"]);
  assert.ok(pkg.scripts["release:check"]);
  assert.ok(pkg.files.includes("CHANGELOG.md"));
  assert.ok(pkg.files.includes("RELEASE_CHECKLIST.md"));
  assert.ok(pkg.files.includes("THIRD_PARTY_NOTICES.md"));

  for (const relativePath of requiredFiles) {
    assert.equal(exists(relativePath), true, `${relativePath} must exist`);
  }

  assert.equal(exampleConfig.opts.hia.integration.enabled, true);
  assert.equal(typeof exampleConfig.opts.hia.integration.outputFile, "string");
  assert.ok(i18nResource["zh-CN"]);
  assert.ok(i18nResource.en);

  assertNoGeneratedOutput();

  console.log("@mandolin/jsdoc-plugin-hia-sys release check passed.");
}

run();
