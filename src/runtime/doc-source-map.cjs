"use strict";

/**
 * @lang zh-CN 从最终 JSDoc integration 所选 doclet 构造独立文档源码映射；只在原生 AST、同一源码字节及安全路径均可核实时声明精确范围。
 * @lang en Builds an independent documentation source map from the doclets selected for final JSDoc integration; exact ranges require native AST, matching source text, and safe paths.
 */

const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { VERSION } = require("../version.cjs");
const { buildIntegrationEntries } = require("./output-contract.cjs");

/** @lang zh-CN 侧写文件名固定为 integration 的同级文件。 @lang en The sidecar uses a fixed filename beside integration. */
const DOC_SOURCE_MAP_FILE = "hia-doc-source-map.json";
/** @lang zh-CN 当前原生 JSDoc AST 精度声明仅覆盖 JavaScript 源文件扩展名。 @lang en Native JSDoc AST precision currently covers only JavaScript source extensions. */
const JS_SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".jsx"]);
/** @lang zh-CN 当前已通过真实 AST 与预处理探针的 JSDoc 解析器版本。 @lang en JSDoc parser version proven by real AST and pretreatment probes. */
const VERIFIED_JSDOC_VERSION = "4.0.5";

/**
 * @lang zh-CN 读取本插件可解析的 JSDoc peer 版本；缺失时仅保留身份地图，不声明范围精度。
 * @lang en Reads the JSDoc peer version visible to this plugin; absence retains identity mappings without exact ranges.
 * @returns {string} 已安装版本或空串。 / Installed version or an empty string.
 */
function getInstalledJsdocVersion() {
  try {
    return require("jsdoc/package.json").version || "";
  } catch {
    return "";
  }
}

/**
 * @lang zh-CN 检查相对路径的段、控制字符与 Unicode 编码安全性，防止公开地图记录越根或 Windows 备用数据流。
 * @lang en Checks relative path segments, control characters, and Unicode encoding so a public map cannot carry traversal or Windows alternate data streams.
 * @param {string} relativePath 待核路径。 / Candidate relative path.
 * @returns {boolean} 路径能否作为公开安全相对路径。 / Whether the path is safe for publication.
 */
function isSafeRelativePath(relativePath) {
  if (!relativePath || path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) return false;
  // <lang><zh-CN>控制字符可被 URI 编码，但不能作为公开路径或来源身份的一部分。</zh-CN><en>Control characters are URI-encodable but must not become public path or source identity data.</en></lang>
  if (/[\u0000-\u001f\u007f]/.test(relativePath)) return false;
  // <lang><zh-CN>统一分隔符后逐段拒绝路径逃逸与流标识符。</zh-CN><en>Normalize separators and reject traversal and stream identifiers per segment.</en></lang>
  const parts = relativePath.replaceAll("\\", "/").split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part.includes(":"))) return false;
  try {
    encodeURIComponent(relativePath);
    return true;
  } catch {
    // <lang><zh-CN>孤立代理项不能成为可逆 source ID。</zh-CN><en>Unpaired surrogates cannot form a reversible source ID.</en></lang>
    return false;
  }
}

/**
 * @lang zh-CN 限制 sidecar 对象只包含本 writer 明确生成的字段，防止写盘前注入意外的私有正文或路径。
 * @lang en Restricts sidecar objects to fields explicitly produced by this writer, preventing injected private text or paths.
 * @param {object} value 待核对象。 / Candidate object.
 * @param {string[]} allowed 允许字段。 / Allowed keys.
 * @returns {boolean} 是否为无额外字段的普通对象。 / Whether this is a plain object without extra keys.
 */
function hasOnlyKeys(value, allowed) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).every((key) => allowed.includes(key));
}

/**
 * @lang zh-CN 排除当前 JSDoc 4 解析器在 beforeParse 后改写源码的三类输入；未建立偏移迁移前不能将 AST 坐标套到磁盘原文。
 * @lang en Excludes three source forms that the current JSDoc 4 parser rewrites after beforeParse; AST offsets cannot address original disk text without a proven translation.
 * @param {string} source beforeParse 最终源码。 / Final beforeParse source.
 * @returns {boolean} 解析器预处理是否不会改变文本。 / Whether parser pretreatment leaves the text unchanged.
 */
