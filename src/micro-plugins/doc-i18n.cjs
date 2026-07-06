"use strict";

const {
  getResourceEntry,
  loadLocalizationResources,
  normalizeLocalizedValue,
  parseLocaleValue
} = require("../runtime/i18n.cjs");

const TEXT_I18N_MODEL = "hia-jsdoc-text-i18n";
const TEXT_I18N_MODEL_VERSION = "0.2.0";

function rememberTag(doclet, name, value) {
  doclet.hiaTags = doclet.hiaTags || {};
  doclet.hiaTags[name] = value;
}

function appendTag(doclet, name, value) {
  doclet.hiaTags = doclet.hiaTags || {};
  doclet.hiaTags[name] = doclet.hiaTags[name] || [];
  doclet.hiaTags[name].push(value);
}

function getDocletLabel(doclet) {
  return doclet.longname || doclet.name || "";
}

function getFallbackLocales(config) {
  const fallbackLocale = config.i18n.fallbackLocale;

  if (Array.isArray(fallbackLocale)) {
    return fallbackLocale.filter(Boolean);
  }

  return fallbackLocale ? [fallbackLocale] : [];
}

function normalizeLocales(config) {
  const locales = Array.isArray(config.i18n.locales)
    ? config.i18n.locales.slice()
    : [];

  if (config.i18n.defaultLocale && !locales.includes(config.i18n.defaultLocale)) {
    locales.unshift(config.i18n.defaultLocale);
  }

  return locales;
}

function pushUnique(target, value) {
  if (value && !target.includes(value)) {
    target.push(value);
  }
}

function getParentLocale(locale) {
  const match = /^([A-Za-z]{2,3})[-_]/.exec(locale || "");
  return match ? match[1] : "";
}

function buildFallbackChain(requestedLocale, config) {
  const chain = [];

  pushUnique(chain, requestedLocale);
  pushUnique(chain, getParentLocale(requestedLocale));

  for (const locale of getFallbackLocales(config)) {
    pushUnique(chain, locale);
    pushUnique(chain, getParentLocale(locale));
  }

  pushUnique(chain, config.i18n.defaultLocale);

  return chain;
}

function isKnownLocale(locale, context) {
  const knownLocales = new Set([
    ...normalizeLocales(context.config),
    ...getFallbackLocales(context.config),
    context.config.i18n.defaultLocale
  ].filter(Boolean));

  return knownLocales.has(locale) || knownLocales.has(getParentLocale(locale));
}

function addUnknownLocaleDiagnostic(locale, context, doclet, fieldPath) {
  if (!locale || isKnownLocale(locale, context)) {
    return;
  }

  context.addDiagnostic({
    code: "HIA_I18N_LOCALE_UNKNOWN",
    severity: "warning",
    message: `Unknown locale in localized documentation: ${locale}`,
    plugin: "doc-i18n",
    data: {
      locale,
      fieldPath,
      doclet: getDocletLabel(doclet)
    }
  });
}

function buildLocalizationKey(doclet, tags) {
  return tags.key || doclet.longname || doclet.name || "";
}

function buildLocalizationPath(doclet, tags) {
  return tags.path || doclet.memberof || doclet.longname || doclet.name || "";
}

function parseAttributes(rawAttributes) {
  const attributes = {};
  const pattern = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match;

  while ((match = pattern.exec(rawAttributes || ""))) {
    attributes[match[1]] = match[2] || match[3] || "";
  }

  return attributes;
}

