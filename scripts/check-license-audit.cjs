"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const allowedLicenses = new Set(["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC"]);
const forbiddenLicenseFragments = ["GPL", "AGPL", "LGPL", "SSPL", "BUSL", "BSL"];

const auditRecords = [
  {
    name: "jsdoc",
    dependencyType: "peerDependencies",
    versionRange: "^4.0.0",
    license: "Apache-2.0",
    purpose: "Host-project JSDoc runtime peer used by the plugin."
  },
  {
    name: "jsdoc",
    dependencyType: "devDependencies",
    versionRange: "^4.0.5",
    license: "Apache-2.0",
    purpose: "Development and fixture execution for real JSDoc smoke tests."
  }
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function auditKey(name, dependencyType) {
  return `${dependencyType}:${name}`;
}

function assertAllowedLicense(entry) {
  assert.ok(entry.purpose && entry.purpose.length >= 12, `${entry.name} must have a meaningful purpose`);
  assert.equal(allowedLicenses.has(entry.license), true, `${entry.name} license must be allowed`);

  for (const fragment of forbiddenLicenseFragments) {
    assert.equal(
      entry.license.toUpperCase().includes(fragment),
      false,
      `${entry.name} must not use restricted license family ${fragment}`
    );
  }
}

function run() {
  const pkg = readJson("package.json");
  const notices = fs.readFileSync(path.join(root, "THIRD_PARTY_NOTICES.md"), "utf8");
  const auditByKey = new Map();
  const declaredKeys = new Set();

  assert.equal(pkg.license, "MIT");

  for (const record of auditRecords) {
    assertAllowedLicense(record);
    const key = auditKey(record.name, record.dependencyType);
    assert.equal(auditByKey.has(key), false, `duplicate audit record ${key}`);
    auditByKey.set(key, record);
  }

  for (const dependencyType of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const dependencies = pkg[dependencyType] ?? {};

    for (const [name, versionRange] of Object.entries(dependencies)) {
      const key = auditKey(name, dependencyType);
      const audit = auditByKey.get(key);

      assert.ok(audit, `package.json declares ${key}, but THIRD_PARTY_NOTICES.md has no audit record`);
      assert.equal(versionRange, audit.versionRange, `${key} expected audited range ${audit.versionRange}`);
      declaredKeys.add(key);
    }
  }

  for (const key of auditByKey.keys()) {
    assert.equal(declaredKeys.has(key), true, `${key} is audited but no longer declared`);
  }

  assert.ok(notices.includes("jsdoc"), "THIRD_PARTY_NOTICES.md must mention jsdoc");
  assert.ok(notices.includes("Apache-2.0"), "THIRD_PARTY_NOTICES.md must mention Apache-2.0");
  assert.ok(notices.includes("License Audit"), "THIRD_PARTY_NOTICES.md must include license audit policy");

  console.log("@mandolin/jsdoc-plugin-hia-sys license audit passed.");
}

run();
