"use strict";

/**
 * @file
 * @lang zh-CN 源码预览微插件，仅投影当前预览显示配置。
 * @lang en Source-preview micro-plugin projecting current preview display settings.
 */

/**
 * @lang zh-CN 源码预览事件钩子对象，显示策略与实际源码读取分别处理。
 * @lang en Source-preview hook object; display policy is separate from actual source reads.
 */
module.exports = {
  /**
   * @lang zh-CN 配置启用及诊断标识使用的源码预览插件名。
   * @lang en Source-preview identity used by configuration and diagnostics.
   */
  name: "source-preview",
  /**
   * @lang zh-CN 在链接插件之后运行的排序权重30，较小值先执行。
   * @lang en Scheduling weight 30, after source links; lower values run first.
   */
  order: 30,

  /**
   * @lang zh-CN 将预览启用与默认展开配置写入doclet；缺doclet时不处理，此钩子不读取源码正文。
   * @lang en Writes preview enablement and initial expansion settings to the doclet; missing doclets are ignored and this hook reads no source bodies.
   * @param {object} event <lang><zh-CN>可缺doclet的JSDoc事件。</zh-CN><en>JSDoc event whose doclet may be absent.</en></lang>
   * @param {object} context <lang><zh-CN>提供预览配置和原节点元数据的受信上下文。</zh-CN><en>Trusted context supplying preview configuration and original-node metadata.</en></lang>
   * @returns {void} <lang><zh-CN>就地更新显示策略，无返回值。</zh-CN><en>Updates display policy in place and returns nothing.</en></lang>
   */
  newDoclet(event, context) {
    // <lang><zh-CN>缺节点时保留原事件，避免附加无来源的预览数据。</zh-CN><en>Leave events without nodes unchanged rather than attaching unsourced preview data.</en></lang>
    if (!event || !event.doclet) {
      return;
    }

    // <lang><zh-CN>写入原doclet的元数据引用；布尔配置沿用既有强制转换行为。</zh-CN><en>Write through the original doclet metadata reference, retaining existing boolean coercion.</en></lang>
    const metadata = context.markMicroPlugin(event.doclet, this.name);
    metadata.source.preview = {
      enabled: Boolean(context.config.source.preview.enabled),
      defaultExpanded: Boolean(context.config.source.preview.defaultExpanded)
    };
  }
};
