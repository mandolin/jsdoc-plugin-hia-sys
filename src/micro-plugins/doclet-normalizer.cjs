"use strict";

/**
 * 构造 JPHS/JTH companion presentation profile，不引入文件路径、源码正文或 parser 私有结构。
 * Builds the JPHS/JTH companion presentation profile without adding file paths,
 * source bodies, or parser-private structures.
 *
 * @param {object} doclet JSDoc 已归一化的文档节点 / Normalized JSDoc documentation node.
 * @returns {object} 公开安全且确定性的 presentation metadata / Public-safe deterministic presentation metadata.
 */
function buildPresentationMetadata(doclet) {
  const kind = doclet.kind || "unknown";
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

module.exports = {
  name: "doclet-normalizer",
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
    if (!event || !event.doclet) {
      return;
    }

    const doclet = event.doclet;
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