function parseInlineLocalizedValues(innerText, context, doclet, fieldPath) {
  const localized = {};
  const pattern = /<([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*)>([\s\S]*?)<\/\1>/g;
  let match;

  while ((match = pattern.exec(innerText || ""))) {
    const locale = match[1];

    addUnknownLocaleDiagnostic(locale, context, doclet, fieldPath);

    if (Object.prototype.hasOwnProperty.call(localized, locale)) {
      context.addDiagnostic({
        code: "HIA_I18N_INLINE_LOCALE_DUPLICATE",
        severity: "error",
        message: `Duplicate inline localized text for locale: ${locale}`,
        plugin: "doc-i18n",
        data: {
          locale,
          fieldPath,
          doclet: getDocletLabel(doclet)
        }
      });
    }

    localized[locale] = match[2].trim();
  }

  return localized;
}

function parseInlineSegments(text, fieldPath, context, doclet) {
  const sourceText = String(text || "");
  const segments = [];
  const seenKeys = new Set();
  const pattern = /<lang\b([^>]*)>([\s\S]*?)<\/lang>/g;
  let match;

  while ((match = pattern.exec(sourceText))) {
    const attributes = parseAttributes(match[1]);
    const localized = parseInlineLocalizedValues(match[2], context, doclet, fieldPath);
    const key = attributes.key || "";

    if (key) {
      if (seenKeys.has(key)) {
        context.addDiagnostic({
          code: "HIA_I18N_INLINE_KEY_DUPLICATE",
          severity: "warning",
          message: `Duplicate inline localized key: ${key}`,
          plugin: "doc-i18n",
          data: {
            key,
            fieldPath,
            doclet: getDocletLabel(doclet)
          }
        });
      }

      seenKeys.add(key);
    }

    if (Object.keys(localized).length === 0) {
      context.addDiagnostic({
        code: "HIA_I18N_INLINE_LANG_MALFORMED",
        severity: "error",
        message: "Malformed <lang> inline segment has no localized child nodes.",
        plugin: "doc-i18n",
        data: {
          fieldPath,
          doclet: getDocletLabel(doclet)
        }
      });
    }

    segments.push({
      kind: "lang-inline",
      id: `${fieldPath}.${segments.length}`,
      key,
      path: attributes.path || "",
      fieldPath,
      raw: match[0],
      localized,
      rangeInField: {
        start: match.index,
        end: match.index + match[0].length
      }
    });
  }

  const rawLangCount = (sourceText.match(/<lang\b/gi) || []).length;

  if (rawLangCount > segments.length) {
    context.addDiagnostic({
      code: "HIA_I18N_INLINE_LANG_MALFORMED",
      severity: "error",
      message: "Malformed <lang> inline segment was found.",
      plugin: "doc-i18n",
      data: {
        fieldPath,
        doclet: getDocletLabel(doclet)
      }
    });
  }

  return segments;
}

function resolveLocalizedValue(variants, requestedLocale, config, defaultText) {
  const fallbackChain = buildFallbackChain(requestedLocale, config);

  for (const locale of fallbackChain) {
    if (typeof variants[locale] === "string" && variants[locale].length > 0) {
      return {
        text: variants[locale],
        resolution: {
          requestedLocale,
          resolvedLocale: locale,
          fallbackChain,
          usedFallback: locale !== requestedLocale,
          missing: false
        }
      };
    }
  }

  return {
    text: defaultText || "",
    resolution: {
      requestedLocale,
      resolvedLocale: defaultText ? config.i18n.defaultLocale : "",
      fallbackChain,
      usedFallback: Boolean(defaultText && requestedLocale !== config.i18n.defaultLocale),
      missing: !defaultText
    }
  };
}

function renderTextWithSegments(text, segments, requestedLocale, config) {
  let result = "";
  let lastIndex = 0;

  for (const segment of segments) {
    const resolved = resolveLocalizedValue(
      segment.localized,
      requestedLocale,
      config,
      segment.raw
    );

    result += String(text || "").slice(lastIndex, segment.rangeInField.start);
    result += resolved.text;
    lastIndex = segment.rangeInField.end;
  }

  result += String(text || "").slice(lastIndex);

  return result;
}

function createLangBlock(rawValue, source, context, doclet) {
  const parsed = parseLocaleValue(rawValue);
  const locale = parsed.locale;

  if (!locale) {
    context.addDiagnostic({
      code: source.startsWith("legacy")
        ? "HIA_I18N_INLINE_LOCALE_MISSING"
        : "HIA_I18N_LANG_LOCALE_MISSING",
      severity: "error",
      message: "Missing locale for localized documentation block.",
      plugin: "doc-i18n",
      data: {
        doclet: getDocletLabel(doclet)
      }
    });
  }

  if (locale) {
    addUnknownLocaleDiagnostic(locale, context, doclet, "description");
  }

  if (locale && !parsed.value) {
    context.addDiagnostic({
      code: "HIA_I18N_LANG_EMPTY",
      severity: "warning",
      message: `Empty localized documentation block for locale: ${locale}`,
      plugin: "doc-i18n",
      data: {
        locale,
        doclet: getDocletLabel(doclet)
      }
    });
  }

  return {
    kind: "lang-block",
    locale,
    fieldPath: "description",
    text: parsed.value,
    block: "",
    source,
    rangeInComment: null
  };
}

function addBlock(blocks, block, context, doclet) {
  if (!block.locale) {
    return;
  }

  const duplicate = blocks.some((item) => item.locale === block.locale);

  if (duplicate) {
    context.addDiagnostic({
      code: block.source.startsWith("legacy")
        ? "HIA_I18N_INLINE_LOCALE_DUPLICATE"
        : "HIA_I18N_LANG_LOCALE_DUPLICATE",
      severity: "error",
      message: `Duplicate localized documentation block for locale: ${block.locale}`,
      plugin: "doc-i18n",
      data: {
        locale: block.locale,
        fieldPath: block.fieldPath,
        doclet: getDocletLabel(doclet)
      }
    });
  }

  blocks.push(block);
}

function buildDescriptionBlocks(doclet, tags, context) {
  const blocks = [];

  for (const rawValue of tags.lang || []) {
    addBlock(blocks, createLangBlock(rawValue, "tag", context, doclet), context, doclet);
  }

  for (const rawValue of tags.text || []) {
    addBlock(blocks, createLangBlock(rawValue, "legacy-text", context, doclet), context, doclet);
  }

  for (const rawValue of tags.block || []) {
    const block = createLangBlock(rawValue, "legacy-block", context, doclet);
    block.block = block.text;
    addBlock(blocks, block, context, doclet);
  }

  return blocks;
}

function addResourceBlocks(blocks, key, context) {
  const existingLocales = new Set(blocks.map((block) => block.locale));

  for (const locale of normalizeLocales(context.config)) {
    if (existingLocales.has(locale)) {
      continue;
    }

    const resourceEntry = getResourceEntry(
      context.state.registries.localizationEntries,
      locale,
      key
    );

    if (!resourceEntry) {
      continue;
    }

    const normalized = normalizeLocalizedValue(resourceEntry);
    blocks.push({
      kind: "lang-block",
      locale,
      fieldPath: "description",
      text: normalized.text || normalized.block || "",
      block: normalized.block || "",
      source: "resource",
      rangeInComment: null,
      data: normalized.data
    });
    existingLocales.add(locale);
  }
}

function sanitizeFieldPathPart(value, fallback) {
  const text = String(value || fallback || "").trim();
  return text.replace(/\s+/g, "_").replace(/[.]/g, "_") || fallback;
}

function addTextField(target, fieldPath, kind, defaultText, source, blocks) {
  if (!defaultText && (!Array.isArray(blocks) || blocks.length === 0)) {
    return;
  }

  target.push({
    fieldPath,
    kind,
    defaultText: String(defaultText || ""),
    source,
    blocks: Array.isArray(blocks) ? blocks : []
  });
}

function splitExample(example) {
  const text = String(example || "");
  const match = /^<caption>([\s\S]*?)<\/caption>\s*([\s\S]*)$/i.exec(text);

  if (!match) {
    return {
      caption: "",
      body: text
    };
  }

  return {
    caption: match[1].trim(),
    body: match[2]
  };
}

function collectTextFields(doclet, descriptionBlocks) {
  const fields = [];

  addTextField(fields, "description", "description", doclet.description, "doclet.description", descriptionBlocks);
  addTextField(fields, "classdesc", "classdesc", doclet.classdesc, "doclet.classdesc", []);

  for (const [index, param] of (doclet.params || []).entries()) {
    addTextField(
      fields,
      `params.${sanitizeFieldPathPart(param.name, index)}.description`,
      "param.description",
      param.description,
      `doclet.params.${index}.description`,
      []
    );
  }

  for (const [index, item] of (doclet.returns || []).entries()) {
    addTextField(
      fields,
      `returns.${index}.description`,
      "return.description",
      item.description,
      `doclet.returns.${index}.description`,
      []
    );
  }

  for (const [index, property] of (doclet.properties || []).entries()) {
    addTextField(
      fields,
      `properties.${sanitizeFieldPathPart(property.name, index)}.description`,
      "property.description",
      property.description,
      `doclet.properties.${index}.description`,
      []
    );
  }

  for (const [index, example] of (doclet.examples || []).entries()) {
    const parsed = splitExample(example);
    addTextField(
      fields,
      `examples.${index}.caption`,
      "example.caption",
      parsed.caption,
      `doclet.examples.${index}.caption`,
      []
    );
    addTextField(
      fields,
      `examples.${index}.body`,
      "example.body",
      parsed.body,
      `doclet.examples.${index}.body`,
      []
    );
  }

  return fields;
}

function findBlockForLocale(blocks, locale) {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    if (blocks[index].locale === locale) {
      return blocks[index];
    }
  }

  return null;
}

