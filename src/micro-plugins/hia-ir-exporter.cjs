"use strict";

/**
 * @file
 * @lang zh-CN IR导出微插件，协调解析缓存、Integration和可选文档源码地图。
 * @lang en IR export micro-plugin coordinating parse caches, Integration and optional documentation source maps.
 */

const path = require("node:path");
const {
  buildOutputContract,
  resolveIntegrationOutputFile,
  writeIntegrationOutput
} = require("../runtime/output-contract.cjs");
const {
  buildJsdocDocSourceMap,
  clearJsdocDocSourceMap,
  writeJsdocDocSourceMap
} = require("../runtime/doc-source-map.cjs");
const { VERSION } = require("../version.cjs");

/**
 * @lang zh-CN 将 sidecar 失败限制为固定公开安全诊断，并同步本轮状态供宿主阻断失败产物。
 * @lang en Restricts sidecar failure to a fixed public-safe diagnostic and updates run state so the host can reject failed output.
 * @param {object} context 插件上下文。 / Plugin context.
 * @param {string} code 固定诊断码。 / Fixed diagnostic code.
 * @param {string} message 固定诊断文案。 / Fixed diagnostic message.
 * @returns {void} 不返回值。 / Returns nothing.
 */
function recordSourceMapFailure(context, code, message) {
  context.addDiagnostic({ code, severity: "error", message, plugin: "hia-ir-exporter" });
  context.state.output.diagnostics = context.diagnostics.list();
  context.state.output.diagnosticCounts = context.diagnostics.countBySeverity();
}

/**
 * @lang zh-CN 将 doclet 投影为内部解析阶段节点；最终 integration 节点另由 output contract 择优生成。
 * @lang en Projects a doclet into an internal parse-stage node; the output contract selects final integration nodes separately.
 * @param {object} doclet JSDoc 文档节点。 / JSDoc doclet.
 * @param {object} context 插件上下文。 / Plugin context.
 * @returns {object} 解析阶段节点。 / Parse-stage node.
 */
function toNode(doclet, context) {
  // <lang><zh-CN>doclet 的 HIA 元数据是解析阶段节点的数据源。</zh-CN><en>The doclet's HIA metadata supplies the parse-stage node.</en></lang>
  const metadata = context.ensureDocletHia(doclet);

  return {
    id: metadata.doclet.longname || metadata.doclet.name,
    name: metadata.doclet.name,
    longname: metadata.doclet.longname,
    kind: metadata.doclet.kind,
    source: metadata.source,
    i18n: metadata.i18n
  };
}

/**
 * @lang zh-CN 解析完成与最终写入钩子，文件写入服从已配置输出和公开安全错误策略。
 * @lang en Parse-completion and final-output hooks, with file writes governed by configured outputs and public-safe errors.
 */
