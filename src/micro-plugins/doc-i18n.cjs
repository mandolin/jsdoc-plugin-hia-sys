"use strict";

const {
  getResourceEntry,
  loadLocalizationResources,
  normalizeLocalizedValue,
  parseLocaleValue
} = require("../runtime/i18n.cjs");

function rememberTag(doclet, name, value) {
  doclet.hiaTags = doclet.hiaTags || {};
  doclet.hiaTags[name] = value;
}

function appendTag(doclet, name, value) {
  doclet.hiaTags = doclet.hiaTags || {};
  doclet.hiaTags[name] = doclet.hiaTags[name] || [];
  doclet.hiaTags[name].push(value);
}

function addInlineLocalizedValue(target, locale, kind, value, context, doclet) {
  if (!locale) {
    context.addDiagnostic({
      code: "HIA_I18N_INLINE_LOCALE_MISSING",
      severity: "error",
      message: "Missing locale for inline localized content.",
      plugin: "doc-i18n",
      data: {
        doclet: doclet.longname || doclet.name || ""
      }
    });
    return;
  }

  target[locale] = target[locale] || {
    locale,
    text: "",
    block: "",
    source: "inline"
  };

  if (target[locale][kind] && target[locale].source !== "description") {
    context.addDiagnostic({
      code: "HIA_I18N_INLINE_LOCALE_DUPLICATE",
      severity: "error",
      message: `Duplicate inline ${kind} for locale: ${locale}`,
      plugin: "doc-i18n",
      data: {
        locale,
        doclet: doclet.longname || doclet.name || ""
      }
    });
  }

  target[locale][kind] = value;
  target[locale].source = "inline";
}

function buildLocalizationKey(doclet, tags) {
  return tags.key || doclet.longname || doclet.name || "";
}

function buildLocalizationPath(doclet, tags) {
  return tags.path || doclet.memberof || doclet.longname || doclet.name || "";
}

function buildLocalizedContent(doclet, tags, context) {
  const localized = {};
  const key = buildLocalizationKey(doclet, tags);
  const defaultLocale = context.config.i18n.defaultLocale;

  if (doclet.description) {
    localized[defaultLocale] = {
      locale: defaultLocale,
      text: doclet.description,
      block: "",
      source: "description"
    };
  }

  for (const rawValue of tags.text || []) {
    const parsed = parseLocaleValue(rawValue);
    addInlineLocalizedValue(localized, parsed.locale, "text", parsed.value, context, doclet);
  }

  for (const rawValue of tags.block || []) {
    const parsed = parseLocaleValue(rawValue);
    addInlineLocalizedValue(localized, parsed.locale, "block", parsed.value, context, doclet);
  }

  for (const locale of context.config.i18n.locales || []) {
    const resourceEntry = getResourceEntry(
      context.state.registries.localizationEntries,
      locale,
      key
    );

    if (resourceEntry && !localized[locale]) {
      localized[locale] = {
        locale,
        ...normalizeLocalizedValue(resourceEntry)
      };
    }
  }

  return localized;
}

function hasLocalizationIntent(tags) {
  return Boolean(
    tags.key ||
    tags.path ||
    tags.locale ||
    (Array.isArray(tags.text) && tags.text.length > 0) ||
    (Array.isArray(tags.block) && tags.block.length > 0)
  );
}

function collectMissingLocales(localized, context, doclet, tags) {
  const missingLocales = [];
  const shouldDiagnose = hasLocalizationIntent(tags);

  for (const locale of context.config.i18n.locales || []) {
    if (localized[locale]) {
      continue;
    }

    missingLocales.push(locale);

    if (!shouldDiagnose) {
      continue;
    }

    context.addDiagnostic({
      code: "HIA_I18N_LOCALE_MISSING",
      severity: "warning",
      message: `Missing localized content for locale: ${locale}`,
      plugin: "doc-i18n",
      data: {
        locale,
        doclet: doclet.longname || doclet.name || ""
      }
    });
  }

  return missingLocales;
}

function buildGenerationData(localized, context) {
  const locales = context.config.i18n.locales || [];

  return {
    mode: context.config.i18n.mode,
    perLocale: locales.reduce((result, locale) => {
      result[locale] = localized[locale] || null;
      return result;
    }, {}),
    runtimeSwitch: {
      locales,
      fallbackLocale: context.config.i18n.fallbackLocale,
      content: localized
    },
    hiaIntegration: {
      localized
    }
  };
}

module.exports = {
  name: "doc-i18n",
  order: 40,

  setup(context) {
    const loaded = loadLocalizationResources(context.config, context.diagnostics);
    context.state.registries.localizationResources = loaded.resources;
    context.state.registries.localizationEntries = loaded.entries;
  },

  defineTags(event) {
    const dictionary = event && event.dictionary;

    if (!dictionary || typeof dictionary.defineTag !== "function") {
      return;
    }

    dictionary.defineTag("hiaLocale", {
      canHaveValue: true,
      onTagged(doclet, tag) {
        rememberTag(doclet, "locale", tag.value || tag.text || "");
      }
    });

    dictionary.defineTag("hiaKey", {
      canHaveValue: true,
      onTagged(doclet, tag) {
        rememberTag(doclet, "key", tag.value || tag.text || "");
      }
    });

    dictionary.defineTag("hiaPath", {
      canHaveValue: true,
      onTagged(doclet, tag) {
        rememberTag(doclet, "path", tag.value || tag.text || "");
      }
    });

    dictionary.defineTag("hiaText", {
      canHaveValue: true,
      onTagged(doclet, tag) {
        appendTag(doclet, "text", tag.value || tag.text || "");
      }
    });

    dictionary.defineTag("hiaBlock", {
      canHaveValue: true,
      onTagged(doclet, tag) {
        appendTag(doclet, "block", tag.value || tag.text || "");
      }
    });
  },

  newDoclet(event, context) {
    if (!event || !event.doclet) {
      return;
    }

    const metadata = context.markMicroPlugin(event.doclet, this.name);
    const tags = event.doclet.hiaTags || {};
    const localized = buildLocalizedContent(event.doclet, tags, context);
    const missingLocales = collectMissingLocales(localized, context, event.doclet, tags);

    metadata.i18n = {
      enabled: Boolean(context.config.i18n.enabled),
      defaultLocale: context.config.i18n.defaultLocale,
      fallbackLocale: context.config.i18n.fallbackLocale,
      locales: context.config.i18n.locales.slice(),
      mode: context.config.i18n.mode,
      key: tags.key || "",
      path: buildLocalizationPath(event.doclet, tags),
      locale: tags.locale || "",
      localized,
      missingLocales,
      resources: context.state.registries.localizationResources || [],
      generation: buildGenerationData(localized, context)
    };
  }
};
