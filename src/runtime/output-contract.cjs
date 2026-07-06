"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { normalizeOpenMode } = require("./source.cjs");
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

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function countI18nFieldContent(fields) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    return 0;
  }

  let count = 0;

  for (const field of Object.values(fields)) {
    if (!field || typeof field !== "object" || Array.isArray(field)) {
      continue;
    }

    const localizedText = field.localizedText && typeof field.localizedText === "object"
      ? field.localizedText
      : {};

    if (
      field.defaultText ||
      Object.values(localizedText).some(Boolean) ||
      toArray(field.blocks).length > 0 ||
      toArray(field.segments).length > 0
    ) {
      count += 1;
    }
  }

  return count;
}

function scoreIntegrationNode(node) {
  let score = 0;

  if (node.summary) {
    score += 100;
  }

  if (node.i18n && node.i18n.key) {
    score += 80;
  }

  score += countI18nFieldContent(node.i18n && node.i18n.fields) * 20;
  score += toArray(node.jsdoc && node.jsdoc.params).length * 10;
  score += toArray(node.jsdoc && node.jsdoc.returns).length * 10;
  score += toArray(node.jsdoc && node.jsdoc.properties).length * 8;
  score += toArray(node.jsdoc && node.jsdoc.examples).length * 8;
  score += toArray(node.source && node.source.references).length * 12;
  score += toArray(node.diagnostics).length;

  return score;
}

function hasIntegrationNodeContent(node) {
  if (!node || !node.id || !node.name) {
    return false;
  }

  if (node.kind === "package" && /undefined/.test(String(node.longname || node.name || ""))) {
    return false;
  }

  return scoreIntegrationNode(node) > 0;
}

function buildIntegrationEntries(doclets, state) {
  const result = [];
  const indexesById = new Map();

  for (const doclet of doclets) {
    const node = toIntegrationNode(doclet, state);

    if (!hasIntegrationNodeContent(node)) {
      continue;
    }

    const existingIndex = indexesById.get(node.id);

    if (existingIndex === undefined) {
      indexesById.set(node.id, result.length);
      result.push({
        doclet,
        node
      });
      continue;
    }

    if (scoreIntegrationNode(node) > scoreIntegrationNode(result[existingIndex].node)) {
      result[existingIndex] = {
        doclet,
        node
      };
    }
  }

  return result;
}

function isUnsafePathLike(value) {
  const text = String(value || "");

  if (/^[A-Za-z]:[\\/]/.test(text) || /^\\\\/.test(text)) {
    return true;
  }

  if (/^\/(?!\/)/.test(text) && !/^\/\//.test(text)) {
    return true;
  }

  return text.split(/[\\/]/).includes("..");
}

function sanitizeIntegrationValue(value, key = "") {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeIntegrationValue(item))
      .filter((item) => item !== undefined);
  }

  if (value && typeof value === "object") {
    const record = {};

    for (const [itemKey, itemValue] of Object.entries(value)) {
      if (/filePath$/i.test(itemKey)) {
        continue;
      }

      const sanitized = sanitizeIntegrationValue(itemValue, itemKey);

      if (sanitized !== undefined) {
        record[itemKey] = sanitized;
      }
    }

    return record;
  }

  if (key === "openMode") {
    return normalizeOpenMode(value);
  }

  if (
    typeof value === "string" &&
    /(?:path|file|root|output)$/i.test(key) &&
    isUnsafePathLike(value)
  ) {
    return undefined;
  }

  return value;
}

function normalizeDiagnostic(diagnostic, targetPath) {
  const sanitized = sanitizeIntegrationValue(diagnostic || {});

  return {
    code: sanitized.code || "HIA0000",
    severity: sanitized.severity === "error" || sanitized.severity === "warning" || sanitized.severity === "info"
      ? sanitized.severity
      : "warning",
    message: sanitized.message || "Unknown HIA diagnostic.",
    targetPath: sanitized.targetPath || sanitized.path || targetPath,
    path: sanitized.path || sanitized.targetPath || targetPath,
    plugin: sanitized.plugin || "core",
    range: sanitized.range || null,
    data: sanitized.data && typeof sanitized.data === "object" && !Array.isArray(sanitized.data)
      ? sanitized.data
      : null
  };
}

function normalizeDiagnostics(diagnostics, targetPath) {
  return toArray(diagnostics).map((diagnostic, index) => (
    normalizeDiagnostic(diagnostic, `${targetPath}.${index}`)
  ));
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

  const node = {
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
    diagnostics: normalizeDiagnostics(metadata.diagnostics, `ir.nodes.${getNodeId(doclet)}.diagnostics`)
  };

  return sanitizeIntegrationValue(node);
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
  const integrationEntries = buildIntegrationEntries(doclets, state);
  const nodes = integrationEntries.map((entry) => entry.node);
  const integrationDoclets = integrationEntries.map((entry) => entry.doclet);

  return sanitizeIntegrationValue({
    contract: INTEGRATION_CONTRACT,
    contractVersion: CONTRACT_VERSION,
    pluginVersion: VERSION,
    mode: state.config.mode === "hiaIntegration" ? "hiaIntegration" : "standalone",
    artifactKind: "hia-integration",
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
    diagnostics: normalizeDiagnostics(getDiagnostics(state), "diagnostics"),
    diagnosticCounts: state.output.diagnosticCounts || state.diagnostics.countBySeverity(),
    docletNodeMap: buildDocletNodeMap(integrationDoclets)
  });
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
