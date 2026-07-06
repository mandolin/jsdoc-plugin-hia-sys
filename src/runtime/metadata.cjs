"use strict";

const { VERSION } = require("../version.cjs");

function ensureDocletHia(doclet, state) {
  const key = state.config.metadataKey || "hia";

  if (!doclet[key]) {
    doclet[key] = {
      version: VERSION,
      mode: state.config.mode,
      microPlugins: [],
      doclet: {},
      source: {
        model: "hia-jsdoc-source",
        modelVersion: "0.2.0",
        mode: state.config.source.mode || "all",
        definedIn: null,
        primaryBlock: null,
        fragments: [],
        references: [],
        diagnostics: []
      },
      i18n: {},
      diagnostics: []
    };
  }

  return doclet[key];
}

function markMicroPlugin(doclet, state, pluginName) {
  const metadata = ensureDocletHia(doclet, state);

  if (!metadata.microPlugins.includes(pluginName)) {
    metadata.microPlugins.push(pluginName);
  }

  return metadata;
}

function attachDiagnostics(doclet, state) {
  const metadata = ensureDocletHia(doclet, state);
  metadata.diagnostics = state.diagnostics.list();
  return metadata;
}

module.exports = {
  attachDiagnostics,
  ensureDocletHia,
  markMicroPlugin
};
