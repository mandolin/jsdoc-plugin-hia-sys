"use strict";

const { createPluginSystem } = require("./runtime/create-plugin-system.cjs");
const outputContract = require("./runtime/output-contract.cjs");
const { builtInMicroPlugins } = require("./micro-plugins/index.cjs");

const system = createPluginSystem({
  microPlugins: builtInMicroPlugins
});

exports.defineTags = function defineTags(dictionary) {
  system.defineTags(dictionary);
};

exports.handlers = {
  beforeParse(event) {
    system.handle("beforeParse", event);
  },
  newDoclet(event) {
    system.handle("newDoclet", event);
  },
  parseComplete(event) {
    system.handle("parseComplete", event);
  },
  processingComplete(event) {
    system.handle("processingComplete", event);
  }
};

exports._hia = {
  createPluginSystem,
  builtInMicroPlugins,
  outputContract,
  getState() {
    return system.getState();
  }
};