function resolveFieldText(fieldSeed, segments, requestedLocale, context) {
  const fallbackChain = buildFallbackChain(requestedLocale, context.config);

  for (const locale of fallbackChain) {
    const block = findBlockForLocale(fieldSeed.blocks, locale);

    if (block && (block.text || block.block)) {
      return {
        text: block.text || block.block,
        resolution: {
          requestedLocale,
          resolvedLocale: locale,
          fallbackChain,
          usedFallback: locale !== requestedLocale,
          missing: false
        }
      };
    }
  }

  const rendered = renderTextWithSegments(
    fieldSeed.defaultText,
    segments,
    requestedLocale,
    context.config
  );
  const hasText = Boolean(rendered);

  return {
    text: rendered,
    resolution: {
      requestedLocale,
      resolvedLocale: hasText ? context.config.i18n.defaultLocale : "",
      fallbackChain,
      usedFallback: hasText && requestedLocale !== context.config.i18n.defaultLocale,
      missing: !hasText
    }
  };
}

function createTextField(fieldSeed, context, doclet) {
  const segments = parseInlineSegments(
    fieldSeed.defaultText,
    fieldSeed.fieldPath,
    context,
    doclet
  );
  const localizedText = {};
  const resolutions = {};
  const directLocales = new Set();
  const locales = normalizeLocales(context.config);

  if (fieldSeed.defaultText) {
    directLocales.add(context.config.i18n.defaultLocale);
  }

  for (const block of fieldSeed.blocks) {
    if (block.locale) {
      directLocales.add(block.locale);
    }
  }

  for (const locale of locales) {
    const resolved = resolveFieldText(fieldSeed, segments, locale, context);
    localizedText[locale] = resolved.text;
    resolutions[locale] = resolved.resolution;
  }

  return {
    fieldPath: fieldSeed.fieldPath,
    kind: fieldSeed.kind,
    defaultLocale: context.config.i18n.defaultLocale,
    defaultText: fieldSeed.defaultText,
    source: fieldSeed.source,
    blocks: fieldSeed.blocks,
    segments,
    localizedText,
    resolutions,
    missingLocales: locales.filter((locale) => !directLocales.has(locale))
  };
}

