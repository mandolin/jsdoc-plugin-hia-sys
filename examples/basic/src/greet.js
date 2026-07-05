"use strict";

/**
 * Greets a user.
 *
 * @function greet
 * @example
 * // @coderef GREET_BODY
 * @param {string} name User name.
 * @returns {string} Greeting text.
 * @coderef GREET_BODY
 * @hiaKey greet.description
 * @hiaPath api.greet
 * @hiaText zh-CN 问候一个用户。
 * @hiaText en Greets a user.
 */
function greet(name) {
  /* @codeblock GREET_BODY */
  const message = `Hello, ${name}`;
  return message;
  /* @codeblockend GREET_BODY */
}

module.exports = {
  greet
};
