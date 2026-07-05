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

function getRelativePath(filePath, config) {
  const basePath = config.source.basePath || process.cwd();
  return toPosixPath(path.relative(basePath, filePath));
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

  if (!linkConfig.enabled || !linkConfig.rootUrl) {
    return {
      enabled: Boolean(linkConfig.enabled),
      fileUrl: "",
      lineUrl: "",
      openMode: linkConfig.openMode
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
    openMode: linkConfig.openMode
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

module.exports = {
  buildSourceLink,
  buildSourcePreview,
  getLineColumn,
  getRelativePath,
  inferLanguage,
  trimOneOuterNewline
};
