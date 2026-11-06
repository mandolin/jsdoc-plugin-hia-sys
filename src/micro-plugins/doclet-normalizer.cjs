"use strict";

/**
 * @file
 * @lang zh-CN 文档节点归一化微插件，保留实际身份并附加展示提示。
 * @lang en Doclet normalization micro-plugin retaining actual identities and attaching presentation hints.
 */

/**
 * 构造 JPHS/JTH companion presentation profile，不引入文件路径、源码正文或 parser 私有结构。
 * Builds the JPHS/JTH companion presentation profile without adding file paths,
 * source bodies, or parser-private structures.
 *
 * @param {object} doclet JSDoc 已归一化的文档节点 / Normalized JSDoc documentation node.
 * @returns {object} 公开安全且确定性的 presentation metadata / Public-safe deterministic presentation metadata.
 */
function buildPresentationMetadata(doclet) {
  // <lang><zh-CN>缺kind时使用既有unknown占位，只影响展示元数据。</zh-CN><en>A missing kind uses the existing unknown placeholder for presentation metadata only.</en></lang>
  const kind = doclet.kind || "unknown";
  // <lang><zh-CN>稳定身份优先原longname，再取name，均缺失才使用anonymous。</zh-CN><en>Stable identity prefers the original longname, then name, using anonymous only when both are absent.</en></lang>
  const longname = doclet.longname || doclet.name || "anonymous";

  return {
    model: "hia-jsdoc-presentation",
    modelVersion: "0.1.0",
    identity: {
      stableId: `jsdoc:${kind}:${longname}`,
      kind,
      longname
    },
    navigation: {
      parentLongname: doclet.memberof || "",
      group: kind
    }
  };
}

/**
 * @lang zh-CN 在国际化处理之后规范doclet身份的事件钩子对象。
 * @lang en Event hook object normalizing doclet identities after localization.
 */
module.exports = {
  /**
   * @lang zh-CN 配置筛选与节点标记使用的归一化插件名。
   * @lang en Normalizer identity used for configuration filtering and node marking.
   */
  name: "doclet-normalizer",
  /**
   * @lang zh-CN 在国际化之后、IR导出之前运行的排序权重50。
   * @lang en Scheduling weight 50 runs after localization and before IR export.
   */
  order: 50,

  /**
   * 将 JSDoc identity/containment 投影到 companion metadata；它不推断 inheritance 或 composition。
   * Projects JSDoc identity/containment into companion metadata; it does not infer
   * inheritance or composition.
   *
   * @param {object} event JSDoc newDoclet event / JSDoc newDoclet event.
   * @param {object} context 插件执行上下文 / Plugin execution context.
   * @returns {void}
   */
  newDoclet(event, context) {
    // <lang><zh-CN>缺doclet时不创建身份，保留原事件不变。</zh-CN><en>Create no identity when the doclet is absent, leaving the event unchanged.</en></lang>
    if (!event || !event.doclet) {
      return;
    }

    // <lang><zh-CN>该引用为当前事件原节点，后续身份投影不复制私有解析结构。</zh-CN><en>This reference is the event's original node; identity projection does not copy private parser structures.</en></lang>
    const doclet = event.doclet;
    // <lang><zh-CN>标记执行插件并取得同一节点的可变HIA元数据。</zh-CN><en>Mark the executing plugin and obtain the same node's mutable HIA metadata.</en></lang>
    const metadata = context.markMicroPlugin(doclet, this.name);

    metadata.doclet = {
      name: doclet.name || "",
      longname: doclet.longname || doclet.name || "",
      kind: doclet.kind || "",
      memberof: doclet.memberof || "",
      scope: doclet.scope || ""
    };
    // JTH 仅可将此 hint 视为同页 navigation 的可选输入。
    // JTH may treat this hint only as optional same-page navigation input.
    metadata.presentation = buildPresentationMetadata(doclet);
  }
};
