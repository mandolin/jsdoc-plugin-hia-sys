"use strict";

const DEFAULT_CONFIG = Object.freeze({
  mode: "standalone",
  metadataKey: "hia",
  microPlugins: [
    "code-fragment",
    "source-link",
    "source-preview",
    "doc-i18n",
    "doclet-normalizer",
    "hia-ir-exporter",
    "diagnostics"
  ],
  source: {
    basePath: "",
    link: {
      enabled: false,
      rootUrl: "",
      openMode: "currentPage"
    },
    preview: {
      enabled: false,
      defaultExpanded: false
    }
  },
  i18n: {
    enabled: true,
    defaultLocale: "zh-CN",
    fallbackLocale: "zh-CN",
    locales: ["zh-CN"],
    mode: "runtimeSwitch",
    resourceBasePath: "",
    resources: []
  },
  diagnostics: {
    throwOnError: false
  },
  integration: {
    enabled: true,
    outputFile: ""
  }
});

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function mergeConfig(...sources) {
  const result = {};

  for (const source of sources) {
    if (!isPlainObject(source)) {
      continue;
    }

    for (const [key, value] of Object.entries(source)) {
      if (isPlainObject(value) && isPlainObject(result[key])) {
        result[key] = mergeConfig(result[key], value);
      } else if (isPlainObject(value)) {
        result[key] = mergeConfig(value);
      } else if (Array.isArray(value)) {
        result[key] = value.slice();
      } else {
        result[key] = value;
      }
    }
  }

  return result;
}

function readJsdocEnvConfig() {
  try {
    const env = require("jsdoc/env");
    const conf = env && env.conf ? env.conf : {};
    const opts = conf.opts || {};

    return mergeConfig(
      conf.hia,
      conf["jsdoc-plugin-hia-sys"],
      opts.hia,
      opts["jsdoc-plugin-hia-sys"]
    );
  } catch (_error) {
    return {};
  }
}

function loadConfig(overrides) {
  return mergeConfig(DEFAULT_CONFIG, readJsdocEnvConfig(), overrides);
}

module.exports = {
  DEFAULT_CONFIG,
  loadConfig,
  mergeConfig
};
