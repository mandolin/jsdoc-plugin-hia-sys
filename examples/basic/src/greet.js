"use strict";

/**
 * Greets a <lang key="greet.target"><zh-CN>用户</zh-CN><en>user</en></lang>.
 *
 * @function greet
 * @example
 * // @coderef GREET_BODY
 * @param {string} name User <lang key="greet.param.name"><zh-CN>名称</zh-CN><en>name</en></lang>.
 * @returns {string} Greeting <lang key="greet.return.text"><zh-CN>文本</zh-CN><en>text</en></lang>.
 * @coderef GREET_BODY
 * @hiaKey greet.description
 * @hiaPath api.greet
 * @lang zh-CN 问候一个用户。
 * @lang en Greets a user.
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