function buildFields(doclet, descriptionBlocks, context) {
  const fields = {};

  for (const fieldSeed of collectTextFields(doclet, descriptionBlocks)) {
    fields[fieldSeed.fieldPath] = createTextField(fieldSeed, context, doclet);
  }

  return fields;
}

function hasLocalizationIntent(tags) {
  return Boolean(
    tags.key ||
    tags.path ||
    tags.locale ||
    (Array.isArray(tags.lang) && tags.lang.length > 0) ||
    (Array.isArray(tags.text) && tags.text.length > 0) ||
    (Array.isArray(tags.block) && tags.block.length > 0)
  );
}

function diagnoseMissingDescriptionLocales(descriptionField, context, doclet, tags) {
  if (!descriptionField || !hasLocalizationIntent(tags)) {
    return;
  }

  for (const locale of descriptionField.missingLocales) {
    context.addDiagnostic({
      code: "HIA_I18N_LOCALE_MISSING",
      severity: "warning",
      message: `Missing localized content for locale: ${locale}`,
      plugin: "doc-i18n",
      data: {
        locale,
        fieldPath: "description",
        doclet: getDocletLabel(doclet)
      }
    });
  }
}

function getCompatSource(field, locale) {
  const block = findBlockForLocale(field.blocks, locale);

  if (!block) {
    return locale === field.defaultLocale ? "description" : "fallback";
  }

  if (block.source.startsWith("legacy")) {
    return "inline";
  }

  return block.source;
}

