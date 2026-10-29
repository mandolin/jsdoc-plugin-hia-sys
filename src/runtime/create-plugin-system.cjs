"use strict";

const { loadConfig } = require("../config/defaults.cjs");
const { DiagnosticsCollector } = require("./diagnostics.cjs");
const {
  attachDiagnostics,
  ensureDocletHia,
  markMicroPlugin
} = require("./metadata.cjs");

function createInitialState(config) {
  return {
    config,
    diagnostics: new DiagnosticsCollector(),
    sourceFiles: new Map(),
    registries: {
      sourceFragments: new Map()
    },
    doclets: [],
    integration: {
      ir: null
    },
    output: {}
  };
}

function createPluginContext(state) {
  return {
    state,
    get config() {
      return state.config;
    },
    diagnostics: state.diagnostics,
    addDiagnostic(diagnostic) {
      return state.diagnostics.add(diagnostic);
    },
    ensureDocletHia(doclet) {
      return ensureDocletHia(doclet, state);
    },
    markMicroPlugin(doclet, pluginName) {
      return markMicroPlugin(doclet, state, pluginName);
    },
    attachDiagnostics(doclet) {
      return attachDiagnostics(doclet, state);
    }
  };
}

function sortMicroPlugins(microPlugins) {
  return microPlugins.slice().sort((left, right) => {
    return (left.order || 100) - (right.order || 100);
  });
}

function filterEnabledMicroPlugins(microPlugins, config) {
  const enabledNames = new Set(config.microPlugins || []);
  return sortMicroPlugins(
    microPlugins.filter((plugin) => enabledNames.has(plugin.name))
  );
}

/**
 * @lang zh-CN 创建独立的受信微插件系统；默认配置、JSDoc环境配置、显式覆盖依次合并，setup立即执行。
 * @lang en Creates an independent trusted micro-plugin system; merges defaults, JSDoc environment and explicit overrides in order, executing setup immediately.
 * @param {object} [options] 微插件列表和configOverrides。 / Micro-plugin list and configOverrides.
 * @returns {object} defineTags/handle/getState/getMicroPlugins接口；state为本系统可变引用。 / defineTags/handle/getState/getMicroPlugins surface; state is this system's mutable reference.
 * @throws {Error} setup原错误或throwOnError开启时的hook原错误，不自动脱敏本地重抛。 / Original setup errors or hook errors when throwOnError is enabled; local rethrows are not automatically redacted.
 */
function createPluginSystem(options) {
  // <lang><zh-CN>配置/状态/上下文仅归本系统；getState不是公开安全快照。</zh-CN><en>Configuration/state/context belong to this system; getState is not a public-safe snapshot.</en></lang>
  const config = loadConfig(options && options.configOverrides);
  const state = createInitialState(config);
  const context = createPluginContext(state);
  // <lang><zh-CN>按配置名称筛选并排序，不执行未启用插件；返回列表中的对象仍是受信输入引用。</zh-CN><en>Filter configured names and sort, without executing disabled plugins; listed objects retain trusted input references.</en></lang>
  const microPlugins = filterEnabledMicroPlugins(
    (options && options.microPlugins) || [],
    config
  );

  for (const plugin of microPlugins) {
    if (typeof plugin.setup === "function") {
      plugin.setup(context);
    }
  }

  /**
   * @lang zh-CN 顺序调用hook并记录固定错误摘要；事件/上下文可由受信插件修改。
   * @lang en Calls hooks in order and records fixed error summaries; trusted plugins may mutate event/context.
   * @param {string} hookName 本地hook名称。 / Local hook name.
   * @param {object} event 可变JSDoc事件。 / Mutable JSDoc event.
   * @returns {void} 不返回hook结果。 / Hook return values are ignored.
   * @throws {Error} 显式throwOnError时原样重抛。 / Rethrows the original value when throwOnError is explicit.
   */
  function runHook(hookName, event) {
    for (const plugin of microPlugins) {
      // <lang><zh-CN>非函数hook跳过，this绑定原微插件，保持已有回调语义。</zh-CN><en>Skip non-functions and bind this to the original micro-plugin, preserving callback semantics.</en></lang>
      const hook = plugin[hookName];

      if (typeof hook !== "function") {
        continue;
      }

      try {
        hook.call(plugin, event, context);
      } catch (error) {
        // <lang><zh-CN>异常可含源码/路径，甚至可能不是Error；摘要不读取message，原值仅供显式本地重抛。</zh-CN><en>Thrown values may contain source/paths or be non-Errors; summaries never read message, retaining originals only for explicit local rethrow.</en></lang>
        context.addDiagnostic({
          code: "HIA_PLUGIN_HOOK_FAILED",
          severity: "error",
          message: `${plugin.name}.${hookName} failed.`,
          plugin: plugin.name
        });

        if (config.diagnostics.throwOnError) {
          throw error;
        }
      }
    }
  }

  return {
    /** @param {object} dictionary 受信JSDoc词典。 / Trusted JSDoc dictionary.
     * @lang zh-CN 将词典交给已启用微插件，可修改词典，无返回值。
     * @lang en Passes the dictionary to enabled micro-plugins for mutation; returns nothing.
     */
    defineTags(dictionary) {
      runHook("defineTags", { dictionary });
    },
    /** @param {string} hookName 本地hook名。 / Local hook name.
     * @param {object} event 可变事件。 / Mutable event.
     * @lang zh-CN 委派一次本地hook，可修改事件或按策略重抛。
     * @lang en Delegates one local hook, allowing event mutation or policy-controlled rethrow.
     */
    handle(hookName, event) {
      runHook(hookName, event);
    },
    /** @returns {object} 本系统可变状态，可能含私有源码，不得直接发布。 / Mutable system state that may contain private source; never publish it directly.
     * @lang zh-CN 返回同一状态引用，不克隆。
     * @lang en Returns the same state reference without cloning.
     */
    getState() {
      return state;
    },
    /** @returns {object[]} 浅复制数组，微插件对象仍共享。 / Shallow array copy with shared micro-plugin objects.
     * @lang zh-CN 返回启用列表，不再次执行setup。
     * @lang en Returns the enabled list without rerunning setup.
     */
    getMicroPlugins() {
      return microPlugins.slice();
    }
  };
}

module.exports = {
  createPluginSystem
};
