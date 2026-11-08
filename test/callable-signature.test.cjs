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
 * @param {string} source <lang><zh-CN>中性测试源码。</zh-CN><en>Neutral fixture source.</en></lang>
 * @param {object} [sourceOptions] <lang><zh-CN>已有源码配置。</zh-CN><en>Existing source configuration.</en></lang>
 * @param {boolean} [rewrite=false] <lang><zh-CN>模拟后续插件改写解析输入。</zh-CN><en>Simulates a later plugin rewriting parser input.</en></lang>
 * @param {boolean} [mapEnabled=false] <lang><zh-CN>显式生成并核对同轮地图。</zh-CN><en>Explicitly generates and checks a same-run map.</en></lang>
 * @returns {object[]} <lang><zh-CN>实际原生节点。</zh-CN><en>Actual native nodes.</en></lang>
 */
function parse(source,sourceOptions={},rewrite=false,mapEnabled=false) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"hia-callable-"));
  try {
    const file=path.join(root,"sample.mjs");
    const output=path.join(root,"integration.json");
    const config=path.join(root,"jsdoc.json");
    fs.writeFileSync(file,source);
    const plugins=[path.resolve(__dirname,"../src/index.cjs")];
    if(rewrite) {const rewriter=path.join(root,"rewrite.cjs");fs.writeFileSync(rewriter,"exports.handlers={beforeParse(e){e.source+='\\n';}};");plugins.push(rewriter);}
    fs.writeFileSync(config,JSON.stringify({plugins,source:{include:[file],includePattern:".+\\.mjs$"},opts:{hia:{mode:"hiaIntegration",source:{basePath:root,preview:{enabled:true},...sourceOptions},i18n:{enabled:true,defaultLocale:"en",fallbackLocale:"en",locales:["en","zh-CN"]},integration:{enabled:true,outputFile:output},docSourceMap:{enabled:mapEnabled}}}}));
    const result=spawnSync(process.execPath,[require.resolve("jsdoc/jsdoc.js"),"-c",config,"-X"],{cwd:root,encoding:"utf8",shell:false,maxBuffer:4*1024*1024});
    assert.equal(result.status,0,result.stderr);
    // <lang><zh-CN>实际Integration节点作为地图身份与顺序的唯一比较基准。</zh-CN><en>Actual Integration nodes are the sole comparison baseline for map identities and order.</en></lang>
    const nodes = JSON.parse(fs.readFileSync(output)).ir.nodes;
    if (mapEnabled) {
      // <lang><zh-CN>固定侧车来自同一临时输出根，缺失或顺序变化必须失败。</zh-CN><en>The fixed sidecar belongs to the same temporary output root, with absence or reordered entries failing the check.</en></lang>
      const map = JSON.parse(fs.readFileSync(path.join(root, require("../src/runtime/doc-source-map.cjs").DOC_SOURCE_MAP_FILE)));
      assert.deepEqual(map.entries.map((entry) => entry.symbolId), nodes.map((node) => node.id));
    }
    return nodes;
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

/**
 * @lang zh-CN 已授权源码证明的签名应独立保留，语言诊断消失后仍有实际内容。
 * @lang en Authorized source-proven signatures retain actual content independently of locale diagnostics.
 */
test("source-proven signatures survive without prose or locale diagnostics", () => {
  // <lang><zh-CN>夹具只有真实函数声明，避免正文或标签使内容分数偶然为正。</zh-CN><en>The fixture contains only a real function declaration so prose or tags cannot accidentally produce a positive content score.</en></lang>
  const nodes = parse("export function signatureOnly(value) { return value; }", {}, false, true);
  // <lang><zh-CN>按真实声明名定位，缺节点须显式失败而非跳过签名断言。</zh-CN><en>Locate the real declaration by name and fail explicitly when absent instead of skipping signature assertions.</en></lang>
  const node = nodes.find((candidate) => candidate.name === "signatureOnly");
  assert.ok(node);
  assert.equal(node.signature, "signatureOnly(value)");
  assert.equal(node.summary, "");
  assert.deepEqual(node.i18n.fields, {});
  assert.deepEqual(node.diagnostics, []);
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

test("nested object methods retain defaults and async generator parameters",()=>{
  const nodes=parse('/** Public callbacks. */\nexport const hooks = {\n/** Runs a hook.\n * @returns {object} result\n */\nasync *run(value = 1, ...rest) { throw new Error("BODY_MUST_NOT_APPEAR"); }\n};');
  assert.equal(nodes.find(node=>node.name==="run").signature,"async *run(value = 1, ...rest) → object");
});
test("nested object arrow properties retain actual parameter shapes",()=>{
  const nodes=parse('/** Public callbacks. */\nexport const hooks = {\n/** Reads a value. */\nread: ({value}, fallback = 3) => value ?? fallback\n};');
  assert.equal(nodes.find(node=>node.name==="read").signature,"read({value}, fallback = 3)");
});
test("nested methods still obey source preview authorization",()=>{
  const nodes=parse('/** Public callbacks. */\nexport const hooks = {\n/** Runs a hook. */\nrun(secret = "SOURCE_DEFAULT") {}\n};',{preview:{enabled:false}});
  assert.equal(nodes.find(node=>node.name==="run").signature,undefined);
});

test("nested member bilingual fields remain distinct from the parent description",()=>{
  const nodes=parse('/**\n * @lang zh-CN 父对象。\n * @lang en Parent object.\n */\nexport const hooks = {\n/**\n * @lang zh-CN 读取值。\n * @lang en Reads a value.\n * @param {string} value <lang><zh-CN>输入。</zh-CN><en>Input.</en></lang>\n * @returns {string} <lang><zh-CN>结果。</zh-CN><en>Result.</en></lang>\n */\nread(value) {return value;}\n};');
  const member=nodes.find(node=>node.name==="read");
  assert.equal(member.i18n.fields.description.localizedText.en,"Reads a value.");
  assert.equal(member.i18n.fields.description.localizedText["zh-CN"],"读取值。");
  assert.equal(member.jsdoc.params[0].name,"value");
  assert.equal(member.jsdoc.returns[0].type.names[0],"string");
  assert.notEqual(member.i18n.fields.description.localizedText.en,nodes.find(node=>node.name==="hooks").i18n.fields.description.localizedText.en);
});

test("frozen descriptor properties retain their own bilingual text and source",()=>{
  const nodes = parse([
    "/** Public descriptor. */",
    "export const descriptor = Object.freeze({",
    "/**",
    " * @lang zh-CN 生产器协议身份。",
    " * @lang en Producer contract identity.",
    " */",
    "contract: 'documentation-producer',",
    "/**",
    " * @lang zh-CN 来源关联能力。",
    " * @lang en Source-linkage capabilities.",
    " */",
    "capabilities: {",
    "/**",
    " * @lang zh-CN 本次生产器支持来源关联。",
    " * @lang en This producer supports source linkage.",
    " */",
    "sourceLinkage: true",
    "}",
    "});"
  ].join("\n"));
  const contract = nodes.find(node => node.name === "contract");
  const sourceLinkage = nodes.find(node => node.name === "sourceLinkage");
  assert.equal(contract.i18n.fields.description.localizedText.en, "Producer contract identity.");
  assert.equal(contract.i18n.fields.description.localizedText["zh-CN"], "生产器协议身份。");
  assert.equal(sourceLinkage.i18n.fields.description.localizedText.en, "This producer supports source linkage.");
  assert.equal(sourceLinkage.source.definedIn.position.line, 17);
});

test("built-in micro-plugin properties retain their own bilingual text and hook signatures", () => {
  // <lang><zh-CN>真实源文件和运行导出的键各自限定期望，不能用父对象正文替代子属性。</zh-CN><en>Actual sources and runtime-exported keys independently constrain expectations; parent prose cannot substitute for property documentation.</en></lang>
  const plugins = require("../src/micro-plugins/index.cjs").builtInMicroPlugins;
  for (const plugin of plugins) {
    // <lang><zh-CN>源仅交原生JSDoc解析，读取本仓既有实现核键与参数数量。</zh-CN><en>Sources go only to native JSDoc parsing; existing owned implementations establish keys and argument counts.</en></lang>
    const source = fs.readFileSync(path.join(__dirname, "../src/micro-plugins", `${plugin.name}.cjs`), "utf8");
    const nodes = parse(source);
    for (const [name, value] of Object.entries(plugin)) {
      // <lang><zh-CN>公开对象的每个直接属性须有唯一原生节点，双语正文和真实签名分别核验。</zh-CN><en>Every direct public property needs a unique native node, with bilingual prose and actual signatures checked separately.</en></lang>
      const matches = nodes.filter(node => node.name === name);
      assert.equal(matches.length, 1, `${plugin.name}.${name}`);
      const node = matches[0];
      assert.ok(node.i18n.fields.description.localizedText.en, `${plugin.name}.${name} English`);
      assert.ok(node.i18n.fields.description.localizedText["zh-CN"], `${plugin.name}.${name} 中文`);
      assert.notEqual(node.i18n.fields.description.localizedText.en, node.i18n.fields.description.localizedText["zh-CN"], `${plugin.name}.${name} distinct locale prose`);
      if (typeof value === "function") {
        // <lang><zh-CN>当前内置钩子没有默认/rest参数，运行时长度可独立核参数标签和签名。</zh-CN><en>Current built-in hooks have no default/rest parameters, so runtime arity independently checks parameter tags and signatures.</en></lang>
        assert.equal(node.jsdoc.params.length, value.length);
        assert.equal(node.signature, `${name}(${node.jsdoc.params.map(param => param.name).join(", ")}) → void`);
      }
    }
  }
});
