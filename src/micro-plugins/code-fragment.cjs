"use strict";

/**
 * @file
 * @lang zh-CN 源码片段微插件，按解析生命周期保存源、片段和显式引用。
 * @lang en Code-fragment micro-plugin retaining sources, fragments and explicit references through the parsing lifecycle.
 */

const {
  buildDefinedIn,
  buildPrimaryBlock,
  buildSourceLink,
  buildSourcePreview,
  getLineColumn,
  getRelativePath,
  inferLanguage,
  trimOneOuterNewline
} = require("../runtime/source.cjs");

const MARKER_PATTERN = /\/\*+\s*@(codeblock|codeblockend)\b([^*]*?)\*\//g;
const CODEREF_PATTERN = /(?:\/\/\s*)?@coderef\s+([^\r\n]+)/g;

function cleanId(value) {
  return String(value || "").trim();
}

function appendTag(doclet, name, value) {
  doclet.hiaTags = doclet.hiaTags || {};
  doclet.hiaTags[name] = doclet.hiaTags[name] || [];
  doclet.hiaTags[name].push(value);
}

function createFragment(openMarker, closeMarker, source, filePath, context) {
  const rawContent = source.slice(openMarker.endIndex, closeMarker.startIndex);
  const content = trimOneOuterNewline(rawContent);
  const relativePath = getRelativePath(filePath, context.config);
  const startLine = openMarker.location.line + 1;
  const endLine = Math.max(startLine, closeMarker.location.line - 1);
  const fragment = {
    kind: "source-fragment",
    id: openMarker.id,
    filePath,
    relativePath,
    language: inferLanguage(filePath),
    range: {
      start: {
        line: startLine,
        column: 1
      },
      end: {
        line: endLine,
        column: 1
      }
    },
    content,
    origin: {
      marker: "codeblock",
      startMarkerRange: {
        start: openMarker.location,
        end: getLineColumn(source, openMarker.endIndex)
      },
      endMarkerRange: {
        start: closeMarker.location,
        end: getLineColumn(source, closeMarker.endIndex)
      }
    }
  };

  fragment.link = buildSourceLink(fragment, context.config);
  fragment.preview = buildSourcePreview(fragment, context.config);

  return fragment;
}

function addFragment(context, fragment) {
  const registry = context.state.registries.sourceFragments;

  if (registry.has(fragment.id)) {
    context.addDiagnostic({
      code: "HIA_SOURCE_FRAGMENT_DUPLICATE",
      severity: "error",
      message: `Duplicate source fragment id: ${fragment.id}`,
      plugin: "code-fragment",
      filePath: fragment.filePath,
      range: fragment.range,
      data: {
        id: fragment.id
      }
    });
    return;
  }

  registry.set(fragment.id, fragment);
}

function scanSourceFragments(event, context) {
  const source = event.source || "";
  const filePath = event.filename;
  const openMarkers = new Map();
  let match;

  while ((match = MARKER_PATTERN.exec(source))) {
    const kind = match[1];
    const id = cleanId(match[2]);
    const marker = {
      id,
      kind,
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      location: getLineColumn(source, match.index)
    };

    if (!id) {
      context.addDiagnostic({
        code: "HIA_SOURCE_FRAGMENT_ID_MISSING",
        severity: "error",
        message: `Missing source fragment id for @${kind}.`,
        plugin: "code-fragment",
        filePath,
        range: {
          start: marker.location,
          end: marker.location
        }
      });
      continue;
    }

    if (kind === "codeblock") {
      if (openMarkers.has(id)) {
        context.addDiagnostic({
          code: "HIA_SOURCE_FRAGMENT_START_DUPLICATE",
          severity: "error",
          message: `Duplicate open @codeblock id: ${id}`,
          plugin: "code-fragment",
          filePath,
          data: {
            id
          }
        });
        continue;
      }

      openMarkers.set(id, marker);
      continue;
    }

    const openMarker = openMarkers.get(id);

    if (!openMarker) {
      context.addDiagnostic({
        code: "HIA_SOURCE_FRAGMENT_END_WITHOUT_START",
        severity: "error",
        message: `@codeblockend has no matching @codeblock: ${id}`,
        plugin: "code-fragment",
        filePath,
        data: {
          id
        }
      });
      continue;
    }

    addFragment(context, createFragment(openMarker, marker, source, filePath, context));
    openMarkers.delete(id);
  }

  for (const openMarker of openMarkers.values()) {
    context.addDiagnostic({
      code: "HIA_SOURCE_FRAGMENT_END_MISSING",
      severity: "error",
      message: `Missing @codeblockend for source fragment: ${openMarker.id}`,
      plugin: "code-fragment",
      filePath,
      data: {
        id: openMarker.id
      }
    });
  }
}