module.exports = {
  /**
   * @lang zh-CN 配置筛选与失败诊断使用的IR导出插件名。
   * @lang en IR-export identity used for configuration filtering and failure diagnostics.
   */
  name: "hia-ir-exporter",
  /**
   * @lang zh-CN 在诊断汇总之后运行的最终导出排序权重110。
   * @lang en Final-export scheduling weight 110 runs after diagnostic aggregation.
   */
  order: 110,

  /**
   * @lang zh-CN 缓存 parseComplete 的 doclet 与解析阶段 IR，供最终处理阶段回退使用。
   * @lang en Caches parseComplete doclets and parse-stage IR for fallback in the final processing stage.
   * @param {object} event JSDoc parseComplete 事件。 / JSDoc parseComplete event.
   * @param {object} context 插件上下文。 / Plugin context.
   * @returns {void} 更新内部状态。 / Updates internal state.
   */
  parseComplete(event, context) {
    // <lang><zh-CN>缓存本次事件的节点引用，缺数组时使用空列表供最终阶段回退。</zh-CN><en>Cache this event's node references, using an empty list when absent for final-stage fallback.</en></lang>
    const doclets = event && Array.isArray(event.doclets) ? event.doclets : [];

    context.state.doclets = doclets;
    context.state.integration.ir = {
      version: VERSION,
      mode: context.config.mode,
      nodes: doclets.map((doclet) => toNode(doclet, context))
    };
  },

  /**
   * @lang zh-CN 写出既有 integration，并仅在显式启用时写独立 1.1.0 地图；地图失败通过固定诊断闭包。
   * @lang en Writes the legacy integration and, only when opted in, an independent 1.1.0 map; fixed diagnostics close map failures.
   * @param {object} event JSDoc processingComplete 事件。 / JSDoc processingComplete event.
   * @param {object} context 插件上下文。 / Plugin context.
   * @returns {void} 更新内部状态并可能写入文件。 / Updates state and may write files.
   */
  processingComplete(event, context) {
    // <lang><zh-CN>新映射开启时先清理上轮 sidecar；即使投影或 integration 写入失败也不得留下旧成功文件。</zh-CN><en>When the new map is enabled, clear a prior sidecar first so projection or integration failures cannot leave a stale success file.</en></lang>
    const mapEnabled = context.config.docSourceMap?.enabled === true;
    // <lang><zh-CN>仅地图开启时解析计划路径，用于先清理本次目标旁的旧侧车。</zh-CN><en>Resolve the planned path only when maps are enabled, to clear the old sidecar beside this run's target.</en></lang>
    const plannedFile = mapEnabled ? resolveIntegrationOutputFile(context.state) : "";
    if (mapEnabled) delete context.state.output.docSourceMapOutputFile;
    if (plannedFile) {
      try {
        clearJsdocDocSourceMap(plannedFile);
      } catch {
        recordSourceMapFailure(context, "HIA_DOC_SOURCE_MAP_WRITE_FAILED", "Cannot write JSDoc documentation source map.");
        return;
      }
    }

    // <lang><zh-CN>只将 processingComplete 的最终 doclet 集合投影成两份既有产物。</zh-CN><en>Project only the final processingComplete doclet set into the two existing outputs.</en></lang>
    const doclets = event && Array.isArray(event.doclets)
      ? event.doclets
      : context.state.doclets;
    // <lang><zh-CN>由同一最终节点集合构造现有独立输出与Integration，不以缓存替换有效事件。</zh-CN><en>Build existing standalone and Integration outputs from the same final nodes, without substituting cached nodes for valid events.</en></lang>
    const output = buildOutputContract(context.state, doclets);

    context.state.output.standalone = output.standalone;
    context.state.output.integration = output.integration;
    context.state.output.themeContract = output.standalone.theme;
    context.state.integration.ir = output.integration.ir;

    try {
      // <lang><zh-CN>写者返回实际写入文件名；禁用输出时的空值决定地图诊断分支。</zh-CN><en>The writer returns the actual output filename; an empty value when disabled determines map diagnostics.</en></lang>
      const writtenFile = writeIntegrationOutput(context.state, output.integration);

      if (writtenFile) {
        context.state.output.integrationOutputFile = writtenFile;
        if (mapEnabled) {
          try {
            // <lang><zh-CN>独立地图仅使用同一轮 integration 所选 doclet 和 beforeParse 捕获的源码，不改动旧契约。</zh-CN><en>The independent map uses only doclets selected for same-run integration and beforeParse source, without changing the legacy contract.</en></lang>
            const map = buildJsdocDocSourceMap({
              integration: output.integration,
              doclets,
              sourceFiles: context.state.sourceFiles,
              sourceRoot: context.config.source.basePath || process.cwd(),
              metadataKey: context.config.metadataKey,
              artifactPath: path.basename(writtenFile)
            });
            context.state.output.docSourceMapOutputFile = writeJsdocDocSourceMap(map, writtenFile);
          } catch {
            recordSourceMapFailure(context, "HIA_DOC_SOURCE_MAP_WRITE_FAILED", "Cannot write JSDoc documentation source map.");
          }
        }
      } else if (mapEnabled) {
        recordSourceMapFailure(context, "HIA_DOC_SOURCE_MAP_REQUIRES_INTEGRATION", "JSDoc documentation source map requires an integration output.");
      }
    } catch (error) {
      if (mapEnabled) {
        // <lang><zh-CN>选择新契约的运行不得在异常诊断中回显磁盘私有路径或系统错误正文。</zh-CN><en>An opt-in run must not echo private disk paths or system-error text in its failure diagnostic.</en></lang>
        recordSourceMapFailure(context, "HIA_INTEGRATION_OUTPUT_WRITE_FAILED", "Cannot write HIA integration output.");
        return;
      }
      context.addDiagnostic({
        code: "HIA_INTEGRATION_OUTPUT_WRITE_FAILED",
        severity: "error",
        message: `Cannot write HIA integration output: ${error.message}`,
        plugin: this.name,
        data: {
          outputFile: context.config.integration.outputFile || ""
        }
      });
      context.state.output.diagnostics = context.diagnostics.list();
      context.state.output.diagnosticCounts = context.diagnostics.countBySeverity();
    }
  }
};
