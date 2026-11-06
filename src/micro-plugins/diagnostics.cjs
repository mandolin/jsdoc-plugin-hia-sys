"use strict";

/**
 * @file
 * @lang zh-CN 诊断微插件，将当前诊断集合附加到节点及最终状态。
 * @lang en Diagnostics micro-plugin attaching current diagnostics to nodes and final state.
 */

/**
 * @lang zh-CN 最终处理阶段的诊断汇总钩子对象，不自行清理诊断或写文件。
 * @lang en Final-processing diagnostic aggregation hooks; they neither clear diagnostics nor write files themselves.
 */
module.exports = {
  /**
   * @lang zh-CN 配置筛选和节点标记使用的诊断插件名。
   * @lang en Diagnostics identity used for configuration filtering and node marking.
   */
  name: "diagnostics",
  /**
   * @lang zh-CN 在IR最终写入之前汇总诊断的排序权重100。
   * @lang en Scheduling weight 100 aggregates diagnostics before final IR output.
   */
  order: 100,

  /**
   * @lang zh-CN 对本次有效doclet列表附加诊断，并保存当前诊断列表与级别计数；缺列表时按空列表处理。
   * @lang en Attaches diagnostics to this run's valid doclet list and stores current diagnostics and severity counts; absent lists are treated as empty.
   * @param {object} event <lang><zh-CN>可缺doclets数组的最终处理事件。</zh-CN><en>Final-processing event whose doclets array may be absent.</en></lang>
   * @param {object} context <lang><zh-CN>含当前诊断收集器及可变输出状态的受信上下文。</zh-CN><en>Trusted context containing the diagnostic collector and mutable output state.</en></lang>
   * @returns {void} <lang><zh-CN>就地更新节点及输出状态，无返回值。</zh-CN><en>Updates nodes and output state in place and returns nothing.</en></lang>
   */
  processingComplete(event, context) {
    // <lang><zh-CN>列表只引用本次事件的doclet，缺失或非数组时使用本地空列表。</zh-CN><en>The list references this event's doclets, using a local empty list for missing or non-array input.</en></lang>
    const doclets = event && Array.isArray(event.doclets) ? event.doclets : [];

    // <lang><zh-CN>逐节点复用同一上下文诊断，不生成虚构节点。</zh-CN><en>Reuse context diagnostics per node without inventing nodes.</en></lang>
    for (const doclet of doclets) {
      context.markMicroPlugin(doclet, this.name);
      context.attachDiagnostics(doclet);
    }

    // <lang><zh-CN>最后保存当前集合和计数，供后续IR输出阶段使用。</zh-CN><en>Finally retain the current collection and counts for subsequent IR output.</en></lang>
    context.state.output.diagnostics = context.diagnostics.list();
    context.state.output.diagnosticCounts = context.diagnostics.countBySeverity();
  }
};
