"use strict";

const fs = require("node:fs");
const path = require("node:path");

function parseLocaleValue(value) {
  const text = String(value || "").trim();
  const match = /^(\S+)\s+([\s\S]+)$/.exec(text);

  if (!match) {
    return {
      locale: "",
      value: text
    };
  }

  return {
    locale: match[1],
    value: match[2].trim()
  };
}

function ensureLocaleBucket(target, locale) {
  if (!target[locale]) {
    target[locale] = {};
  }

  return target[locale];
}

function resolveResourcePath(resourcePath, config) {
  if (path.isAbsolute(resourcePath)) {
    return resourcePath;
  }

  const basePath =
    config.i18n.resourceBasePath || config.source.basePath || process.cwd();

  return path.resolve(basePath, resourcePath);
}

function normalizeResourceData(data, absolutePath) {
  if (data && typeof data.locale === "string" && data.entries) {
    return {
      filePath: absolutePath,
      entries: {
        [data.locale]: data.entries
      }
    };
  }

  return {
    filePath: absolutePath,
    entries: data && typeof data === "object" ? data : {}
  };
}

function loadLocalizationResources(config, diagnostics) {
  const resources = [];
  const entries = {};

  for (const resourcePath of config.i18n.resources || []) {
    const absolutePath = resolveResourcePath(resourcePath, config);

    if (!fs.existsSync(absolutePath)) {
      diagnostics.add({
        code: "HIA_I18N_RESOURCE_MISSING",
        severity: "error",
        message: `Localization resource does not exist: ${resourcePath}`,
        plugin: "doc-i18n",
        filePath: absolutePath,
        data: {
          resourcePath
        }
      });
      continue;
    }

    try {
      const resource = normalizeResourceData(
        JSON.parse(fs.readFileSync(absolutePath, "utf8")),
        absolutePath
      );

      resources.push({
        filePath: absolutePath,
        localeCount: Object.keys(resource.entries).length
      });

      for (const [locale, localeEntries] of Object.entries(resource.entries)) {
        const bucket = ensureLocaleBucket(entries, locale);

        for (const [key, value] of Object.entries(localeEntries || {})) {
          if (Object.prototype.hasOwnProperty.call(bucket, key)) {
            diagnostics.add({
              code: "HIA_I18N_RESOURCE_KEY_DUPLICATE",
              severity: "error",
              message: `Duplicate localization resource key: ${locale}:${key}`,
              plugin: "doc-i18n",
              filePath: absolutePath,
              data: {
                locale,
                key
              }
            });
          }

          bucket[key] = value;
        }
      }
    } catch (error) {
      diagnostics.add({
        code: "HIA_I18N_RESOURCE_INVALID",
        severity: "error",
        message: `Cannot read localization resource ${resourcePath}: ${error.message}`,
        plugin: "doc-i18n",
        filePath: absolutePath,
        data: {
          resourcePath
        }
      });
    }
  }

  return {
    resources,
    entries
  };
}

function getResourceEntry(entries, locale, key) {
  const bucket = entries[locale];

  if (!bucket) {
    return null;
  }

  return bucket[key] || null;
}

function normalizeLocalizedValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      text: value.text || value.description || "",
      block: value.block || value.markdown || "",
      source: "resource",
      data: value
    };
  }

  return {
    text: String(value || ""),
    block: "",
    source: "resource",
    data: value
  };
}

module.exports = {
  getResourceEntry,
  loadLocalizationResources,
  normalizeLocalizedValue,
  parseLocaleValue
};
