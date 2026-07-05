"use strict";

/**
 * Shared helper.
 *
 * @function normalizeName
 * @param {string} name User name.
 * @returns {string} Normalized name.
 * @hiaKey shared.helper
 * @hiaPath api.shared
 */
/* @codeblock SHARED_HELPER */
function normalizeName(name) {
  return String(name).trim();
}
/* @codeblockend SHARED_HELPER */

module.exports = {
  normalizeName
};
