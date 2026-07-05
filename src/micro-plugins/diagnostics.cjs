"use strict";

module.exports = {
  name: "diagnostics",
  order: 100,

  processingComplete(event, context) {
    const doclets = event && Array.isArray(event.doclets) ? event.doclets : [];

    for (const doclet of doclets) {
      context.markMicroPlugin(doclet, this.name);
      context.attachDiagnostics(doclet);
    }

    context.state.output.diagnostics = context.diagnostics.list();
    context.state.output.diagnosticCounts = context.diagnostics.countBySeverity();
  }
};