function summarizeFragment(fragment) {
  return {
    kind: fragment.kind || "source-fragment",
    id: fragment.id,
    filePath: fragment.filePath,
    relativePath: fragment.relativePath,
    language: fragment.language,
    range: fragment.range,
    content: fragment.content,
    link: fragment.link,
    preview: fragment.preview
  };
}

function createReference(targetId, doclet, fieldPath, context) {
  const fragment = context.state.registries.sourceFragments.get(targetId);
  const reference = {
    kind: "source-reference",
    referenceKind: "coderef",
    targetId,
    sourceNodeId: doclet.longname || doclet.name || "",
    fieldPath,
    resolved: Boolean(fragment),
    fragment: fragment ? summarizeFragment(fragment) : null,
    diagnostics: []
  };

  if (!fragment) {
    const diagnostic = context.addDiagnostic({
      code: "HIA_SOURCE_REFERENCE_MISSING",
      severity: "error",
      message: `Cannot resolve @coderef target: ${targetId}`,
      plugin: "code-fragment",
      data: {
        targetId,
        sourceNodeId: reference.sourceNodeId,
        fieldPath
      }
    });
    reference.diagnostics.push(diagnostic);
  }

  return reference;
}

function formatReplacement(fragment, fieldKind) {
  if (!fragment) {
    return "";
  }

  if (fieldKind === "example") {
    return fragment.content;
  }

  return `\n\n\`\`\`${fragment.language}\n${fragment.content}\n\`\`\`\n`;
}

function transformText(text, doclet, fieldPath, fieldKind, context, references) {
  if (typeof text !== "string" || !text.includes("@coderef")) {
    return text;
  }

  return text.replace(CODEREF_PATTERN, (_match, rawId) => {
    const targetId = cleanId(rawId);
    const reference = createReference(targetId, doclet, fieldPath, context);
    references.push(reference);

    if (!reference.fragment) {
      return `@coderef ${targetId}`;
    }

    const fragment = context.state.registries.sourceFragments.get(targetId);
    return formatReplacement(fragment, fieldKind);
  });
}

function resolveDocletReferences(doclet, context) {
  const metadata = context.markMicroPlugin(doclet, "code-fragment");
  const references = [];
  const tagRefs = doclet.hiaTags && Array.isArray(doclet.hiaTags.coderef)
    ? doclet.hiaTags.coderef
    : [];

  doclet.description = transformText(
    doclet.description,
    doclet,
    "description",
    "description",
    context,
    references
  );

  if (Array.isArray(doclet.examples)) {
    doclet.examples = doclet.examples.map((example, index) => {
      return transformText(
        example,
        doclet,
        `examples.${index}`,
        "example",
        context,
        references
      );
    });
  }

  if (Array.isArray(doclet.properties)) {
    for (const [index, property] of doclet.properties.entries()) {
      property.description = transformText(
        property.description,
        doclet,
        `properties.${index}.description`,
        "description",
        context,
        references
      );
    }
  }

  for (const targetId of tagRefs) {
    references.push(createReference(cleanId(targetId), doclet, "tags.coderef", context));
  }

  metadata.source.references = references;
  metadata.source.fragments = references
    .filter((reference) => reference.fragment)
    .map((reference) => reference.fragment);
}

