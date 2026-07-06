"use strict";

const VALID_SEVERITIES = new Set(["error", "warning", "info"]);

function normalizeSeverity(severity) {
  return severity === "hint" ? "info" : severity;
}

class DiagnosticsCollector {
  constructor() {
    this.items = [];
  }

  add(diagnostic) {
    const item = {
      code: diagnostic.code || "HIA0000",
      severity: VALID_SEVERITIES.has(normalizeSeverity(diagnostic.severity))
        ? normalizeSeverity(diagnostic.severity)
        : "warning",
      message: diagnostic.message || "Unknown HIA diagnostic.",
      plugin: diagnostic.plugin || "core",
      filePath: diagnostic.filePath || "",
      range: diagnostic.range || null,
      data: diagnostic.data || null
    };

    this.items.push(item);
    return item;
  }

  list() {
    return this.items.slice();
  }

  countBySeverity() {
    return this.items.reduce((counts, item) => {
      counts[item.severity] = (counts[item.severity] || 0) + 1;
      return counts;
    }, {});
  }
}

module.exports = {
  DiagnosticsCollector
};
