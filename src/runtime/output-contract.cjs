"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { normalizeOpenMode } = require("./source.cjs");
const { VERSION } = require("../version.cjs");

const CONTRACT_VERSION = "0.1.0";
const STANDALONE_CONTRACT = "jsdoc-plugin-hia-sys/standalone";
const INTEGRATION_CONTRACT = "hia-jsdoc-integration";

/**
 * @lang zh-CN
 * 标识 JPHS/JTH 共同采用的 renderer-neutral presentation contract；JPHS 不在本仓复制其 validator。
 *
 * @lang en
 * Identifies the renderer-neutral presentation contract adopted by JPHS/JTH; JPHS does not duplicate its validator here.
 */
const PRESENTATION_PROFILE_CONTRACT = "documentation-presentation-profile";

/**
 * @lang zh-CN
 * 固定当前写者1.0.0身份；renderer须核对版本配对，该handoff不是完整profile或公开授权。
 *
 * @lang en
 * Pins current writer identity 1.0.0; renderers check version pairing, and this handoff is neither a complete profile nor publication consent.
 */
const PRESENTATION_PROFILE_CONTRACT_VERSION = "1.0.0";

/** @lang zh-CN 允许传递的页面模式闭集。 @lang en Closed page-mode set accepted for handoff. */
const PRESENTATION_PAGE_MODES = new Set(["multi-page", "single-page"]);
/** @lang zh-CN 允许传递的源码模式闭集。 @lang en Closed source-mode set accepted for handoff. */
const PRESENTATION_SOURCE_MODES = new Set(["fetch", "embed", "link", "none"]);

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

/**
 * @lang zh-CN 为 integration 按节点 ID 择优保留一份 doclet 与投影节点；同分数保留首次出现者，供独立地图沿用同一身份与顺序。
 * @lang en Selects one doclet and projected node per integration ID; equal scores keep the first occurrence so an independent map can reuse the same identity and order.
 * @param {object[]} doclets 最终 JSDoc 文档节点。 / Final JSDoc doclets.
 * @param {object} state 仅需包含配置的插件状态。 / Plugin state containing configuration.
 * @returns {Array<{doclet:object,node:object}>} 按首次节点 ID 出现顺序排列的配对。 / Pairs in first-seen node ID order.
 */