/**
 * @lang zh-CN 源码捕获与片段关联钩子对象，所有源码状态仅保存在当前宿主上下文。
 * @lang en Source-capture and fragment-association hooks, with all source state retained in the current host context.
 */
module.exports = {
  /**
   * @lang zh-CN 配置筛选与节点标记使用的源码片段插件名。
   * @lang en Code-fragment identity used for configuration filtering and node marking.
   */
  name: "code-fragment",
  /**
   * @lang zh-CN 先于链接和预览插件捕获来源的排序权重10。
   * @lang en Scheduling weight 10 captures provenance before source-link and preview hooks.
   */
  order: 10,

  /**
   * @lang zh-CN 为当前插件系统初始化独立片段注册表，替换该上下文的旧注册表；不写文件。
   * @lang en Initializes an independent fragment registry for the current plugin system, replacing that context's prior registry without writing files.
   * @param {object} context <lang><zh-CN>持有当前运行注册表的受信上下文。</zh-CN><en>Trusted context holding this run's registries.</en></lang>
   * @returns {void} <lang><zh-CN>就地初始化上下文，无返回值。</zh-CN><en>Initializes the context in place and returns nothing.</en></lang>
   */
  setup(context) {
    context.state.registries.sourceFragments = new Map();
  },

  /**
   * @lang zh-CN 注册codeblock、codeblockend和coderef标签；没有可用词典时忽略，引用标签回调仅附加原doclet标签。
   * @lang en Registers codeblock, codeblockend and coderef tags; unavailable dictionaries are ignored and reference callbacks only append original doclet tags.
   * @param {object} event <lang><zh-CN>含JSDoc可变标签词典的事件。</zh-CN><en>Event containing the mutable JSDoc tag dictionary.</en></lang>
   * @returns {void} <lang><zh-CN>注册词典定义，无返回值。</zh-CN><en>Registers dictionary definitions and returns nothing.</en></lang>
   */
  defineTags(event) {
    // <lang><zh-CN>词典来自本次事件，缺失时不创建替代词典。</zh-CN><en>The dictionary comes from this event; no substitute is created when absent.</en></lang>
    const dictionary = event && event.dictionary;

    if (!dictionary || typeof dictionary.defineTag !== "function") {
      return;
    }

    dictionary.defineTag("codeblock", {
      canHaveValue: true
    });

    dictionary.defineTag("codeblockend", {
      canHaveValue: true
    });

    dictionary.defineTag("coderef", {
      canHaveValue: true,
      /**
       * @lang zh-CN 将当前标签原值记录到coderef元数据，空标签保留既有空字符串回退。
       * @lang en Records the original tag value in coderef metadata, retaining the existing empty-string fallback.
       * @param {object} doclet <lang><zh-CN>词典回调提供的原节点。</zh-CN><en>Original node supplied by the dictionary callback.</en></lang>
       * @param {object} tag <lang><zh-CN>提供value或text的原标签。</zh-CN><en>Original tag supplying value or text.</en></lang>
       * @returns {void} <lang><zh-CN>就地附加标签元数据。</zh-CN><en>Appends tag metadata in place.</en></lang>
       */
      onTagged(doclet, tag) {
        // <lang><zh-CN>仅保存输入值，语言解析及回退在后续字段构建阶段执行。</zh-CN><en>Retain input values only; locale parsing and fallback happen during subsequent field construction.</en></lang>
        appendTag(doclet, "coderef", tag.value || tag.text || "");
      }
    });
  },

  /**
   * @lang zh-CN 保存带文件名的解析输入及事件引用，再扫描显式片段；源可含私有内容，后续发布必须经过输出策略。
   * @lang en Retains named parse inputs and event references, then scans explicit fragments; source may be private and publication must apply output policy.
   * @param {object} event <lang><zh-CN>提供filename和source的解析前事件。</zh-CN><en>Before-parse event supplying filename and source.</en></lang>
   * @param {object} context <lang><zh-CN>保存本轮源及片段注册表的受信上下文。</zh-CN><en>Trusted context holding this run's source and fragment registries.</en></lang>
   * @returns {void} <lang><zh-CN>更新内存注册表与诊断，无返回值。</zh-CN><en>Updates in-memory registries and diagnostics and returns nothing.</en></lang>
   */
  beforeParse(event, context) {
    if (!event || !event.filename) {
      return;
    }

    // <lang><zh-CN>保留事件引用供独立地图在最终写入时检测后续插件对同一解析输入的改写；既有源码字符串仍供旧预览逻辑使用。</zh-CN><en>Retain the event reference so the independent map can detect later plugins rewriting the same parse input; the existing source snapshot still serves legacy previews.</en></lang>
    context.state.sourceFiles.set(event.filename, {
      filePath: event.filename,
      source: event.source || "",
      sourceEvent: event
    });

    scanSourceFragments(event, context);
  },

  /**
   * @lang zh-CN 按现有源模式构造doclet定义、主块与片段容器；缺doclet时忽略，预览与链接服从上下文配置。
   * @lang en Builds doclet definitions, primary blocks and fragment containers under the existing source mode; missing doclets are ignored and previews/links follow context configuration.
   * @param {object} event <lang><zh-CN>可缺doclet的新节点事件。</zh-CN><en>New-node event whose doclet may be absent.</en></lang>
   * @param {object} context <lang><zh-CN>含源码配置、注册表与节点元数据的受信上下文。</zh-CN><en>Trusted context holding source configuration, registries and node metadata.</en></lang>
   * @returns {void} <lang><zh-CN>就地附加来源元数据，无返回值。</zh-CN><en>Attaches provenance metadata in place and returns nothing.</en></lang>
   */
  newDoclet(event, context) {
    if (!event || !event.doclet) {
      return;
    }

    // <lang><zh-CN>同一doclet的可变元数据承接实际来源，保留已有引用数组。</zh-CN><en>The same doclet's mutable metadata receives actual provenance while preserving existing reference arrays.</en></lang>
    const metadata = context.markMicroPlugin(event.doclet, this.name);
    metadata.source.model = "hia-jsdoc-source";
    metadata.source.modelVersion = "0.2.0";
    metadata.source.mode = context.config.source.mode || "all";
    metadata.source.definedIn = buildDefinedIn(event.doclet, context);
    metadata.source.primaryBlock = buildPrimaryBlock(event.doclet, context);
    metadata.source.fragments = metadata.source.fragments || [];
    metadata.source.references = metadata.source.references || [];
    metadata.source.diagnostics = metadata.source.diagnostics || [];
  },

  /**
   * @lang zh-CN 解析本次doclet的显式片段引用并汇总注册表；缺列表时按空列表处理，引用失败进入已有诊断。
   * @lang en Resolves explicit fragment references for this run's doclets and summarizes the registry; absent lists are empty and failed references enter existing diagnostics.
   * @param {object} event <lang><zh-CN>可含doclets数组的解析完成事件。</zh-CN><en>Parse-completion event optionally containing a doclets array.</en></lang>
   * @param {object} context <lang><zh-CN>持有源片段与诊断的受信上下文。</zh-CN><en>Trusted context holding source fragments and diagnostics.</en></lang>
   * @returns {void} <lang><zh-CN>更新引用及片段汇总，无返回值。</zh-CN><en>Updates references and fragment summaries and returns nothing.</en></lang>
   */
  parseComplete(event, context) {
    // <lang><zh-CN>仅遍历本次事件的节点数组，避免回用其它运行的节点。</zh-CN><en>Traverse only this event's node array, avoiding nodes from another run.</en></lang>
    const doclets = event && Array.isArray(event.doclets) ? event.doclets : [];

    for (const doclet of doclets) {
      resolveDocletReferences(doclet, context);
    }

    context.state.output.sourceFragments = Array.from(
      context.state.registries.sourceFragments.values()
    ).map(summarizeFragment);
  }
};
