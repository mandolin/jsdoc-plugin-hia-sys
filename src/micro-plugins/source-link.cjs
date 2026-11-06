"use strict";

/**
 * @file
 * @lang zh-CN 源码链接微插件，按当前配置附加链接策略元数据。
 * @lang en Source-link micro-plugin attaching link-policy metadata from current configuration.
 */

/**
 * @lang zh-CN 源码链接事件钩子对象，修改宿主提供的doclet元数据。
 * @lang en Source-link hook object mutating host-provided doclet metadata.
 */
module.exports = {
  /**
   * @lang zh-CN 配置启用及诊断标识使用的源码链接插件名。
   * @lang en Source-link identity used by configuration and diagnostics.
   */
  name: "source-link",
  /**
   * @lang zh-CN 在源码片段之后运行的排序权重20，较小值先执行。
   * @lang en Scheduling weight 20, after code fragments; lower values run first.
   */
  order: 20,

  /**
   * @lang zh-CN 将配置的链接启用状态、根地址和打开方式写入当前doclet；缺doclet时不处理，不访问源码或网络。
   * @lang en Writes configured link enablement, root URL and opening mode to the current doclet; missing doclets are ignored, with no source or network access.
   * @param {object} event <lang><zh-CN>可缺doclet的JSDoc事件。</zh-CN><en>JSDoc event whose doclet may be absent.</en></lang>
   * @param {object} context <lang><zh-CN>受信上下文，提供配置及可变元数据。</zh-CN><en>Trusted context supplying configuration and mutable metadata.</en></lang>
   * @returns {void} <lang><zh-CN>就地更新元数据，无返回值。</zh-CN><en>Updates metadata in place and returns nothing.</en></lang>
   */
  newDoclet(event, context) {
    // <lang><zh-CN>仅处理携带doclet的事件，避免创建脱离原节点的元数据。</zh-CN><en>Handle only events carrying a doclet to avoid detached metadata.</en></lang>
    if (!event || !event.doclet) {
      return;
    }

    // <lang><zh-CN>该引用属于原doclet，链接配置不授予源码读取许可。</zh-CN><en>This reference belongs to the original doclet; link configuration grants no source-read authority.</en></lang>
    const metadata = context.markMicroPlugin(event.doclet, this.name);
    metadata.source.link = {
      enabled: Boolean(context.config.source.link.enabled),
      rootUrl: context.config.source.link.rootUrl,
      openMode: context.config.source.link.openMode
    };
  }
};
