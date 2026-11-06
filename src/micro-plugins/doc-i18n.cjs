"use strict";

/**
 * @file
 * @lang zh-CN 字段国际化微插件，归并canonical语言标签、资源和旧兼容输入。
 * @lang en Field-localization micro-plugin merging canonical language tags, resources and legacy inputs.
 */

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

/**
 * 返回所有内联片段都能直接提供的语言；找不到时让调用方沿用默认文本的回退逻辑。
 *
 * @param {Array<object>} segments 已解析的内联语言片段。
 * @param {string} requestedLocale 当前请求语言。
 * @param {object} config HIA i18n 配置。
 * @returns {string} 直接覆盖全部片段的语言，或空字符串。
 */
function resolveInlineLocale(segments, requestedLocale, config) {
  if (!segments.length) {
    return "";
  }

  for (const candidate of buildFallbackChain(requestedLocale, config)) {
    if (segments.every((segment) => Object.prototype.hasOwnProperty.call(segment.localized, candidate))) {
      return candidate;
    }
  }

  return "";
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
  const resolvedInlineLocale = hasText
    ? resolveInlineLocale(segments, requestedLocale, context.config)
    : "";
  const resolvedLocale = resolvedInlineLocale || (hasText ? context.config.i18n.defaultLocale : "");

  return {
    text: rendered,
    resolution: {
      requestedLocale,
      resolvedLocale,
      fallbackChain,
      usedFallback: hasText && resolvedLocale !== requestedLocale,
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

  for (const segment of segments) {
    for (const locale of Object.keys(segment.localized || {})) {
      directLocales.add(locale);
      directLocales.add(getParentLocale(locale));
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

/**
 * @lang zh-CN 国际化资源初始化、标签注册与字段投影钩子，输出遵循当前语言配置。
 * @lang en Localization-resource setup, tag registration and field projection hooks governed by current locale configuration.
 */
module.exports = {
  /**
   * @lang zh-CN 配置筛选与节点标记使用的国际化插件名。
   * @lang en Localization identity used for configuration filtering and node marking.
   */
  name: "doc-i18n",
  /**
   * @lang zh-CN 在源码预览之后、节点归一化之前运行的排序权重40。
   * @lang en Scheduling weight 40 runs after source preview and before doclet normalization.
   */
  order: 40,

  /**
   * @lang zh-CN 按当前配置读取国际化资源并保存资源及词条；读取诊断进入上下文收集器，不向其它运行共享注册表。
   * @lang en Loads localization resources from current configuration and retains resources and entries; read diagnostics go to the context collector and registries are not shared across runs.
   * @param {object} context <lang><zh-CN>含本轮资源配置、诊断和注册表的受信上下文。</zh-CN><en>Trusted context holding this run's resource configuration, diagnostics and registries.</en></lang>
   * @returns {void} <lang><zh-CN>更新上下文注册表，无返回值。</zh-CN><en>Updates context registries and returns nothing.</en></lang>
   */
  setup(context) {
    // <lang><zh-CN>加载结果只属于当前配置，资源正文不自动获得公开许可。</zh-CN><en>The load result belongs to current configuration; resource text gains no automatic publication authority.</en></lang>
    const loaded = loadLocalizationResources(context.config, context.diagnostics);
    context.state.registries.localizationResources = loaded.resources;
    context.state.registries.localizationEntries = loaded.entries;
  },

  /**
   * @lang zh-CN 注册canonical lang及既有身份/资源和兼容语言标签；缺有效词典时忽略，回调只记录原标签值。
   * @lang en Registers canonical lang plus existing identity/resource and compatibility tags; invalid dictionaries are ignored and callbacks only record original tag values.
   * @param {object} event <lang><zh-CN>含可变JSDoc标签词典的事件。</zh-CN><en>Event containing the mutable JSDoc tag dictionary.</en></lang>
   * @returns {void} <lang><zh-CN>注册标签定义，无返回值。</zh-CN><en>Registers tag definitions and returns nothing.</en></lang>
   */
  defineTags(event) {
    // <lang><zh-CN>复用本次事件的词典，避免在无注册能力时产生旁路状态。</zh-CN><en>Reuse this event's dictionary, avoiding side state when registration is unavailable.</en></lang>
    const dictionary = event && event.dictionary;

    if (!dictionary || typeof dictionary.defineTag !== "function") {
      return;
    }

    dictionary.defineTag("hiaLocale", {
      canHaveValue: true,
      /**
       * @lang zh-CN 将当前标签原值记录到locale元数据，空标签保留既有空字符串回退。
       * @lang en Records the original tag value in locale metadata, retaining the existing empty-string fallback.
       * @param {object} doclet <lang><zh-CN>词典回调提供的原节点。</zh-CN><en>Original node supplied by the dictionary callback.</en></lang>
       * @param {object} tag <lang><zh-CN>提供value或text的原标签。</zh-CN><en>Original tag supplying value or text.</en></lang>
       * @returns {void} <lang><zh-CN>就地附加标签元数据。</zh-CN><en>Appends tag metadata in place.</en></lang>
       */
      onTagged(doclet, tag) {
        // <lang><zh-CN>仅保存输入值，语言解析及回退在后续字段构建阶段执行。</zh-CN><en>Retain input values only; locale parsing and fallback happen during subsequent field construction.</en></lang>
        rememberTag(doclet, "locale", tag.value || tag.text || "");
      }
    });

    dictionary.defineTag("hiaKey", {
      canHaveValue: true,
      /**
       * @lang zh-CN 将当前标签原值记录到key元数据，空标签保留既有空字符串回退。
       * @lang en Records the original tag value in key metadata, retaining the existing empty-string fallback.
       * @param {object} doclet <lang><zh-CN>词典回调提供的原节点。</zh-CN><en>Original node supplied by the dictionary callback.</en></lang>
       * @param {object} tag <lang><zh-CN>提供value或text的原标签。</zh-CN><en>Original tag supplying value or text.</en></lang>
       * @returns {void} <lang><zh-CN>就地附加标签元数据。</zh-CN><en>Appends tag metadata in place.</en></lang>
       */
      onTagged(doclet, tag) {
        // <lang><zh-CN>仅保存输入值，语言解析及回退在后续字段构建阶段执行。</zh-CN><en>Retain input values only; locale parsing and fallback happen during subsequent field construction.</en></lang>
        rememberTag(doclet, "key", tag.value || tag.text || "");
      }
    });

    dictionary.defineTag("hiaPath", {
      canHaveValue: true,
      /**
       * @lang zh-CN 将当前标签原值记录到path元数据，空标签保留既有空字符串回退。
       * @lang en Records the original tag value in path metadata, retaining the existing empty-string fallback.
       * @param {object} doclet <lang><zh-CN>词典回调提供的原节点。</zh-CN><en>Original node supplied by the dictionary callback.</en></lang>
       * @param {object} tag <lang><zh-CN>提供value或text的原标签。</zh-CN><en>Original tag supplying value or text.</en></lang>
       * @returns {void} <lang><zh-CN>就地附加标签元数据。</zh-CN><en>Appends tag metadata in place.</en></lang>
       */
      onTagged(doclet, tag) {
        // <lang><zh-CN>仅保存输入值，语言解析及回退在后续字段构建阶段执行。</zh-CN><en>Retain input values only; locale parsing and fallback happen during subsequent field construction.</en></lang>
        rememberTag(doclet, "path", tag.value || tag.text || "");
      }
    });

    dictionary.defineTag("lang", {
      canHaveValue: true,
      /**
       * @lang zh-CN 将当前标签原值记录到lang元数据，空标签保留既有空字符串回退。
       * @lang en Records the original tag value in lang metadata, retaining the existing empty-string fallback.
       * @param {object} doclet <lang><zh-CN>词典回调提供的原节点。</zh-CN><en>Original node supplied by the dictionary callback.</en></lang>
       * @param {object} tag <lang><zh-CN>提供value或text的原标签。</zh-CN><en>Original tag supplying value or text.</en></lang>
       * @returns {void} <lang><zh-CN>就地附加标签元数据。</zh-CN><en>Appends tag metadata in place.</en></lang>
       */
      onTagged(doclet, tag) {
        // <lang><zh-CN>仅保存输入值，语言解析及回退在后续字段构建阶段执行。</zh-CN><en>Retain input values only; locale parsing and fallback happen during subsequent field construction.</en></lang>
        appendTag(doclet, "lang", tag.value || tag.text || "");
      }
    });

    // 旧标签暂未弃用，仅用于兼容读取；新增文档必须使用 @lang / <lang>。
    // Legacy tags are not deprecated yet and remain read-compatible; new docs must use @lang / <lang>.
    dictionary.defineTag("hiaText", {
      canHaveValue: true,
      /**
       * @lang zh-CN 将当前标签原值记录到text元数据，空标签保留既有空字符串回退。
       * @lang en Records the original tag value in text metadata, retaining the existing empty-string fallback.
       * @param {object} doclet <lang><zh-CN>词典回调提供的原节点。</zh-CN><en>Original node supplied by the dictionary callback.</en></lang>
       * @param {object} tag <lang><zh-CN>提供value或text的原标签。</zh-CN><en>Original tag supplying value or text.</en></lang>
       * @returns {void} <lang><zh-CN>就地附加标签元数据。</zh-CN><en>Appends tag metadata in place.</en></lang>
       */
      onTagged(doclet, tag) {
        // <lang><zh-CN>仅保存输入值，语言解析及回退在后续字段构建阶段执行。</zh-CN><en>Retain input values only; locale parsing and fallback happen during subsequent field construction.</en></lang>
        appendTag(doclet, "text", tag.value || tag.text || "");
      }
    });

    dictionary.defineTag("hiaBlock", {
      canHaveValue: true,
      /**
       * @lang zh-CN 将当前标签原值记录到block元数据，空标签保留既有空字符串回退。
       * @lang en Records the original tag value in block metadata, retaining the existing empty-string fallback.
       * @param {object} doclet <lang><zh-CN>词典回调提供的原节点。</zh-CN><en>Original node supplied by the dictionary callback.</en></lang>
       * @param {object} tag <lang><zh-CN>提供value或text的原标签。</zh-CN><en>Original tag supplying value or text.</en></lang>
       * @returns {void} <lang><zh-CN>就地附加标签元数据。</zh-CN><en>Appends tag metadata in place.</en></lang>
       */
      onTagged(doclet, tag) {
        // <lang><zh-CN>仅保存输入值，语言解析及回退在后续字段构建阶段执行。</zh-CN><en>Retain input values only; locale parsing and fallback happen during subsequent field construction.</en></lang>
        appendTag(doclet, "block", tag.value || tag.text || "");
      }
    });
  },

  /**
   * @lang zh-CN 将原doclet文本、语言标签与配置资源归并为字段级国际化元数据，按现有回退策略记录缺译；缺doclet时忽略。
   * @lang en Merges original doclet text, language tags and configured resources into field-level localization metadata, recording missing locales under existing fallback rules; missing doclets are ignored.
   * @param {object} event <lang><zh-CN>携带原doclet及其标签的新节点事件。</zh-CN><en>New-node event carrying the original doclet and its tags.</en></lang>
   * @param {object} context <lang><zh-CN>含语言配置、资源和诊断的受信上下文。</zh-CN><en>Trusted context holding locale configuration, resources and diagnostics.</en></lang>
   * @returns {void} <lang><zh-CN>就地更新国际化字段及诊断，无返回值。</zh-CN><en>Updates localization fields and diagnostics in place and returns nothing.</en></lang>
   */
  newDoclet(event, context) {
    if (!event || !event.doclet) {
      return;
    }

    // <lang><zh-CN>原事件节点保留JSDoc身份，不复制解析器私有状态。</zh-CN><en>The original event node retains JSDoc identity without copying private parser state.</en></lang>
    const doclet = event.doclet;
    // <lang><zh-CN>同一节点元数据承接字段结果，插件标记供后续审计。</zh-CN><en>The same node metadata receives field results; the plugin mark supports later auditing.</en></lang>
    const metadata = context.markMicroPlugin(doclet, this.name);
    // <lang><zh-CN>原标签缺失时使用本地空对象，仅作为当前投影输入。</zh-CN><en>Missing original tags use a local empty object as projection input only.</en></lang>
    const tags = doclet.hiaTags || {};
    // <lang><zh-CN>查询键由原节点和标签构造，供授权资源查找使用。</zh-CN><en>The lookup key comes from the original node and tags for authorized-resource lookup.</en></lang>
    const key = buildLocalizationKey(doclet, tags);
    // <lang><zh-CN>描述块保留原正文和显式语言信息，随后合并配置资源。</zh-CN><en>Description blocks retain original prose and explicit locale data before configured resources are merged.</en></lang>
    const descriptionBlocks = buildDescriptionBlocks(doclet, tags, context);

    addResourceBlocks(descriptionBlocks, key, context);

    // <lang><zh-CN>字段集合包含参数和返回等已有语义，不将全部正文压成单一摘要。</zh-CN><en>The field collection includes existing parameter and return semantics without collapsing prose into one summary.</en></lang>
    const fields = buildFields(doclet, descriptionBlocks, context);
    // <lang><zh-CN>描述字段可缺失，兼容投影与缺译诊断据此分别处理。</zh-CN><en>The description field may be absent; compatibility projection and missing-locale diagnostics handle that independently.</en></lang>
    const descriptionField = fields.description || null;
    // <lang><zh-CN>兼容视图来自同一描述字段，保留旧消费者读取能力。</zh-CN><en>The compatibility view derives from the same description field for existing readers.</en></lang>
    const localized = buildCompatLocalized(descriptionField, context);
    // <lang><zh-CN>仅显式国际化意图且有描述字段时记录其缺失语言。</zh-CN><en>Record missing locales only for explicit localization intent with a description field.</en></lang>
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
