"use strict";

const path = require("node:path");

const EXTENSION_LANGUAGE = new Map([
  [".cjs", "javascript"],
  [".mjs", "javascript"],
  [".js", "javascript"],
  [".jsx", "javascript"],
  [".ts", "typescript"],
  [".tsx", "typescript"],
  [".css", "css"],
  [".scss", "scss"],
  [".sass", "sass"],
  [".html", "html"],
  [".htm", "html"],
  [".pug", "pug"],
  [".md", "markdown"]
]);

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function inferLanguage(filePath) {
  return EXTENSION_LANGUAGE.get(path.extname(filePath).toLowerCase()) || "text";
}

function normalizeOpenMode(openMode) {
  const value = String(openMode || "").trim();

  if (value === "new-tab" || value === "newTab" || value === "external") {
    return "new-tab";
  }

  if (value === "same-tab" || value === "sameTab" || value === "currentPage" || value === "current-page") {
    return "same-tab";
  }

  return value || "same-tab";
}

function getRelativePath(filePath, config) {
  const basePath = config.source.basePath || process.cwd();
  return toPosixPath(path.relative(basePath, filePath));
}

function normalizeAbsolutePath(filePath) {
  return path.resolve(String(filePath || ""));
}

function getDocletSourceCandidates(doclet) {
  const meta = doclet && doclet.meta ? doclet.meta : {};
  const candidates = [];

  if (meta.filename && path.isAbsolute(meta.filename)) {
    candidates.push(meta.filename);
  }

  if (meta.filename && meta.path) {
    candidates.push(path.resolve(meta.path, meta.filename));
  }

  if (meta.filename) {
    candidates.push(path.resolve(meta.filename));
  }

  return candidates;
}

function resolveDocletSourceFile(doclet, state) {
  const sourceFiles = state && state.sourceFiles instanceof Map
    ? state.sourceFiles
    : new Map();
  const candidates = getDocletSourceCandidates(doclet).map(normalizeAbsolutePath);

  for (const [key, record] of sourceFiles.entries()) {
    const filePath = record && record.filePath ? record.filePath : key;
    const normalized = normalizeAbsolutePath(filePath);

    if (candidates.includes(normalized)) {
      return {
        filePath,
        source: record && typeof record.source === "string" ? record.source : ""
      };
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  const target = toPosixPath(candidates[0]).toLowerCase();

  for (const [key, record] of sourceFiles.entries()) {
    const filePath = record && record.filePath ? record.filePath : key;
    const normalized = toPosixPath(normalizeAbsolutePath(filePath)).toLowerCase();

    if (target.endsWith(normalized) || normalized.endsWith(target)) {
      return {
        filePath,
        source: record && typeof record.source === "string" ? record.source : ""
      };
    }
  }

  return null;
}

function trimOneOuterNewline(content) {
  return content.replace(/^\r?\n/, "").replace(/\r?\n[ \t]*$/, "");
}

function getLineColumn(source, index) {
  const text = source.slice(0, Math.max(0, index));
  const lines = text.split(/\r\n|\n|\r/);

  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1
  };
}

function buildSourceLink(fragment, config) {
  const linkConfig = config.source.link;
  const openMode = normalizeOpenMode(linkConfig.openMode);

  if (!linkConfig.enabled || !linkConfig.rootUrl) {
    return {
      enabled: Boolean(linkConfig.enabled),
      fileUrl: "",
      lineUrl: "",
      openMode
    };
  }

  const rootUrl = linkConfig.rootUrl.replace(/\/+$/, "");
  const fileUrl = `${rootUrl}/${fragment.relativePath}`;
  const startLine = fragment.range.start.line;
  const endLine = fragment.range.end.line;
  const lineHash = endLine > startLine ? `#L${startLine}-L${endLine}` : `#L${startLine}`;

  return {
    enabled: true,
    fileUrl,
    lineUrl: `${fileUrl}${lineHash}`,
    openMode
  };
}

function buildSourcePreview(fragment, config) {
  return {
    enabled: Boolean(config.source.preview.enabled),
    defaultExpanded: Boolean(config.source.preview.defaultExpanded),
    language: fragment.language,
    content: fragment.content,
    range: fragment.range
  };
}

function getDocletPosition(doclet) {
  const meta = doclet && doclet.meta ? doclet.meta : {};
  const line = Number(meta.lineno || meta.line || 1);
  const column = Number(meta.columnno || meta.column || 1);

  return {
    line: Number.isFinite(line) && line > 0 ? line : 1,
    column: Number.isFinite(column) && column > 0 ? column : 1
  };
}

function createUnresolvedPrimaryBlock(doclet, reason) {
  return {
    kind: "primary-block",
    id: `doclet:${doclet && doclet.kind ? doclet.kind : "unknown"}:${doclet && (doclet.longname || doclet.name) ? doclet.longname || doclet.name : "anonymous"}`,
    relativePath: "",
    language: "text",
    range: null,
    content: "",
    rangeSource: "unresolved",
    confidence: "none",
    link: {
      enabled: false,
      fileUrl: "",
      lineUrl: "",
      openMode: ""
    },
    preview: {
      enabled: false,
      defaultExpanded: false,
      language: "text",
      content: "",
      range: null
    },
    diagnostics: reason
      ? [
          {
            code: "HIA_SOURCE_PRIMARY_BLOCK_UNRESOLVED",
            severity: "info",
            message: reason
          }
        ]
      : []
  };
}

function splitLines(source) {
  return String(source || "").split(/\r\n|\n|\r/);
}

function findFirstCodeLine(lines, startIndex, maxScanLines) {
  const limit = Math.min(lines.length - 1, startIndex + maxScanLines);

  for (let index = startIndex; index <= limit; index += 1) {
    const line = lines[index] || "";
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    if (
      trimmed.startsWith("/**") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("*/")
    ) {
      continue;
    }

    return index;
  }

  return startIndex;
}

function stripStringsAndLineComments(line) {
  return String(line || "")
    .replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "")
    .replace(/\/\/.*$/, "");
}