function buildCompatLocalized(descriptionField, context) {
  const localized = {};

  if (!descriptionField) {
    return localized;
  }

  for (const locale of normalizeLocales(context.config)) {
    const block = findBlockForLocale(descriptionField.blocks, locale);
    localized[locale] = {
      locale,
      text: descriptionField.localizedText[locale] || "",
      block: block && block.block ? block.block : "",
      source: getCompatSource(descriptionField, locale)
    };
  }

  return localized;
}

function buildGenerationData(localized, fields, context) {
  const locales = normalizeLocales(context.config);

  return {
    mode: context.config.i18n.mode,
    perLocale: locales.reduce((result, locale) => {
      result[locale] = localized[locale] || null;
      return result;
    }, {}),
    runtimeSwitch: {
      locales,
      fallbackLocale: context.config.i18n.fallbackLocale,
      content: localized,
      fields
    },
    hiaIntegration: {
      localized,
      fields
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

    dictionary.defineTag("lang", {
      canHaveValue: true,
      onTagged(doclet, tag) {
        appendTag(doclet, "lang", tag.value || tag.text || "");
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

    const doclet = event.doclet;
    const metadata = context.markMicroPlugin(doclet, this.name);
    const tags = doclet.hiaTags || {};
    const key = buildLocalizationKey(doclet, tags);
    const descriptionBlocks = buildDescriptionBlocks(doclet, tags, context);

    addResourceBlocks(descriptionBlocks, key, context);

    const fields = buildFields(doclet, descriptionBlocks, context);
    const descriptionField = fields.description || null;
    const localized = buildCompatLocalized(descriptionField, context);
    const missingLocales = hasLocalizationIntent(tags) && descriptionField
      ? descriptionField.missingLocales
      : [];

    diagnoseMissingDescriptionLocales(descriptionField, context, doclet, tags);

    metadata.i18n = {
      enabled: Boolean(context.config.i18n.enabled),
      model: TEXT_I18N_MODEL,
      modelVersion: TEXT_I18N_MODEL_VERSION,
      defaultLocale: context.config.i18n.defaultLocale,
      fallbackLocale: context.config.i18n.fallbackLocale,
      locales: normalizeLocales(context.config),
      mode: context.config.i18n.mode,
      key: tags.key || "",
      path: buildLocalizationPath(doclet, tags),
      locale: tags.locale || "",
      fields,
      localized,
      missingLocales,
      resources: context.state.registries.localizationResources || [],
      diagnostics: [],
      generation: buildGenerationData(localized, fields, context)
    };
  }
};
