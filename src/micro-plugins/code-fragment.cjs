"use strict";

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

module.exports = {
  name: "code-fragment",
  order: 10,

  setup(context) {
    context.state.registries.sourceFragments = new Map();
  },

  defineTags(event) {
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
      onTagged(doclet, tag) {
        appendTag(doclet, "coderef", tag.value || tag.text || "");
      }
    });
  },

  beforeParse(event, context) {
    if (!event || !event.filename) {
      return;
    }

    context.state.sourceFiles.set(event.filename, {
      filePath: event.filename,
      source: event.source || ""
    });

    scanSourceFragments(event, context);
  },

  newDoclet(event, context) {
    if (!event || !event.doclet) {
      return;
    }

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

  parseComplete(event, context) {
    const doclets = event && Array.isArray(event.doclets) ? event.doclets : [];

    for (const doclet of doclets) {
      resolveDocletReferences(doclet, context);
    }

    context.state.output.sourceFragments = Array.from(
      context.state.registries.sourceFragments.values()
    ).map(summarizeFragment);
  }
};
