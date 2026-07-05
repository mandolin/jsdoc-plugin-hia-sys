"use strict";

const {
  buildOutputContract,
  writeIntegrationOutput
} = require("../runtime/output-contract.cjs");
const { VERSION } = require("../version.cjs");

function toNode(doclet, context) {
  const metadata = context.ensureDocletHia(doclet);

  return {
    id: metadata.doclet.longname || metadata.doclet.name,
    name: metadata.doclet.name,
    longname: metadata.doclet.longname,
    kind: metadata.doclet.kind,
    source: metadata.source,
    i18n: metadata.i18n
  };
}

module.exports = {
  name: "hia-ir-exporter",
  order: 110,

  parseComplete(event, context) {
    const doclets = event && Array.isArray(event.doclets) ? event.doclets : [];

    context.state.doclets = doclets;
    context.state.integration.ir = {
      version: VERSION,
      mode: context.config.mode,
      nodes: doclets.map((doclet) => toNode(doclet, context))
    };
  },

  processingComplete(event, context) {
    const doclets = event && Array.isArray(event.doclets)
      ? event.doclets
      : context.state.doclets;
    const output = buildOutputContract(context.state, doclets);

    context.state.output.standalone = output.standalone;
    context.state.output.integration = output.integration;
    context.state.output.themeContract = output.standalone.theme;
    context.state.integration.ir = output.integration.ir;

    try {
      const writtenFile = writeIntegrationOutput(context.state, output.integration);

      if (writtenFile) {
        context.state.output.integrationOutputFile = writtenFile;
      }
    } catch (error) {
      context.addDiagnostic({
        code: "HIA_INTEGRATION_OUTPUT_WRITE_FAILED",
        severity: "error",
        message: `Cannot write HIA integration output: ${error.message}`,
        plugin: this.name,
        data: {
          outputFile: context.config.integration.outputFile || ""
        }
      });
      context.state.output.diagnostics = context.diagnostics.list();
      context.state.output.diagnosticCounts = context.diagnostics.countBySeverity();
    }
  }
};
