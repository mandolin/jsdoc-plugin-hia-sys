"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const plugin = require("../src/index.cjs");

function createDictionaryMock() {
  const tags = new Map();

  return {
    tags,
    defineTag(name, definition) {
      tags.set(name, definition);
    }
  };
}

function runBasicFixture() {
  const dictionary = createDictionaryMock();
  const system = plugin._hia.createPluginSystem({
    microPlugins: plugin._hia.builtInMicroPlugins,
    configOverrides: {
      mode: "standalone",
      source: {
        link: {
          enabled: true,
          rootUrl: "https://example.test/repo",
          openMode: "same-tab"
        },
        preview: {
          enabled: true,
          defaultExpanded: false
        }
      },
      i18n: {
        enabled: true,
        defaultLocale: "zh-CN",
        fallbackLocale: "en",
        locales: ["zh-CN", "en"],
        mode: "runtimeSwitch",
        resourceBasePath: path.resolve(__dirname, ".."),
        resources: ["examples/basic/i18n/docs.hia-i18n.json"]
      }
    }
  });

  system.defineTags(dictionary);

  assert.equal(dictionary.tags.has("hiaLocale"), true);
  assert.equal(dictionary.tags.has("hiaKey"), true);
  assert.equal(dictionary.tags.has("hiaPath"), true);
  assert.equal(dictionary.tags.has("lang"), true);
  assert.equal(dictionary.tags.has("hiaText"), true);
  assert.equal(dictionary.tags.has("hiaBlock"), true);
  assert.equal(dictionary.tags.has("codeblock"), true);
  assert.equal(dictionary.tags.has("codeblockend"), true);
  assert.equal(dictionary.tags.has("coderef"), true);

  const sourcePath = path.resolve(__dirname, "../examples/basic/src/greet.js");
  const sharedSourcePath = path.resolve(__dirname, "../examples/basic/src/shared.js");
  system.handle("beforeParse", {
    filename: sourcePath,
    source: fs.readFileSync(sourcePath, "utf8")
  });
  system.handle("beforeParse", {
    filename: sharedSourcePath,
    source: fs.readFileSync(sharedSourcePath, "utf8")
  });

  const doclet = {
    kind: "function",
    name: "greet",
    longname: "greet",
    description: "Greets a user.\n\n@coderef GREET_BODY",
    params: [
      {
        name: "status",
        description: "Status <lang key=\"greet.status\"><zh-CN>启用</zh-CN><en>active</en></lang>."
      }
    ],
    examples: ["// @coderef GREET_BODY"],
    properties: [
      {
        name: "helper",
        description: "Shared helper:\n@coderef SHARED_HELPER"
      }
    ],
    meta: {
      path: path.dirname(sourcePath),
      filename: path.basename(sourcePath),
      lineno: 17,
      columnno: 1
    }
  };
  const helperDoclet = {
    kind: "function",
    name: "normalizeName",
    longname: "normalizeName",
    description: "Shared helper.",
    meta: {
      path: path.dirname(sharedSourcePath),
      filename: path.basename(sharedSourcePath),
      lineno: 13,
      columnno: 1
    }
  };

  dictionary.tags.get("hiaKey").onTagged(doclet, {
    value: "greet.description"
  });
  dictionary.tags.get("hiaPath").onTagged(doclet, {
    value: "api.greet"
  });
  dictionary.tags.get("lang").onTagged(doclet, {
    value: "zh-CN 问候一个用户。"
  });
  dictionary.tags.get("lang").onTagged(doclet, {
    value: "en Greets a user."
  });
  dictionary.tags.get("coderef").onTagged(doclet, {
    value: "SHARED_HELPER"
  });
  dictionary.tags.get("hiaKey").onTagged(helperDoclet, {
    value: "shared.helper"
  });
  dictionary.tags.get("hiaPath").onTagged(helperDoclet, {
    value: "api.shared"
  });

  system.handle("newDoclet", {
    doclet
  });
  system.handle("newDoclet", {
    doclet: helperDoclet
  });
  system.handle("parseComplete", {
    doclets: [doclet, helperDoclet]
  });
  system.handle("processingComplete", {
    doclets: [doclet, helperDoclet]
  });

  assert.ok(doclet.hia);
  assert.equal(doclet.hia.version, "0.1.0");
  assert.equal(doclet.hia.mode, "standalone");
  assert.equal(doclet.hia.doclet.name, "greet");
  assert.equal(doclet.hia.source.link.enabled, true);
  assert.equal(doclet.hia.source.preview.enabled, true);
  assert.equal(doclet.hia.source.references.length, 4);
  assert.equal(doclet.hia.source.references.every((reference) => reference.resolved), true);
  assert.equal(doclet.hia.source.fragments.length, 4);
  assert.equal(doclet.hia.source.model, "hia-jsdoc-source");
  assert.equal(doclet.hia.source.modelVersion, "0.2.0");
  assert.equal(doclet.hia.source.mode, "all");
  assert.equal(doclet.hia.source.definedIn.kind, "defined-in");
  assert.match(doclet.hia.source.definedIn.relativePath, /examples\/basic\/src\/greet\.js$/);
  assert.equal(doclet.hia.source.definedIn.position.line, 17);
  assert.equal(doclet.hia.source.definedIn.link.enabled, true);
  assert.equal(doclet.hia.source.primaryBlock.kind, "primary-block");
  assert.equal(doclet.hia.source.primaryBlock.rangeSource, "parser-js");
  assert.equal(doclet.hia.source.primaryBlock.confidence, "high");
  assert.match(doclet.hia.source.primaryBlock.content, /function greet/);
  assert.equal(doclet.hia.source.primaryBlock.preview.enabled, true);
  assert.equal(doclet.hia.source.references[0].kind, "source-reference");
  assert.equal(doclet.hia.source.references[0].referenceKind, "coderef");
  assert.match(doclet.description, /```javascript/);
  assert.match(doclet.description, /const message = `Hello, \$\{name\}`;/);
  assert.match(doclet.examples[0], /return message;/);
  assert.match(doclet.properties[0].description, /function normalizeName/);
  assert.equal(doclet.hia.source.references[0].fragment.link.enabled, true);
  assert.match(doclet.hia.source.references[0].fragment.link.fileUrl, /examples\/basic\/src\/greet\.js$/);
  assert.match(doclet.hia.source.references[0].fragment.link.lineUrl, /#L\d+-L\d+$/);
  assert.equal(doclet.hia.source.references[0].fragment.preview.enabled, true);
  assert.match(doclet.hia.source.references[0].fragment.preview.content, /return message;/);
  assert.equal(doclet.hia.i18n.key, "greet.description");
  assert.equal(doclet.hia.i18n.path, "api.greet");
  assert.equal(doclet.hia.i18n.model, "hia-jsdoc-text-i18n");
  assert.equal(doclet.hia.i18n.modelVersion, "0.2.0");
  assert.deepEqual(doclet.hia.i18n.locales, ["zh-CN", "en"]);
  assert.equal(doclet.hia.i18n.fields.description.kind, "description");
  assert.equal(doclet.hia.i18n.fields.description.blocks.length, 2);
  assert.equal(doclet.hia.i18n.fields.description.localizedText["zh-CN"], "问候一个用户。");
  assert.equal(doclet.hia.i18n.fields.description.localizedText.en, "Greets a user.");
  assert.equal(
    doclet.hia.i18n.fields["params.status.description"].localizedText["zh-CN"],
    "Status 启用."
  );
  assert.equal(
    doclet.hia.i18n.fields["params.status.description"].localizedText.en,
    "Status active."
  );
  assert.equal(doclet.hia.i18n.fields["params.status.description"].segments.length, 1);
  assert.equal(doclet.hia.i18n.localized["zh-CN"].text, "问候一个用户。");
  assert.equal(doclet.hia.i18n.localized.en.text, "Greets a user.");
  assert.equal(doclet.hia.i18n.generation.mode, "runtimeSwitch");
  assert.equal(doclet.hia.i18n.generation.perLocale["zh-CN"].text, "问候一个用户。");
  assert.equal(doclet.hia.i18n.generation.runtimeSwitch.fallbackLocale, "en");
  assert.equal(doclet.hia.i18n.generation.hiaIntegration.localized.en.text, "Greets a user.");
  assert.equal(doclet.hia.microPlugins.includes("doclet-normalizer"), true);
  assert.equal(doclet.hia.microPlugins.includes("doc-i18n"), true);

  assert.equal(helperDoclet.hia.i18n.key, "shared.helper");
  assert.equal(helperDoclet.hia.i18n.localized["zh-CN"].text, "标准化用户名称。");
  assert.equal(helperDoclet.hia.i18n.localized["zh-CN"].source, "resource");
  assert.equal(helperDoclet.hia.i18n.localized.en.text, "Normalizes a user name.");
  assert.equal(helperDoclet.hia.i18n.localized.en.source, "resource");
  assert.equal(helperDoclet.hia.i18n.fields.description.localizedText["zh-CN"], "标准化用户名称。");

  const state = system.getState();
  assert.equal(state.sourceFiles.has(sourcePath), true);
  assert.equal(state.sourceFiles.has(sharedSourcePath), true);
  assert.equal(state.registries.sourceFragments.size, 2);
  assert.equal(state.registries.localizationResources.length, 1);
  assert.equal(state.output.sourceFragments.length, 2);
  assert.equal(state.integration.ir.nodes.length, 2);
  assert.equal(state.integration.ir.nodes[0].name, "greet");
  assert.equal(state.output.standalone.contract, "jsdoc-plugin-hia-sys/standalone");
  assert.equal(state.output.standalone.theme.metadataKey, "hia");
  assert.equal(state.output.standalone.theme.consumes.i18n, "doclet.hia.i18n");
  assert.equal(state.output.integration.contract, "hia-jsdoc-integration");
  assert.equal(state.output.integration.ir.nodes.length, 2);
  assert.equal(new Set(state.output.integration.ir.nodes.map((node) => node.id)).size, 2);
  assert.equal(state.output.integration.docletNodeMap[0].docletId, "greet");
  assert.equal(state.output.integration.parserBoundary.adapter, "parser-jsdoc");
  assert.equal(JSON.stringify(state.output.integration).includes("filePath"), false);
  assert.equal(JSON.stringify(state.output.integration).includes("currentPage"), false);
  assert.deepEqual(state.output.integration.localizationResources[0], {
    kind: "external-resource",
    path: "examples/basic/i18n/docs.hia-i18n.json",
    format: "hia-i18n-json",
    fields: ["shared.helper"],
    locales: ["en", "zh-CN"],
    localeCount: 2
  });
  assert.deepEqual(state.output.diagnostics, []);
}

function runOutputContractFixture() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jphs-p4-"));
  const outputFile = path.join(tempDir, "hia-integration.json");

  try {
    const dictionary = createDictionaryMock();
    const system = plugin._hia.createPluginSystem({
      microPlugins: plugin._hia.builtInMicroPlugins,
      configOverrides: {
        mode: "hiaIntegration",
        integration: {
          enabled: true,
          outputFile
        },
        i18n: {
          enabled: true,
          defaultLocale: "zh-CN",
          fallbackLocale: "en",
          locales: ["zh-CN", "en"],
          mode: "perLocale"
        }
      }
    });
    const doclet = {
      kind: "function",
      name: "contractDemo",
      longname: "contractDemo",
      description: "Contract demo."
    };

    system.defineTags(dictionary);
    dictionary.tags.get("hiaKey").onTagged(doclet, {
      value: "contract.demo"
    });
    dictionary.tags.get("lang").onTagged(doclet, {
      value: "zh-CN 契约演示。"
    });
    dictionary.tags.get("lang").onTagged(doclet, {
      value: "en Contract demo."
    });

    system.handle("newDoclet", {
      doclet
    });
    system.handle("parseComplete", {
      doclets: [doclet]
    });
    system.handle("processingComplete", {
      doclets: [doclet]
    });

    const state = system.getState();
    const written = JSON.parse(fs.readFileSync(outputFile, "utf8"));

    assert.equal(plugin._hia.outputContract.CONTRACT_VERSION, "0.1.0");
    assert.equal(state.output.integrationOutputFile, outputFile);
    assert.equal(written.contract, "hia-jsdoc-integration");
    assert.equal(written.mode, "hiaIntegration");
    assert.equal(written.ir.nodes[0].id, "jsdoc:function:contractDemo");
    assert.equal(written.ir.nodes[0].i18n.fields.description.localizedText["zh-CN"], "契约演示。");
    assert.equal(written.ir.nodes[0].i18n.generation.perLocale.en.text, "Contract demo.");
    assert.equal(written.docletNodeMap[0].nodeId, "jsdoc:function:contractDemo");
    assert.equal(written.localizationResources.length, 0);
    assert.equal(JSON.stringify(written).includes("filePath"), false);
    assert.equal(JSON.stringify(written).includes("currentPage"), false);
    assert.equal(state.output.standalone.doclets[0].summary.hiaKey, "contract.demo");
    assert.equal(state.output.standalone.theme.i18n.mode, "perLocale");
  } finally {
    fs.rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
}

function runDiagnosticsFixture() {
  const dictionary = createDictionaryMock();
  const system = plugin._hia.createPluginSystem({
    microPlugins: plugin._hia.builtInMicroPlugins,
    configOverrides: {
      source: {
        link: {
          enabled: true,
          rootUrl: "https://example.test/repo"
        },
        preview: {
          enabled: true
        }
      },
      i18n: {
        enabled: true,
        defaultLocale: "zh-CN",
        fallbackLocale: "en",
        locales: ["zh-CN", "en", "fr"],
        resources: ["examples/basic/i18n/missing.json"],
        resourceBasePath: path.resolve(__dirname, "..")
      }
    }
  });
  system.defineTags(dictionary);

  const duplicatePath = path.resolve(__dirname, "../examples/basic/src/duplicate.js");
  const missingEndPath = path.resolve(__dirname, "../examples/basic/src/missing-end.js");

  system.handle("beforeParse", {
    filename: duplicatePath,
    source: [
      "/* @codeblock DUP */",
      "const first = 1;",
      "/* @codeblockend DUP */",
      "/* @codeblock DUP */",
      "const second = 2;",
      "/* @codeblockend DUP */"
    ].join("\n")
  });

  system.handle("beforeParse", {
    filename: missingEndPath,
    source: [
      "/* @codeblock OPEN_ONLY */",
      "const value = 1;"
    ].join("\n")
  });

  const doclet = {
    kind: "function",
    name: "broken",
    longname: "broken",
    description: "@coderef NOT_FOUND"
  };
  dictionary.tags.get("hiaKey").onTagged(doclet, {
    value: "broken.description"
  });
  dictionary.tags.get("hiaText").onTagged(doclet, {
    value: "en Broken."
  });
  dictionary.tags.get("hiaText").onTagged(doclet, {
    value: "en Duplicate broken."
  });

  system.handle("newDoclet", {
    doclet
  });
  system.handle("parseComplete", {
    doclets: [doclet]
  });
  system.handle("processingComplete", {
    doclets: [doclet]
  });

  const codes = system.getState().output.diagnostics.map((item) => item.code);
  const integrationDiagnostics = system.getState().output.integration.diagnostics;
  const serializedIntegration = JSON.stringify(system.getState().output.integration);

  assert.equal(codes.includes("HIA_SOURCE_FRAGMENT_DUPLICATE"), true);
  assert.equal(codes.includes("HIA_SOURCE_FRAGMENT_END_MISSING"), true);
  assert.equal(codes.includes("HIA_SOURCE_REFERENCE_MISSING"), true);
  assert.equal(codes.includes("HIA_I18N_RESOURCE_MISSING"), true);
  assert.equal(codes.includes("HIA_I18N_INLINE_LOCALE_DUPLICATE"), true);
  assert.equal(codes.includes("HIA_I18N_LOCALE_MISSING"), true);
  assert.equal(integrationDiagnostics.every((item) => item.targetPath && item.path), true);
  assert.equal(integrationDiagnostics.every((item) => ["error", "warning", "info"].includes(item.severity)), true);
  assert.equal(serializedIntegration.includes("filePath"), false);
  assert.equal(serializedIntegration.includes("currentPage"), false);
  assert.equal(doclet.hia.source.references.length, 1);
  assert.equal(doclet.hia.source.references[0].resolved, false);
}

assert.equal(typeof plugin.defineTags, "function");
assert.equal(typeof plugin.handlers.beforeParse, "function");
assert.equal(typeof plugin.handlers.newDoclet, "function");
assert.equal(typeof plugin.handlers.parseComplete, "function");
assert.equal(typeof plugin.handlers.processingComplete, "function");

runBasicFixture();
runOutputContractFixture();
runDiagnosticsFixture();

console.log("G-JPHS-P5 fixtures passed.");
