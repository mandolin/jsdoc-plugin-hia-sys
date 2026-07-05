"use strict";

module.exports = {
  name: "source-link",
  order: 20,

  newDoclet(event, context) {
    if (!event || !event.doclet) {
      return;
    }

    const metadata = context.markMicroPlugin(event.doclet, this.name);
    metadata.source.link = {
      enabled: Boolean(context.config.source.link.enabled),
      rootUrl: context.config.source.link.rootUrl,
      openMode: context.config.source.link.openMode
    };
  }
};
