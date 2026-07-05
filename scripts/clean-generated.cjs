"use strict";

const fs = require("node:fs");
const path = require("node:path");

const exampleRoot = path.resolve(__dirname, "..", "examples/basic");
const outDir = path.join(exampleRoot, "out");

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function removeDirectoryWithRetry(directory) {
  const attempts = 60;

  for (let index = 0; index < attempts; index += 1) {
    try {
      fs.rmSync(directory, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 250
      });
      return;
    } catch (error) {
      if (!["EBUSY", "ENOTEMPTY", "EPERM"].includes(error.code) || index === attempts - 1) {
        throw error;
      }

      sleep(500);
    }
  }
}

if (!fs.existsSync(outDir)) {
  console.log("No generated example output to clean.");
  process.exit(0);
}

const resolvedOut = fs.realpathSync(outDir);
const resolvedExampleRoot = fs.realpathSync(exampleRoot);

if (!resolvedOut.toLowerCase().startsWith(resolvedExampleRoot.toLowerCase())) {
  throw new Error(`Refusing to remove generated directory outside example root: ${resolvedOut}`);
}

removeDirectoryWithRetry(outDir);

console.log(`Removed ${resolvedOut}`);
