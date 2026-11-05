/** @lang zh-CN 用真实JSDoc验证签名参数和源码授权，禁止按注释猜参数或读取函数正文。 @lang en Tests callable parameters and source authorization through real JSDoc, never guessing arguments from comments or reading the outer body into signatures. */
"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const os=require("node:os");
const {spawnSync}=require("node:child_process");

/**
 * @lang zh-CN 在仅本测试拥有的临时根运行原生解析，返回实际integration节点并清理已核实的根。
 * @lang en Runs native parsing under a test-owned temporary root, returns actual integration nodes and removes only the verified root.
 * @param {string} source 中性测试源码。 / Neutral fixture source.
 * @param {object} [sourceOptions] 已有源码配置。 / Existing source configuration.
 * @param {boolean} [rewrite=false] 模拟后续插件改写解析输入。 / Simulates a later plugin rewriting parser input.
 * @returns {object[]} 实际原生节点。 / Actual native nodes.
 */
function parse(source,sourceOptions={},rewrite=false) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"hia-callable-"));
  try {
    const file=path.join(root,"sample.mjs");
    const output=path.join(root,"integration.json");
    const config=path.join(root,"jsdoc.json");
    fs.writeFileSync(file,source);
    const plugins=[path.resolve(__dirname,"../src/index.cjs")];
    if(rewrite) {const rewriter=path.join(root,"rewrite.cjs");fs.writeFileSync(rewriter,"exports.handlers={beforeParse(e){e.source+='\\n';}};");plugins.push(rewriter);}
    fs.writeFileSync(config,JSON.stringify({plugins,source:{include:[file],includePattern:".+\\.mjs$"},opts:{hia:{mode:"hiaIntegration",source:{basePath:root,preview:{enabled:true},...sourceOptions},integration:{enabled:true,outputFile:output}}}}));
    const result=spawnSync(process.execPath,[require.resolve("jsdoc/jsdoc.js"),"-c",config,"-X"],{cwd:root,encoding:"utf8",shell:false,maxBuffer:4*1024*1024});
    assert.equal(result.status,0,result.stderr);
    return JSON.parse(fs.readFileSync(output)).ir.nodes;
  } finally {
    // <lang><zh-CN>只删除已核实为系统临时目录直属子目录且带本测试前缀的根。</zh-CN><en>Remove only a verified direct child of the system temporary directory with this test's prefix.</en></lang>
    const actual=fs.realpathSync.native(root);
    assert.equal(path.dirname(actual),fs.realpathSync.native(os.tmpdir()));
    assert(path.basename(actual).startsWith("hia-callable-"));
    fs.rmSync(actual,{recursive:true});
  }
}

test("native arguments retain defaults/destructuring/rest and declared return types",()=>{
  const nodes=parse('/** description\n * @param {object} options documented label\n * @param {string} options.path nested field\n * @returns {object} declared result\n */\nexport async function run(value = 2, {x}, ...rest) { throw new Error("BODY_MUST_NOT_APPEAR"); }');
  assert.equal(nodes.find(node=>node.name==="run").signature,"async run(value = 2, {x}, ...rest) → object");
});
test("arrow parameters use native ranges even when a default contains an arrow body",()=>{
  const nodes=parse('/** arrow */\nexport const arrow = (x = () => ({a:1})) => ({value:x});');
  assert.equal(nodes.find(node=>node.name==="arrow").signature,"arrow(x = () => ({a:1}))");
});
test("missing param tags never produce a false empty argument list",()=>{
  assert.equal(parse('/** actual */\nexport function actual(first, second) {return first;}').find(node=>node.name==="actual").signature,"actual(first, second)");
});
test("disabled source previews and source mode none omit source-derived signatures",()=>{
  for(const options of [{preview:{enabled:false}},{mode:"none"},{mode:"unknown"},{preview:{enabled:"true"}}]) assert.equal(parse('/** denied */\nexport function denied(secret = "SOURCE_DEFAULT") {}',options).find(node=>node.name==="denied").signature,undefined);
});
test("parser pretreatment does not turn shifted coordinates into a signature",()=>{
  assert.equal(parse('#!/usr/bin/env node\n/** shifted */\nexport function shifted(a) {}').find(node=>node.name==="shifted").signature,undefined);
});
test("virtual documented functions have no fabricated source signature",()=>{
  assert.equal(parse('/**\n * Virtual function.\n * @function imaginary\n * @param {string} guess documentation only\n */').find(node=>node.name==="imaginary").signature,undefined);
});
test("later source rewrites cannot reuse a prior source snapshot",()=>{
  assert.equal(parse('/** altered */\nexport function altered(value) {}',{},true).find(node=>node.name==="altered").signature,undefined);
});