function countChar(value, char) {
  return Array.from(value).filter((item) => item === char).length;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getDocletCandidateNames(doclet) {
  const names = new Set();
  const values = [
    doclet && doclet.name,
    doclet && doclet.longname,
    doclet && doclet.alias
  ];

  for (const value of values) {
    const text = String(value || "").trim();

    if (!text) {
      continue;
    }

    const parts = text.split(/[.#~:]/).filter(Boolean);
    const tail = parts[parts.length - 1] || text;

    for (const candidate of [text, tail]) {
      if (/^[A-Za-z_$][\w$]*$/.test(candidate)) {
        names.add(candidate);
      }
    }
  }

  return Array.from(names);
}

function matchesJsDeclarationLine(line, doclet) {
  const kind = doclet && doclet.kind ? String(doclet.kind) : "";

  if (kind === "module" || kind === "typedef") {
    return false;
  }

  const stripped = stripStringsAndLineComments(line);
  const names = getDocletCandidateNames(doclet);

  if (names.length === 0) {
    return false;
  }

  for (const name of names) {
    const escapedName = escapeRegExp(name);
    const exportPrefix = "(?:export\\s+)?(?:default\\s+)?";
    const patterns = [
      new RegExp(`^\\s*${exportPrefix}(?:async\\s+)?function\\s*\\*?\\s+${escapedName}\\b`),
      new RegExp(`^\\s*${exportPrefix}class\\s+${escapedName}\\b`),
      new RegExp(`^\\s*${exportPrefix}(?:const|let|var)\\s+${escapedName}\\b`),
      new RegExp(`^\\s*(?:exports|module\\.exports)\\.${escapedName}\\s*=`),
      new RegExp(`^\\s*${escapedName}\\s*[:=]\\s*(?:async\\s*)?(?:function\\b|class\\b|\\([^)]*\\)\\s*=>|[A-Za-z_$][\\w$]*\\s*=>)`),
      new RegExp(`^\\s*${escapedName}\\s*\\([^)]*\\)\\s*\\{`)
    ];

    if (patterns.some((pattern) => pattern.test(stripped))) {
      return true;
    }
  }

  return false;
}

function findJsDeclarationLine(lines, startIndex, maxScanLines, doclet) {
  const limit = Math.min(lines.length - 1, startIndex + maxScanLines);

  for (let index = startIndex; index <= limit; index += 1) {
    if (matchesJsDeclarationLine(lines[index] || "", doclet)) {
      return index;
    }
  }

  return -1;
}

function getRangeContent(lines, startIndex, endIndex) {
  return {
    range: {
      start: {
        line: startIndex + 1,
        column: 1
      },
      end: {
        line: endIndex + 1,
        column: (lines[endIndex] || "").length + 1
      }
    },
    content: lines.slice(startIndex, endIndex + 1).join("\n")
  };
}

function findBalancedJsBlockEnd(lines, startIndex, maxLines) {
  const limit = Math.min(lines.length - 1, startIndex + maxLines - 1);
  let balance = 0;
  let sawBrace = false;

  for (let index = startIndex; index <= limit; index += 1) {
    const stripped = stripStringsAndLineComments(lines[index]);
    const opens = countChar(stripped, "{");
    const closes = countChar(stripped, "}");

    if (opens > 0 || closes > 0) {
      sawBrace = true;
      balance += opens - closes;
    }

    if (sawBrace && balance <= 0) {
      return index;
    }
  }

  return -1;
}

function findJsStatementEnd(lines, startIndex, maxLines) {
  const limit = Math.min(lines.length - 1, startIndex + maxLines - 1);
  let parenBalance = 0;
  let bracketBalance = 0;

  for (let index = startIndex; index <= limit; index += 1) {
    const stripped = stripStringsAndLineComments(lines[index]);

    for (const char of stripped) {
      if (char === "(") {
        parenBalance += 1;
      } else if (char === ")") {
        parenBalance -= 1;
      } else if (char === "[") {
        bracketBalance += 1;
      } else if (char === "]") {
        bracketBalance -= 1;
      }
    }

    if (parenBalance <= 0 && bracketBalance <= 0 && /;\s*$/.test(stripped)) {
      return index;
    }

    if (index > startIndex && parenBalance <= 0 && bracketBalance <= 0 && /^\s*$/.test(lines[index])) {
      return index - 1;
    }
  }

  return -1;
}

function inferJsParserRange(lines, startIndex, maxLines, maxScanLines, doclet) {
  const declarationIndex = findJsDeclarationLine(lines, startIndex, maxScanLines, doclet);

  if (declarationIndex < 0) {
    return null;
  }

  const blockEndIndex = findBalancedJsBlockEnd(lines, declarationIndex, maxLines);
  const endIndex = blockEndIndex >= 0
    ? blockEndIndex
    : findJsStatementEnd(lines, declarationIndex, maxLines);

  if (endIndex < declarationIndex) {
    return null;
  }

  return {
    ...getRangeContent(lines, declarationIndex, endIndex),
    rangeSource: "parser-js",
    confidence: blockEndIndex >= 0 ? "high" : "medium"
  };
}

function inferHeuristicRange(lines, startIndex, maxLines, maxScanLines) {
  const codeStartIndex = findFirstCodeLine(lines, startIndex, maxScanLines);
  const limit = Math.min(lines.length - 1, codeStartIndex + maxLines - 1);
  let balance = 0;
  let sawBrace = false;
  let endIndex = codeStartIndex;

  for (let index = codeStartIndex; index <= limit; index += 1) {
    const stripped = stripStringsAndLineComments(lines[index]);
    const opens = countChar(stripped, "{");
    const closes = countChar(stripped, "}");

    if (opens > 0 || closes > 0) {
      sawBrace = true;
      balance += opens - closes;
    }

    endIndex = index;

    if (sawBrace && balance <= 0 && index > codeStartIndex) {
      break;
    }

    if (!sawBrace && index > codeStartIndex && /^\s*$/.test(lines[index])) {
      endIndex = index - 1;
      break;
    }
  }

  return {
    ...getRangeContent(lines, codeStartIndex, endIndex),
    rangeSource: "heuristic",
    confidence: sawBrace && balance <= 0 ? "medium" : "low"
  };
}

function inferPrimaryRange(source, position, config, doclet) {
  const lines = splitLines(source);

  if (lines.length === 0) {
    return null;
  }

  const previewConfig = config.source.preview || {};
  const maxLines = Math.max(1, Number(previewConfig.maxLines || 80));
  const maxScanLines = Math.max(8, Number(previewConfig.maxScanLines || 40));
  const rangeStrategy = previewConfig.rangeStrategy || "parser-js";
  const startIndex = Math.min(Math.max(position.line - 1, 0), lines.length - 1);

  if (rangeStrategy !== "heuristic") {
    const parserRange = inferJsParserRange(lines, startIndex, maxLines, maxScanLines, doclet);

    if (parserRange) {
      return parserRange;
    }
  }

  return inferHeuristicRange(lines, startIndex, maxLines, maxScanLines);
}

function buildDefinedIn(doclet, context) {
  const record = resolveDocletSourceFile(doclet, context.state);

  if (!record) {
    return null;
  }

  const position = getDocletPosition(doclet);
  const definedIn = {
    kind: "defined-in",
    relativePath: getRelativePath(record.filePath, context.config),
    language: inferLanguage(record.filePath),
    position,
    range: {
      start: position,
      end: position
    }
  };

  definedIn.link = buildSourceLink(definedIn, context.config);

  return definedIn;
}

function buildPrimaryBlock(doclet, context) {
  const record = resolveDocletSourceFile(doclet, context.state);

  if (!record || !record.source) {
    return createUnresolvedPrimaryBlock(doclet, "Doclet source file was not captured before parsing.");
  }

  const position = getDocletPosition(doclet);
  const inferred = inferPrimaryRange(record.source, position, context.config, doclet);

  if (!inferred || !inferred.content) {
    return createUnresolvedPrimaryBlock(doclet, "Doclet source range could not be inferred.");
  }

  const block = {
    kind: "primary-block",
    id: `doclet:${doclet.kind || "unknown"}:${doclet.longname || doclet.name || "anonymous"}`,
    relativePath: getRelativePath(record.filePath, context.config),
    language: inferLanguage(record.filePath),
    range: inferred.range,
    content: inferred.content,
    rangeSource: inferred.rangeSource || "heuristic",
    confidence: inferred.confidence,
    diagnostics: []
  };

  block.link = buildSourceLink(block, context.config);
  block.preview = buildSourcePreview(block, context.config);

  return block;
}

module.exports = {
  buildDefinedIn,
  buildPrimaryBlock,
  buildSourceLink,
  buildSourcePreview,
  getLineColumn,
  getRelativePath,
  inferLanguage,
  normalizeOpenMode,
  resolveDocletSourceFile,
  toPosixPath,
  trimOneOuterNewline
};
