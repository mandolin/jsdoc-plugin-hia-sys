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
        fragments: [],
        references: []
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
