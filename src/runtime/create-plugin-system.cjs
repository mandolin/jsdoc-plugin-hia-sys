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

function createPluginSystem(options) {
  const config = loadConfig(options && options.configOverrides);
  const state = createInitialState(config);
  const context = createPluginContext(state);
  const microPlugins = filterEnabledMicroPlugins(
    (options && options.microPlugins) || [],
    config
  );

  for (const plugin of microPlugins) {
    if (typeof plugin.setup === "function") {
      plugin.setup(context);
    }
  }

  function runHook(hookName, event) {
    for (const plugin of microPlugins) {
      const hook = plugin[hookName];

      if (typeof hook !== "function") {
        continue;
      }

      try {
        hook.call(plugin, event, context);
      } catch (error) {
        context.addDiagnostic({
          code: "HIA_PLUGIN_HOOK_FAILED",
          severity: "error",
          message: `${plugin.name}.${hookName} failed: ${error.message}`,
          plugin: plugin.name
        });

        if (config.diagnostics.throwOnError) {
          throw error;
        }
      }
    }
  }

  return {
    defineTags(dictionary) {
      runHook("defineTags", { dictionary });
    },
    handle(hookName, event) {
      runHook(hookName, event);
    },
    getState() {
      return state;
    },
    getMicroPlugins() {
      return microPlugins.slice();
    }
  };
}

module.exports = {
  createPluginSystem
};
