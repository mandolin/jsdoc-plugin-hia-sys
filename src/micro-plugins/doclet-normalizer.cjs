"use strict";

module.exports = {
  name: "doclet-normalizer",
  order: 50,

  newDoclet(event, context) {
    if (!event || !event.doclet) {
      return;
    }

    const doclet = event.doclet;
    const metadata = context.markMicroPlugin(doclet, this.name);

    metadata.doclet = {
      name: doclet.name || "",
      longname: doclet.longname || doclet.name || "",
      kind: doclet.kind || "",
      memberof: doclet.memberof || "",
      scope: doclet.scope || ""
    };
  }
};
