"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { VERSION } = require("../version.cjs");

const CONTRACT_VERSION = "0.1.0";
const STANDALONE_CONTRACT = "jsdoc-plugin-hia-sys/standalone";
const INTEGRATION_CONTRACT = "hia-jsdoc-integration";

function getMetadata(doclet, state) {
  const key = state.config.metadataKey || "hia";
  return doclet && doclet[key] && typeof doclet[key] === "object"
    ? doclet[key]
    : {};
}

function getDocletId(doclet) {
  return doclet.longname || doclet.name || "";
}

function getNodeId(doclet) {
  const rawId = getDocletId(doclet) || "anonymous";
  const kind = doclet.kind || "unknown";
  return `jsdoc:${kind}:${rawId}`;
}

function summarizeDoclet(doclet, state) {
  const metadata = getMetadata(doclet, state);
  const source = metadata.source || {};
  const i18n = metadata.i18n || {};

  return {
    id: getDocletId(doclet),
    name: doclet.name || "",
    longname: doclet.longname || doclet.name || "",
    kind: doclet.kind || "",
    memberof: doclet.memberof || "",
    scope: doclet.scope || "",
    hiaKey: i18n.key || "",
    hiaPath: i18n.path || "",
    sourceReferenceCount: Array.isArray(source.references) ? source.references.length : 0,
    locales: Array.isArray(i18n.locales) ? i18n.locales : [],
    hasHia: Boolean(metadata.version)
  };
}

function toIntegrationNode(doclet, state) {
  const metadata = getMetadata(doclet, state);

  return {
    id: getNodeId(doclet),
    kind: doclet.kind || "",
    name: doclet.name || "",
    longname: doclet.longname || doclet.name || "",
    title: doclet.longname || doclet.name || "",
    summary: doclet.description || doclet.classdesc || "",
    jsdoc: {
      docletId: getDocletId(doclet),
      kind: doclet.kind || "",
      name: doclet.name || "",
      longname: doclet.longname || doclet.name || "",
      memberof: doclet.memberof || "",
      scope: doclet.scope || "",
      params: doclet.params || [],
      returns: doclet.returns || [],
      properties: doclet.properties || [],
      examples: doclet.examples || []
    },
    hia: {
      metadataKey: state.config.metadataKey || "hia",
      microPlugins: metadata.microPlugins || []
    },
    source: metadata.source || {
      fragments: [],
      references: []
    },
    i18n: metadata.i18n || {},
    diagnostics: metadata.diagnostics || []
  };
}

function buildDocletNodeMap(doclets) {
  return doclets.map((doclet) => ({
    docletId: getDocletId(doclet),
    nodeId: getNodeId(doclet),
    kind: doclet.kind || "",
    name: doclet.name || "",
    longname: doclet.longname || doclet.name || ""
  }));
}

function getDiagnostics(state) {
  if (Array.isArray(state.output.diagnostics)) {
    return state.output.diagnostics;
  }

  return state.diagnostics.list();
}

function buildThemeContract(state, doclets) {
  return {
    name: "jsdoc-theme-hia",
    contract: STANDALONE_CONTRACT,
    version: CONTRACT_VERSION,
    metadataKey: state.config.metadataKey || "hia",
    consumes: {
      docletMetadata: "doclet.hia",
      sourceReferences: "doclet.hia.source.references",
      sourceFragments: "doclet.hia.source.fragments",
      i18n: "doclet.hia.i18n",
      diagnostics: "doclet.hia.diagnostics"
    },
    i18n: {
      defaultLocale: state.config.i18n.defaultLocale,
      fallbackLocale: state.config.i18n.fallbackLocale,
      locales: state.config.i18n.locales || [],
      mode: state.config.i18n.mode
    },
    doclets: doclets.map((doclet) => summarizeDoclet(doclet, state))
  };
}

function buildStandaloneOutput(state, doclets) {
  return {
    contract: STANDALONE_CONTRACT,
    contractVersion: CONTRACT_VERSION,
    pluginVersion: VERSION,
    mode: state.config.mode,
    metadataKey: state.config.metadataKey || "hia",
    theme: buildThemeContract(state, doclets),
    doclets: doclets.map((doclet) => ({
      summary: summarizeDoclet(doclet, state),
      hia: getMetadata(doclet, state)
    })),
    sourceFragments: state.output.sourceFragments || [],
    localizationResources: state.registries.localizationResources || [],
    diagnostics: getDiagnostics(state),
    diagnosticCounts: state.output.diagnosticCounts || state.diagnostics.countBySeverity()
  };
}

function buildIntegrationOutput(state, doclets) {
  const nodes = doclets.map((doclet) => toIntegrationNode(doclet, state));

  return {
    contract: INTEGRATION_CONTRACT,
    contractVersion: CONTRACT_VERSION,
    pluginVersion: VERSION,
    mode: state.config.mode,
    parserBoundary: {
      adapter: "parser-jsdoc",
      owns: [
        "JSDoc doclet normalization",
        "JSDoc tag to HIA metadata mapping",
        "source fragment reference extraction",
        "doc-i18n metadata extraction"
      ],
      handsOff: [
        "language-neutral HIA IR evolution",
        "non-JavaScript parser implementations",
        "IDE protocol and LSP transport"
      ]
    },
    ir: {
      version: VERSION,
      source: "jsdoc",
      nodes
    },
    sourceFragments: state.output.sourceFragments || [],
    localizationResources: state.registries.localizationResources || [],
    diagnostics: getDiagnostics(state),
    diagnosticCounts: state.output.diagnosticCounts || state.diagnostics.countBySeverity(),
    docletNodeMap: buildDocletNodeMap(doclets)
  };
}

function buildOutputContract(state, doclets) {
  const sourceDoclets = Array.isArray(doclets) ? doclets : [];
  const standalone = buildStandaloneOutput(state, sourceDoclets);
  const integration = buildIntegrationOutput(state, sourceDoclets);

  return {
    standalone,
    integration
  };
}

function resolveIntegrationOutputFile(state) {
  const outputFile = state.config.integration && state.config.integration.outputFile;

  if (!outputFile) {
    return "";
  }

  if (path.isAbsolute(outputFile)) {
    return outputFile;
  }

  return path.resolve(process.cwd(), outputFile);
}

function writeIntegrationOutput(state, integrationOutput) {
  if (!state.config.integration || !state.config.integration.enabled) {
    return "";
  }

  const outputFile = resolveIntegrationOutputFile(state);

  if (!outputFile) {
    return "";
  }

  fs.mkdirSync(path.dirname(outputFile), {
    recursive: true
  });
  fs.writeFileSync(outputFile, `${JSON.stringify(integrationOutput, null, 2)}\n`, "utf8");

  return outputFile;
}

module.exports = {
  CONTRACT_VERSION,
  INTEGRATION_CONTRACT,
  STANDALONE_CONTRACT,
  buildIntegrationOutput,
  buildOutputContract,
  buildStandaloneOutput,
  buildThemeContract,
  writeIntegrationOutput
};
