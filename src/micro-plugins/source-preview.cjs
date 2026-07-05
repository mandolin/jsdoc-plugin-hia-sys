"use strict";

module.exports = {
  name: "source-preview",
  order: 30,

  newDoclet(event, context) {
    if (!event || !event.doclet) {
      return;
    }

    const metadata = context.markMicroPlugin(event.doclet, this.name);
    metadata.source.preview = {
      enabled: Boolean(context.config.source.preview.enabled),
      defaultExpanded: Boolean(context.config.source.preview.defaultExpanded)
    };
  }
};
