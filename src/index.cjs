"use strict";

/**
 * @file
 * @lang zh-CN JSDoc公共入口：共享单次加载的事件系统及既有_hia嵌套兼容接口，不把原始状态当发布工件。
 * @lang en Public JSDoc entry sharing one event system per module load and the existing nested _hia compatibility surface; raw state is not a publishable artifact.
 */

const { createPluginSystem } = require("./runtime/create-plugin-system.cjs");
const outputContract = require("./runtime/output-contract.cjs");
const { builtInMicroPlugins } = require("./micro-plugins/index.cjs");

// <lang><zh-CN>模块单例保存本次JSDoc生命周期；需要隔离系统时使用_hia工厂而非重置此引用。</zh-CN><en>The module singleton retains this JSDoc lifecycle; use the _hia factory for isolated systems rather than resetting this reference.</en></lang>
const system = createPluginSystem({
  microPlugins: builtInMicroPlugins
});

/**
 * @param {object} dictionary JSDoc可变tag词典。 / Mutable JSDoc tag dictionary.
 * @lang zh-CN 向JSDoc注册已启用tag，委派错误遵循工厂策略；无返回值。
 * @lang en Registers enabled tags with JSDoc; delegated errors follow factory policy; returns nothing.
 */
exports.defineTags = function defineTags(dictionary) {
  system.defineTags(dictionary);
};

/**
 * @lang zh-CN 标准JSDoc事件回调对象，事件可变且可能产生配置启用的输出。
 * @lang en Standard JSDoc callback object with mutable events and configuration-enabled outputs.
 */
exports.handlers = {
  /** @param {object} event filename/source事件。 / filename/source event.
   * @lang zh-CN 在解析前收集上游源及片段，保留生成链关联。
   * @lang en Collects upstream source/fragments before parsing, retaining generation-chain links.
   */
  beforeParse(event) {
    system.handle("beforeParse", event);
  },
  /** @param {object} event doclet事件。 / Doclet event.
   * @lang zh-CN 补充当前doclet的源/i18n元数据，修改同一事件对象。
   * @lang en Enriches the current doclet with source/i18n metadata, mutating the same event object.
   */
  newDoclet(event) {
    system.handle("newDoclet", event);
  },
  /** @param {object} event 已解析doclets。 / Parsed doclets.
   * @lang zh-CN 汇总引用、字段与IR，不改变源码范围的既有精度规则。
   * @lang en Resolves references, fields and IR without changing existing source-range precision rules.
   */
  parseComplete(event) {
    system.handle("parseComplete", event);
  },
  /** @param {object} event 处理完成事件。 / Processing-complete event.
   * @lang zh-CN 按配置写Integration及可选源码映射；I/O与hook错误遵循既有策略。
   * @lang en Writes configured Integration and optional source maps; I/O and hook failures follow existing policy.
   */
  processingComplete(event) {
    system.handle("processingComplete", event);
  }
};

/**
 * @lang zh-CN 已导出的嵌套兼容面：工厂、内置微插件、输出helper与单例状态；名称虽带下划线仍纳入发行清单。
 * @lang en Exported nested compatibility surface: factory, built-in micro-plugins, output helpers and singleton state; the underscore does not exclude it from the release inventory.
 */
exports._hia = {
  createPluginSystem,
  builtInMicroPlugins,
  outputContract,
  /** @returns {object} 同一原始状态，可能含私有源码。 / Same raw state, potentially containing private source.
   * @lang zh-CN 只供受信本地调试，发布前必须经相应工件构造与验证。
   * @lang en For trusted local debugging; publication requires the appropriate artifact construction and validation.
   */
  getState() {
    return system.getState();
  }
};