function buildIntegrationEntries(doclets, state) {
  // <lang><zh-CN>结果顺序按首次节点 ID 固定，索引负责同身份候选替换。</zh-CN><en>Result order follows the first occurrence of each node ID; indexes support replacement by a stronger candidate.</en></lang>
  const result = [];
  const indexesById = new Map();

  for (const doclet of doclets) {
    // <lang><zh-CN>先用既有投影与内容规则过滤空合成节点，再按内容分数选择。</zh-CN><en>Use existing projection and content rules to filter empty synthetic nodes before scoring candidates.</en></lang>
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

/**
 * 构造 standalone theme 可消费的摘要，不把 companion profile 扩展为 HTML contract。
 * Builds a standalone-theme summary without extending the companion profile
 * into an HTML contract.
 *
 * @param {object} doclet JSDoc 文档节点 / JSDoc documentation node.
 * @param {object} state 插件状态 / Plugin state.
 * @returns {object} public summary / 公开摘要.
 */
function summarizeDoclet(doclet, state) {
  const metadata = getMetadata(doclet, state);
  const source = metadata.source || {};
  const i18n = metadata.i18n || {};
  const presentation = metadata.presentation || {};
  const presentationIdentity = presentation.identity || {};
  const presentationNavigation = presentation.navigation || {};

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
    hasHia: Boolean(metadata.version),
    presentationStableId: presentationIdentity.stableId || "",
    presentationParentLongname: presentationNavigation.parentLongname || ""
  };
}

/**
 * 投影 integration IR node，并以 additive profile 传递 presentation hint。
 * Projects an integration IR node and carries the presentation hint as an
 * additive profile.
 *
 * @param {object} doclet JSDoc 文档节点 / JSDoc documentation node.
 * @param {object} state 插件状态 / Plugin state.
 * @returns {object} sanitized integration node / 已清洗的 integration node.
 */
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
      microPlugins: metadata.microPlugins || [],
      // Presentation profile 与 JTH HTML 结构解耦，consumer 可安全忽略未知版本。
      // The presentation profile is decoupled from JTH HTML structure; consumers
      // may safely ignore an unknown version.
      presentation: metadata.presentation || null
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

/**
 * @lang zh-CN
 * 构造 JPHS 到 standalone renderer 的中性呈现 handoff。该 descriptor 只声明 contract identity、偏好和 owner 边界，
 * 不是完整 neutral profile，也不包含 DOM、CSS、源码正文或 runtime callback。
 *
 * @lang en
 * Builds the neutral presentation handoff from JPHS to a standalone renderer. This descriptor declares only contract
 * identity, preferences, and owner boundaries; it is not the complete neutral profile and contains no DOM, CSS, source
 * body, or runtime callback.
 *
 * @param {object} state 插件状态。 / Plugin state.
 * @returns {object} 可公开序列化的 owner handoff descriptor。 / Publicly serializable owner handoff descriptor.
 */
function buildPresentationHandoff(state) {
  // <lang><zh-CN>只接受 object-shaped 配置；异常输入采用冻结的规范默认值。</zh-CN><en>Accept only object-shaped configuration; malformed input uses the frozen normative defaults.</en></lang>
  const configured = state.config.presentation && typeof state.config.presentation === "object"
    ? state.config.presentation
    : {};
  // <lang><zh-CN>页面模式只在闭集中传递，避免 producer 暗示 renderer 支持未知 partition。</zh-CN><en>Carry a page mode only from the closed set so the producer never implies support for an unknown partition.</en></lang>
  const pageMode = PRESENTATION_PAGE_MODES.has(configured.pageMode) ? configured.pageMode : "multi-page";
  // <lang><zh-CN>源码模式与正文 capability 分开；此字段不会授权 JPHS 或 renderer 主动读取源码。</zh-CN><en>Keep source mode separate from body capability; this field authorizes neither JPHS nor the renderer to read source.</en></lang>
  const sourceMode = PRESENTATION_SOURCE_MODES.has(configured.sourceMode) ? configured.sourceMode : "fetch";

  return {
    contract: PRESENTATION_PROFILE_CONTRACT,
    contractVersion: PRESENTATION_PROFILE_CONTRACT_VERSION,
    role: "producer-metadata-handoff",
    defaults: {
      pageMode: "multi-page",
      sourceMode: "fetch",
      fallbackPolicy: "none"
    },
    selection: {
      pageMode,
      sourceMode,
      fallbackPolicy: "none"
    },
    owns: ["doclet-metadata", "source-metadata", "text-i18n-metadata"],
    handsOff: ["page-partition", "route-map", "source-reader", "theme-skin"]
  };
}

/**
 * 声明 standalone theme 的 metadata consumption surface，其中 presentation 仍为可选。
 * Declares the standalone theme metadata consumption surface, where
 * presentation remains optional.
 *
 * @param {object} state 插件状态 / Plugin state.
 * @param {Array<object>} doclets JSDoc 文档节点 / JSDoc documentation nodes.
 * @returns {object} theme contract descriptor / theme contract 描述对象.
 */
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
      presentation: "doclet.hia.presentation",
      diagnostics: "doclet.hia.diagnostics"
    },
    presentationProfile: buildPresentationHandoff(state),
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

/**
 * @lang zh-CN 按旧 integration 规则解析输出文件，供同级 sidecar 在写盘前清除残留。
 * @lang en Resolves the output file under existing integration rules so a sibling sidecar can clear stale output before writing.
 * @param {object} state 插件状态。 / Plugin state.
 * @returns {string} 绝对文件路径，或无配置时的空串。 / Absolute file path or empty string when not configured.
 */
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
  PRESENTATION_PROFILE_CONTRACT,
  PRESENTATION_PROFILE_CONTRACT_VERSION,
  STANDALONE_CONTRACT,
  buildIntegrationOutput,
  buildIntegrationEntries,
  buildOutputContract,
  buildStandaloneOutput,
  buildPresentationHandoff,
  buildThemeContract,
  resolveIntegrationOutputFile,
  writeIntegrationOutput
};
