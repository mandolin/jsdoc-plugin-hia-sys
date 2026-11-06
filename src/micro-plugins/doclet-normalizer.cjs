"use strict";

/**
 * @file
 * @lang zh-CN 文档节点归一化微插件，保留实际身份并附加展示提示。
 * @lang en Doclet normalization micro-plugin retaining actual identities and attaching presentation hints.
 */

/**
 * @lang zh-CN 构造JPHS/JTH伴随展示元数据，不引入文件路径、源码正文或解析器私有结构。
 * @lang en Builds JPHS/JTH companion presentation metadata without file paths, source bodies or parser-private structures.
 *
 * @param {object} doclet <lang><zh-CN>JSDoc已归一化的文档节点。</zh-CN><en>Normalized JSDoc documentation node.</en></lang>
 * @returns {object} <lang><zh-CN>公开安全且确定性的展示元数据。</zh-CN><en>Public-safe deterministic presentation metadata.</en></lang>
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
   * @lang zh-CN 将JSDoc身份和包含关系投影到伴随元数据，不推断继承或组合关系。
   * @lang en Projects JSDoc identity and containment into companion metadata without inferring inheritance or composition.
   *
   * @param {object} event <lang><zh-CN>可缺doclet的JSDoc新节点事件。</zh-CN><en>JSDoc new-node event whose doclet may be absent.</en></lang>
   * @param {object} context <lang><zh-CN>持有当前节点元数据的受信执行上下文。</zh-CN><en>Trusted execution context holding current-node metadata.</en></lang>
   * @returns {void} <lang><zh-CN>就地更新身份与展示提示，无返回值。</zh-CN><en>Updates identity and presentation hints in place and returns nothing.</en></lang>
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