function isUntouchedByJsdocPretreatment(source) {
  // <lang><zh-CN>对应已安装 JSDoc 4.0.5 parser 的 hashbang、保留注释及相邻 doclet 三个替换分支；发现匹配即保守降级。</zh-CN><en>Mirror the installed JSDoc 4.0.5 parser's hashbang, retained-comment, and adjacent-doclet replacement branches; any match conservatively removes precision.</en></lang>
  return !/^(#![\S \t]+\r?\n)/.test(source) && !source.includes("/*!*") && !/\*\/\/\*\*+/.test(source);
}

/**
 * @lang zh-CN 将 JSDoc 的绝对文件身份与本轮 beforeParse 捕获的源码精确配对，且要求文件真实留在根内、内容未被改写。
 * @lang en Matches a doclet's absolute file identity to captured beforeParse source and requires an unchanged real file within the root.
 * @param {object} doclet 最终选中的 doclet。 / Finally selected doclet.
 * @param {Map<string,object>} sourceFiles 本轮捕获记录。 / Captured source records.
 * @param {string} sourceRoot 实际源码根。 / Real source root.
 * @param {Map<string,object|null>} verifiedCache 本轮单文件核验缓存。 / Per-run verified-file cache.
 * @returns {{path:string,text:string}|null} 已核相对路径与文本，或空值。 / Verified relative path and text, or null.
 */
function resolveVerifiedSource(doclet, sourceFiles, sourceRoot, verifiedCache) {
  // <lang><zh-CN>虚拟或不完整元数据不能推测文件身份。</zh-CN><en>Virtual or incomplete metadata cannot imply a file identity.</en></lang>
  const meta = doclet && doclet.meta;
  if (!meta || typeof meta.filename !== "string" || !meta.filename) return null;
  // <lang><zh-CN>先用配置根做词法过滤，再用真实路径阻断符号链接越界；不同来源文件不作模糊匹配。</zh-CN><en>Apply lexical containment first, then real-path containment against symlink escape; distinct source files are never matched loosely.</en></lang>
  const candidate = path.resolve(meta.path || process.cwd(), meta.filename);
  if (!JS_SOURCE_EXTENSIONS.has(path.extname(candidate).toLowerCase())) return null;
  const lexicalPath = path.relative(sourceRoot, candidate).replaceAll("\\", "/");
  if (!isSafeRelativePath(lexicalPath)) return null;
  if (verifiedCache.has(candidate)) return verifiedCache.get(candidate);

  // <lang><zh-CN>只使用同一解析轮次记录的精确绝对文件，不做 basename 或大小写尾缀猜测。</zh-CN><en>Use only the exact absolute file captured in this parse; never guess by basename or case-insensitive suffix.</en></lang>
  const record = sourceFiles.get(candidate);
  // <lang><zh-CN>事件对象保留后续插件最终交给解析器的源码；它与先前快照不同时不得声称磁盘原文坐标。</zh-CN><en>The event object retains the source later plugins leave for parsing; a difference from the earlier snapshot forbids original-file coordinates.</en></lang>
  if (!record || typeof record.filePath !== "string" || path.resolve(record.filePath) !== candidate || typeof record.source !== "string" ||
    !record.sourceEvent || record.sourceEvent.filename !== record.filePath || record.sourceEvent.source !== record.source) return null;
  if (!isUntouchedByJsdocPretreatment(record.source)) return null;
  try {
    // <lang><zh-CN>真实根与真实文件分开核查，避免工作区内链接指向外部。</zh-CN><en>Check the real root and file separately so a workspace symlink cannot target an external file.</en></lang>
    const realRoot = fs.realpathSync.native(sourceRoot);
    const realFile = fs.realpathSync.native(candidate);
    const realRelative = path.relative(realRoot, realFile).replaceAll("\\", "/");
    if (!isSafeRelativePath(realRelative) || !fs.statSync(realFile).isFile()) return null;
    // <lang><zh-CN>beforeParse 可能被其他插件改写；与磁盘原文不一致时不把解析器偏移说成原始源码坐标。</zh-CN><en>Other plugins may rewrite beforeParse text; mismatches must not claim parser offsets in original source.</en></lang>
    if (fs.readFileSync(realFile, "utf8") !== record.source) return null;
    const verified = { path: realRelative, text: record.source };
    verifiedCache.set(candidate, verified);
    return verified;
  } catch {
    // <lang><zh-CN>无法核实的文件只失去精确引用，保持 integration 节点。</zh-CN><en>An unverifiable file loses its exact reference while its integration node remains.</en></lang>
    return null;
  }
}

/**
 * @lang zh-CN 将 UTF-16 偏移换成一基物理行列，CRLF 计作一次换行。
 * @lang en Converts a UTF-16 offset to one-based physical line and column, counting CRLF as one newline.
 * @param {string} source 原始文本。 / Original text.
 * @param {number} offset UTF-16 代码单元偏移。 / UTF-16 code-unit offset.
 * @returns {{line:number,column:number}} 一基物理坐标。 / One-based physical position.
 */
function positionAt(source, offset) {
  // <lang><zh-CN>JS 字符串切片以 UTF-16 代码单元计，按物理换行切分后最后一段长度即一基列减一。</zh-CN><en>JS slicing counts UTF-16 code units; after splitting physical lines, the final segment length is the one-based column minus one.</en></lang>
  const lines = source.slice(0, offset).split(/\r\n|\r|\n/);
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

/**
 * @lang zh-CN 仅从与选中 doclet 绑定的实际 AST 节点取得非空、排除终点的区间。
 * @lang en Takes a nonempty exclusive range only from the actual AST node attached to the selected doclet.
 * @param {object} doclet 最终选中的 doclet。 / Finally selected doclet.
 * @param {string} source 已核磁盘文本。 / Verified on-disk source text.
 * @returns {object|null} 一基范围或空值。 / One-based range or null.
 */
function exactAstRange(doclet, source) {
  // <lang><zh-CN>同时要求 doclet 元数据区间和它实际持有的 AST 节点区间一致，拒绝虚拟声明或猜测区间。</zh-CN><en>Require both doclet metadata and its attached AST node to agree, rejecting virtual declarations and guessed ranges.</en></lang>
  const range = doclet?.meta?.range;
  const node = doclet?.meta?.code?.node;
  if (!Array.isArray(range) || range.length !== 2 || !node || typeof node.type !== "string" || !Array.isArray(node.range)) return null;
  const [start, end] = range;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > source.length) return null;
  if (node.range[0] !== start || node.range[1] !== end || !source.slice(start, end).trim()) return null;
  return { start: positionAt(source, start), end: positionAt(source, end) };
}

/**
 * @lang zh-CN 用与 integration 相同的择优算法构造无源码正文的 1.1.0 地图，并拒绝两次投影顺序或身份不一致。
 * @lang en Uses the same selection algorithm as integration to build a source-free 1.1.0 map, rejecting projection-order or identity mismatches.
 * @param {object} options 同轮 integration、doclet、源码与根信息。 / Same-run integration, doclets, source records, and root.
 * @returns {object} 独立文档源码映射工件。 / Independent documentation source-map artifact.
 * @throws {TypeError} integration 身份或选中结果不一致。 / If integration identity or selection differs.
 */
function buildJsdocDocSourceMap(options) {
  // <lang><zh-CN>入口只接受同轮 integration 与 beforeParse 源记录；选择算法再次执行后必须与产物 ID 顺序相同。</zh-CN><en>The entry point accepts same-run integration and beforeParse records; repeating selection must match the artifact's node IDs and order.</en></lang>
  const { integration, doclets, sourceFiles, sourceRoot } = options || {};
  if (integration?.contract !== "hia-jsdoc-integration" || !Array.isArray(integration?.ir?.nodes) || !Array.isArray(doclets) || !(sourceFiles instanceof Map) || typeof sourceRoot !== "string") {
    throw new TypeError("JSDoc source-map inputs are invalid.");
  }
  const metadataKey = options.metadataKey || "hia";
  // <lang><zh-CN>版本证据限定精度能力；未知 JSDoc 版本仍可消费节点身份与工件引用。</zh-CN><en>Version evidence gates precision; unknown JSDoc versions still provide node identity and artifact references.</en></lang>
  const jsdocVersion = typeof options.jsdocVersion === "string" ? options.jsdocVersion : getInstalledJsdocVersion();
  const selected = buildIntegrationEntries(doclets, { config: { metadataKey } });
  if (selected.length !== integration.ir.nodes.length || selected.some((item, index) => item.node.id !== integration.ir.nodes[index].id)) {
    throw new TypeError("JSDoc integration selection differs from source-map selection.");
  }

  // <lang><zh-CN>仅发布实际被精确引用的工作区内源码文件。</zh-CN><en>Publish only workspace sources used by verified exact references.</en></lang>
  const sources = new Map();
  // <lang><zh-CN>同一源码常对应大量 doclet；每轮只读盘核验一次，不跨运行复用。</zh-CN><en>Many doclets may share a file; verify it from disk once per run and never reuse the result across runs.</en></lang>
  const verifiedCache = new Map();
  const entries = selected.map(({ doclet, node }, index) => {
    const source = jsdocVersion === VERIFIED_JSDOC_VERSION
      ? resolveVerifiedSource(doclet, sourceFiles, path.resolve(sourceRoot), verifiedCache)
      : null;
    const range = source ? exactAstRange(doclet, source.text) : null;
    const sourceRefs = [];
    if (source && range) {
      const sourceId = `source:${encodeURIComponent(source.path)}`;
      if (!sources.has(sourceId)) {
        sources.set(sourceId, {
          id: sourceId,
          kind: "javascript-source",
          path: source.path,
          language: "javascript",
          role: "original",
          sourcesContentPolicy: "none"
        });
      }
      sourceRefs.push({
        sourceId,
        range,
        rangeConvention: { endBoundary: "exclusive", columnUnit: "utf16-code-unit" },
        rangeSource: "parser",
        rangeSourceDetail: "jsdoc-ast",
        confidence: "high"
      });
    }
    return {
      id: `entry:${index}`,
      kind: "symbol",
      symbolId: node.id,
      symbolKind: node.kind || "unknown",
      sourceRefs,
      artifactRefs: [{ artifactId: "artifact:jsdoc-integration", selector: `ir.nodes.${index}`, rangeSource: "adapter", confidence: "high" }],
      diagnostics: []
    };
  });

  const artifactPath = options.artifactPath || "hia-integration.json";
  if (!isSafeRelativePath(artifactPath)) throw new TypeError("JSDoc integration artifact path is invalid.");
  return {
    contract: "doc-source-map",
    contractVersion: "1.1.0",
    id: "jsdoc-doc-source-map",
    producer: { name: "@mandolin/jsdoc-plugin-hia-sys", version: VERSION, runtime: "jsdoc", profile: "jsdoc" },
    artifacts: [{ id: "artifact:jsdoc-integration", kind: "jsdoc-integration", path: artifactPath, format: "json" }],
    sources: [...sources.values()],
    sourceMaps: [],
    chains: [],
    entries,
    privacy: { sourcesContentPolicy: "none", allowAbsolutePaths: false, allowUncPaths: false, allowPathTraversal: false },
    diagnostics: []
  };
}

/**
 * @lang zh-CN 写盘前重核工件身份、相对路径、无正文隐私声明及直接 AST 范围，拒绝 builder 之后的数据污染。
 * @lang en Rechecks artifact identity, relative paths, source-free privacy, and direct AST ranges before writing, rejecting post-build contamination.
 * @param {object} map 待写地图。 / Candidate map.
 * @param {string} integrationOutputFile 已存在的 integration 路径。 / Existing integration path.
 * @returns {boolean} 是否满足本 writer 的有限 1.1.0 输出形状。 / Whether this writer's narrow 1.1.0 output shape is valid.
 */
function isSafeMapForWrite(map, integrationOutputFile) {
  // <lang><zh-CN>本写入器只接受自己生成的固定工件形状；未知字段可能暗藏源码正文或绝对路径。</zh-CN><en>This writer accepts only its fixed artifact shape; unknown fields could hide source text or absolute paths.</en></lang>
  if (!hasOnlyKeys(map, ["contract", "contractVersion", "id", "producer", "artifacts", "sources", "sourceMaps", "chains", "entries", "privacy", "diagnostics"]) ||
    map.contract !== "doc-source-map" || map.contractVersion !== "1.1.0" || map.id !== "jsdoc-doc-source-map" ||
    !hasOnlyKeys(map.producer, ["name", "version", "runtime", "profile"]) ||
    map.producer.name !== "@mandolin/jsdoc-plugin-hia-sys" || map.producer.version !== VERSION ||
    map.producer.runtime !== "jsdoc" || map.producer.profile !== "jsdoc" ||
    !Array.isArray(map.artifacts) || map.artifacts.length !== 1 ||
    !hasOnlyKeys(map.artifacts[0], ["id", "kind", "path", "format"]) ||
    map.artifacts[0]?.id !== "artifact:jsdoc-integration" ||
    map.artifacts[0]?.kind !== "jsdoc-integration" || map.artifacts[0]?.format !== "json" ||
    map.artifacts[0]?.path !== path.basename(integrationOutputFile) ||
    !isSafeRelativePath(map.artifacts[0].path) ||
    !Array.isArray(map.sources) || !Array.isArray(map.entries) ||
    !Array.isArray(map.sourceMaps) || map.sourceMaps.length !== 0 ||
    !Array.isArray(map.chains) || map.chains.length !== 0 ||
    !Array.isArray(map.diagnostics) || map.diagnostics.length !== 0 ||
    !hasOnlyKeys(map.privacy, ["sourcesContentPolicy", "allowAbsolutePaths", "allowUncPaths", "allowPathTraversal"]) ||
    map.privacy?.sourcesContentPolicy !== "none" ||
    map.privacy?.allowAbsolutePaths !== false || map.privacy?.allowUncPaths !== false ||
    map.privacy?.allowPathTraversal !== false) return false;

  // <lang><zh-CN>每个源身份必须由单一安全相对路径推导，且不得附带源码正文。</zh-CN><en>Each source identity must derive from one safe relative path without embedded source text.</en></lang>
  const sourceIds = new Set();
  for (const source of map.sources) {
    if (!hasOnlyKeys(source, ["id", "kind", "path", "language", "role", "sourcesContentPolicy"]) ||
      !isSafeRelativePath(source.path) || source.id !== `source:${encodeURIComponent(source.path)}` ||
      !JS_SOURCE_EXTENSIONS.has(path.extname(source.path).toLowerCase()) ||
      source.kind !== "javascript-source" || source.language !== "javascript" || source.role !== "original" ||
      source.sourcesContentPolicy !== "none" || sourceIds.has(source.id)) return false;
    sourceIds.add(source.id);
  }

  // <lang><zh-CN>本 writer 只发布可核实的排除终点/UTF-16 源范围，以及与同轮 integration 的直接节点引用。</zh-CN><en>This writer publishes only verified exclusive UTF-16 source ranges and direct references to same-run integration nodes.</en></lang>
  return map.entries.every((entry, index) => hasOnlyKeys(entry, ["id", "kind", "symbolId", "symbolKind", "sourceRefs", "artifactRefs", "diagnostics"]) &&
    entry.id === `entry:${index}` && entry.kind === "symbol" && typeof entry.symbolId === "string" && entry.symbolId.length > 0 &&
    typeof entry.symbolKind === "string" && entry.symbolKind.length > 0 &&
    Array.isArray(entry.sourceRefs) && entry.sourceRefs.length <= 1 &&
    entry.sourceRefs.every((ref) => {
      const range = ref?.range;
      const start = range?.start;
      const end = range?.end;
      return hasOnlyKeys(ref, ["sourceId", "range", "rangeConvention", "rangeSource", "rangeSourceDetail", "confidence"]) &&
        hasOnlyKeys(range, ["start", "end"]) && hasOnlyKeys(start, ["line", "column"]) && hasOnlyKeys(end, ["line", "column"]) &&
        hasOnlyKeys(ref.rangeConvention, ["endBoundary", "columnUnit"]) &&
        sourceIds.has(ref?.sourceId) && ref.rangeSource === "parser" && ref.rangeSourceDetail === "jsdoc-ast" &&
        ref.confidence === "high" && ref.rangeConvention?.endBoundary === "exclusive" &&
        ref.rangeConvention?.columnUnit === "utf16-code-unit" &&
        Number.isSafeInteger(start?.line) && start.line >= 1 && Number.isSafeInteger(start?.column) && start.column >= 1 &&
        Number.isSafeInteger(end?.line) && end.line >= 1 && Number.isSafeInteger(end?.column) && end.column >= 1 &&
        (end.line > start.line || (end.line === start.line && end.column > start.column));
    }) &&
    Array.isArray(entry.artifactRefs) && entry.artifactRefs.length === 1 &&
    hasOnlyKeys(entry.artifactRefs[0], ["artifactId", "selector", "rangeSource", "confidence"]) &&
    entry.artifactRefs[0]?.artifactId === "artifact:jsdoc-integration" &&
    entry.artifactRefs[0]?.selector === `ir.nodes.${index}` &&
    entry.artifactRefs[0]?.rangeSource === "adapter" && entry.artifactRefs[0]?.confidence === "high" &&
    Array.isArray(entry.diagnostics) && entry.diagnostics.length === 0);
}

/**
 * @lang zh-CN 在实际 integration 文件旁原子写入固定名称 sidecar，避免部分 JSON 被当成成功工件。
 * @lang en Atomically writes a fixed-name sidecar beside an existing integration file, preventing partial JSON from being treated as an artifact.
 * @param {object} map 已预检映射。 / Preflighted map.
 * @param {string} integrationOutputFile 已写入的 integration 路径。 / Path of the written integration file.
 * @returns {string} 实际 sidecar 路径。 / Actual sidecar path.
 * @throws {TypeError|Error} 输入或文件写入失败。 / Invalid inputs or file write failure.
 */
function writeJsdocDocSourceMap(map, integrationOutputFile) {
  // <lang><zh-CN>路径错误只产生固定错误；不把底层文件系统异常及绝对路径回显给调用方。</zh-CN><en>Path errors produce a fixed failure without echoing filesystem exceptions or absolute paths to the caller.</en></lang>
  let integrationIsFile = false;
  let sameRealDirectory = false;
  if (typeof integrationOutputFile === "string" && integrationOutputFile) {
    try {
      integrationIsFile = fs.statSync(integrationOutputFile).isFile();
      // <lang><zh-CN>文件符号链接不得把 integration 指向另一真实目录，而地图仍落在配置目录。</zh-CN><en>A file symlink must not send integration into another real directory while the map stays beside the configured path.</en></lang>
      const realIntegration = fs.realpathSync.native(integrationOutputFile);
      const realDirectory = fs.realpathSync.native(path.dirname(integrationOutputFile));
      sameRealDirectory = path.dirname(realIntegration) === realDirectory;
    } catch {
      integrationIsFile = false;
    }
  }
  if (!integrationIsFile || !sameRealDirectory || !isSafeMapForWrite(map, integrationOutputFile)) {
    throw new TypeError("JSDoc source-map output preflight failed.");
  }
  // <lang><zh-CN>临时文件与固定 sidecar 同目录，最终 rename 只在完成序列化后发布。</zh-CN><en>The temporary file shares the sidecar directory; final rename publishes only after serialization completes.</en></lang>
  const outputFile = path.join(path.dirname(integrationOutputFile), DOC_SOURCE_MAP_FILE);
  const temporaryFile = `${outputFile}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryFile, `${JSON.stringify(map, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    fs.renameSync(temporaryFile, outputFile);
    return outputFile;
  } catch {
    // <lang><zh-CN>只清理固定同级文件与本轮临时文件，避免旧地图被误认作本轮成功。</zh-CN><en>Remove only the fixed sibling and this run's temporary file so a stale map cannot appear successful.</en></lang>
    for (const file of [temporaryFile, outputFile]) {
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch {
        // <lang><zh-CN>清理失败仍保持固定错误，不公开文件系统路径。</zh-CN><en>Cleanup failure retains the fixed error without publishing filesystem paths.</en></lang>
      }
    }
    throw new Error("JSDoc source-map write failed.");
  }
}

/**
 * @lang zh-CN 显式启用的新一轮构建开始前清除同级旧 sidecar，防止失败后被误作本轮工件。
 * @lang en Clears a prior fixed sibling sidecar before an opt-in build so a failure cannot expose stale output.
 * @param {string} integrationOutputFile 本轮 integration 路径。 / This run's integration path.
 * @returns {void} 不返回值。 / Returns nothing.
 * @throws {TypeError|Error} 路径无效或清理失败。 / Invalid path or unlink failure.
 */
function clearJsdocDocSourceMap(integrationOutputFile) {
  if (typeof integrationOutputFile !== "string" || !integrationOutputFile) throw new TypeError("JSDoc integration output path is invalid.");
  const outputFile = path.join(path.dirname(integrationOutputFile), DOC_SOURCE_MAP_FILE);
  if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
}

module.exports = { DOC_SOURCE_MAP_FILE, buildJsdocDocSourceMap, clearJsdocDocSourceMap, writeJsdocDocSourceMap };
