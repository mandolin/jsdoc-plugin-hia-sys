/** @lang zh-CN 从已核实原生AST参数范围生成可读调用签名，不解析第二套语法、不推断返回类型。 @lang en Formats callable signatures from verified native AST parameter ranges without a second parser or inferred return types. */
"use strict";
const path=require("node:path");

/**
 * @lang zh-CN 使用现有源码预览授权及同轮源码证明，缺失证据时不提供签名；参数默认表达式属于源码，须由生产者保证可公开。
 * @lang en Uses existing source-preview consent and same-run source proof; missing evidence omits the signature. Default expressions are source content whose publication safety remains the producer's responsibility.
 * @param {object} doclet 原生文档节点。 / Native documentation node.
 * @param {object} state 本轮插件状态。 / Current plugin state.
 * @param {Map} verifiedCache 仅本次投影共享的源码核验缓存。 / Source verification cache shared only by this projection.
 * @returns {string|undefined} 实际参数片段和已声明返回类型，或缺证据。 / Actual parameter fragments and declared return types, or absent evidence.
 */
function buildCallableSignature(doclet,state,verifiedCache) {
  // <lang><zh-CN>签名含源码默认表达式，服从原有预览开关；不由注释猜测可调用节点。</zh-CN><en>Signatures include source default expressions and obey existing preview controls; comments cannot imply a callable node.</en></lang>
  if(!["function","member","constant"].includes(doclet?.kind) || state.config?.source?.mode!=="all" || state.config?.source?.preview?.enabled!==true) return undefined;
  // <lang><zh-CN>延迟加载已有地图源码证明，避免output-contract与地图模块初始化循环；不改变其核验规则。</zh-CN><en>Load the existing map source-proof helpers lazily to avoid output-contract/map initialization cycles, without changing their verification rules.</en></lang>
  const {resolveVerifiedSource,exactAstRange,getInstalledJsdocVersion}=require("./doc-source-map.cjs");
  if(getInstalledJsdocVersion()!=="4.0.5") return undefined;
  const source=resolveVerifiedSource(doclet,state.sourceFiles??new Map(),path.resolve(state.config?.source?.basePath??"."),verifiedCache);
  if(!source || !exactAstRange(doclet,source.text)) return undefined;
  // <lang><zh-CN>原生导出包装只取其直接声明；其它已证明包装由meta.code.node直接给出函数子节点。</zh-CN><en>Native export wrappers expose only their direct declaration; other proven wrappers already supply the function child in meta.code.node.</en></lang>
  const event=doclet.meta.code.node;
  let node=event.type==="ExportNamedDeclaration" || event.type==="ExportDefaultDeclaration" ? event.declaration : event;
  // <lang><zh-CN>单个同名变量导出的函数值可由已证明的整个导出节点确认；多变量或重命名不猜测。</zh-CN><en>A single same-name exported variable can expose its function value under the proven whole-export node; multiple variables or renamed bindings are never guessed.</en></lang>
  if(node?.type==="VariableDeclaration" && node.declarations?.length===1 && node.declarations[0].id?.name===doclet.name) node=node.declarations[0].init;
  if(!node || !["FunctionDeclaration","FunctionExpression","ArrowFunctionExpression"].includes(node.type) || !Array.isArray(node.params) || !Array.isArray(node.range) || !Array.isArray(node.body?.range)) return undefined;
  // <lang><zh-CN>普通声明的原生paramnames可交叉核数；箭头/表达式原生未提供该可选字段，仍须有真实params数组。</zh-CN><en>Native paramnames cross-check ordinary declaration counts; arrows/expressions omit this optional native field but still require an actual params array.</en></lang>
  if(Array.isArray(doclet.meta.code.paramnames) && doclet.meta.code.paramnames.length!==node.params.length) return undefined;
  // <lang><zh-CN>只按AST顺序截取每个参数，嵌套函数默认值不会被正则误切；外层函数体绝不进入签名。</zh-CN><en>Slice parameters in AST order so nested function defaults cannot confuse regex splitting; the outer function body never enters the signature.</en></lang>
  const parameters=[];
  let previousEnd=node.range[0];
  for(const parameter of node.params) {
    const range=parameter.range;
    if(!Array.isArray(range) || range.length!==2 || !range.every(Number.isSafeInteger) || range[0]<previousEnd || range[1]<=range[0] || range[1]>node.body.range[0]) return undefined;
    const text=source.text.slice(range[0],range[1]);
    if(!text.trim()) return undefined;
    parameters.push(text);previousEnd=range[1];
  }
  // <lang><zh-CN>返回类型仅展示原@returns的类型名，不推断void、Promise或控制流结果；根参数类型仍在原生字段中完整保留。</zh-CN><en>Return types show only original @returns names, never inferred void, Promise or control-flow results; parameter types remain intact in native fields.</en></lang>
  const returns=[...new Set((doclet.returns??[]).flatMap(item=>Array.isArray(item.type?.names)?item.type.names:[]).filter(item=>typeof item==="string"&&item.trim()))];
  return `${node.async ? "async " : ""}${node.generator ? "*" : ""}${doclet.name}(${parameters.join(", ")})${returns.length ? ` → ${returns.join("|")}` : ""}`;
}

module.exports={buildCallableSignature};
