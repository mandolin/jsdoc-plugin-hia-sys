"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const textExtensions = new Set([".cjs", ".css", ".html", ".js", ".json", ".md", ".mjs", ".ts", ".txt"]);

const unsafeMarkers = [
  {
    label: "Windows absolute path",
    pattern: /(^|[^A-Za-z])[A-Za-z]:[\\/]/
  },
  {
    label: "UNC path",
    pattern: /(^|[\s"'([{])\\\\[A-Za-z0-9._$-]+[\\/][A-Za-z0-9._$-]+/
  },
  {
    label: "macOS user path",
    pattern: /\/Users\//
  },
  {
    label: "macOS private path",
    pattern: /\/private\//
  },
  {
    label: "adapter-private filePath field",
    pattern: /"filePath"\s*:/
  },
  {
    label: "legacy currentPage source link",
    pattern: /"currentPage"/
  },
  {
    label: "synthetic package:undefined node",
    pattern: /package:undefined/
  }
];

function toRelative(absolutePath) {
  return path.relative(root, absolutePath).replaceAll(path.sep, "/");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function listTextFiles(relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  const files = [];
  const stack = [directory];

  while (stack.length > 0) {
    const current = stack.pop();

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }

      if (entry.isFile() && textExtensions.has(path.extname(entry.name))) {
        files.push(absolutePath);
      }
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function assertPackageFilesDoNotIncludeGeneratedOutput() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const files = pkg.files ?? [];

  for (const entry of files) {
    assert.equal(entry.includes("examples/basic/out"), false, "package files must not include generated example output");
    assert.equal(entry.endsWith(".tgz"), false, "package files must not include dry-run tarballs");
  }
}

function run() {
  assert.equal(exists("examples/basic/out"), false, "examples/basic/out must not be committed");
  assert.deepEqual(fs.readdirSync(root).filter((entry) => entry.endsWith(".tgz")), [], "dry-run tarballs must not remain");
  assertPackageFilesDoNotIncludeGeneratedOutput();

  const failures = [];

  for (const absolutePath of listTextFiles("examples/basic")) {
    const relativePath = toRelative(absolutePath);
    const content = fs.readFileSync(absolutePath, "utf8");

    for (const marker of unsafeMarkers) {
      if (marker.pattern.test(content)) {
        failures.push(`${relativePath}: ${marker.label}`);
      }
    }
  }

  assert.deepEqual(failures, [], `Example governance violations:\n${failures.join("\n")}`);

  console.log("@mandolin/jsdoc-plugin-hia-sys example governance check passed.");
}

run();
