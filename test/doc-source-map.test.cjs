"use strict";

/**
 * @lang zh-CN 以真实源码字符串和最终 integration 节点验证 JSDoc 独立源码映射的保守精度与隐私边界。
 * @lang en Verifies conservative JSDoc source-map precision and privacy boundaries against source text and final integration nodes.
 */

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { buildIntegrationOutput } = require("../src/runtime/output-contract.cjs");
const plugin = require("../src/index.cjs");
const {
  DOC_SOURCE_MAP_FILE,
  buildJsdocDocSourceMap,
  clearJsdocDocSourceMap,
  writeJsdocDocSourceMap
} = require("../src/runtime/doc-source-map.cjs");

/**
 * @lang zh-CN 在系统临时根下创建源码样本并清理已核实的直接子目录。
 * @lang en Creates a source fixture below the system temporary root and cleans only a verified direct child.
 * @param {string} source 源码文本。 / Source text.
 * @param {(fixture: {root:string, file:string, sourceFiles:Map<string,object>}) => void} inspect 检查函数。 / Inspection callback.
 * @returns {void} 不返回值。 / Returns nothing.
 */
function withSource(source, inspect) {
  // <lang><zh-CN>临时目录只由本测试创建，不接收外部路径。</zh-CN><en>The test creates this temporary directory without accepting external paths.</en></lang>
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hia-jsdoc-map-"));
  // <lang><zh-CN>源码文件固定在临时目录直属位置。</zh-CN><en>The source file is fixed directly under the temporary directory.</en></lang>
  const file = path.join(root, "sample.js");
  try {
    fs.writeFileSync(file, source, "utf8");
    // <lang><zh-CN>保留 beforeParse 事件引用，以便在 processingComplete 察觉后续插件的源码改写。</zh-CN><en>Retain the beforeParse event reference so processingComplete can detect source rewrites by later plugins.</en></lang>
    const sourceEvent = { filename: file, source };
    inspect({ root, file, sourceFiles: new Map([[file, { filePath: file, source, sourceEvent }]]) });
  } finally {
    // <lang><zh-CN>删除前核实真实路径仍为系统临时目录的直属子目录。</zh-CN><en>Before removal, verify the real path remains a direct child of the system temporary directory.</en></lang>
    const actualRoot = fs.realpathSync.native(root);
    const actualTemp = fs.realpathSync.native(os.tmpdir());
    assert.equal(path.dirname(actualRoot), actualTemp);
    assert.match(path.basename(actualRoot), /^hia-jsdoc-map-/);
    fs.rmSync(actualRoot, { recursive: true, force: true });
  }
}

/**
 * @lang zh-CN 构造带真实语法节点范围的最小 doclet。
 * @lang en Creates a minimal doclet with a real syntax-node range.
 * @param {string} file 绝对源码路径。 / Absolute source path.
 * @param {string} name 符号名。 / Symbol name.
 * @param {[number,number]|null} range 解析器区间或虚拟节点空值。 / Parser range or null for a virtual node.
 * @returns {object} 可用于最终 integration 投影的 doclet。 / Doclet for final integration projection.
 */
function doclet(file, name, range) {
  return {
    kind: "function",
    name,
    longname: name,
    description: `${name} documentation`,
    meta: {
      path: path.dirname(file),
      filename: path.basename(file),
      range,
      code: range ? { node: { type: "FunctionDeclaration", range } } : {}
    }
  };
}

/**
 * @lang zh-CN 使用生产链相同的 integration 投影输入组装纯数据写入器请求。
 * @lang en Builds a pure writer request from the same integration projection as the production chain.
 * @param {object[]} doclets 文档节点。 / Doclets.
 * @param {object} fixture 临时源码记录。 / Temporary source record.
 * @returns {object} 写入器请求。 / Writer request.
 */
function request(doclets, fixture) {
  // <lang><zh-CN>复用正式 integration 投影，并提供其最小注册表和诊断状态。</zh-CN><en>Reuse the production integration projection with its minimal registries and diagnostic state.</en></lang>
  const state = {
    config: { metadataKey: "hia" },
    output: { diagnostics: [], diagnosticCounts: { error: 0, warning: 0, info: 0 } },
    registries: { localizationResources: [] }
  };
  return {
    integration: buildIntegrationOutput(state, doclets),
    doclets,
    sourceFiles: fixture.sourceFiles,
    sourceRoot: fixture.root
  };
}

test("actual AST range is one-based UTF-16 with an exclusive end", () => {
  // <lang><zh-CN>非 BMP 注释与 CRLF 检查偏移到行列的单位和端点。</zh-CN><en>A non-BMP comment and CRLF check offset-to-position units and boundaries.</en></lang>
  const source = "/*😀*/ function first(){}\r\nfunction second(){}";
  withSource(source, (fixture) => {
    const start = source.indexOf("function first");
    const end = start + "function first(){}".length;
    const map = buildJsdocDocSourceMap(request([doclet(fixture.file, "first", [start, end])], fixture));
    const ref = map.entries[0].sourceRefs[0];
    assert.equal(map.contractVersion, "1.1.0");
    assert.deepEqual(ref.range, { start: { line: 1, column: 8 }, end: { line: 1, column: 26 } });
    assert.deepEqual(ref.rangeConvention, { endBoundary: "exclusive", columnUnit: "utf16-code-unit" });
    assert.equal(map.entries[0].symbolId, "jsdoc:function:first");
    assert.equal(map.privacy.sourcesContentPolicy, "none");
    assert.equal(JSON.stringify(map).includes(source), false);
    assert.equal(JSON.stringify(map).includes(fixture.root), false);
  });
});

test("virtual selected doclet never borrows a same-name AST range", () => {
  withSource("function first(){}", (fixture) => {
    const actual = doclet(fixture.file, "first", [0, 18]);
    actual.description = "";
    const virtual = doclet(fixture.file, "first", null);
    virtual.description = "Rich virtual documentation";
    const map = buildJsdocDocSourceMap(request([actual, virtual], fixture));
    assert.equal(map.entries.length, 1);
    assert.equal(map.entries[0].symbolId, "jsdoc:function:first");
    assert.deepEqual(map.entries[0].sourceRefs, []);
  });
});

test("outside-root source and transformed in-memory text cannot claim exact positions", () => {
  withSource("function first(){}", (fixture) => {
    const outside = doclet(path.join(os.tmpdir(), "unrelated.js"), "outside", [0, 18]);
    const outsideMap = buildJsdocDocSourceMap(request([outside], fixture));
    assert.deepEqual(outsideMap.entries[0].sourceRefs, []);
    assert.equal(JSON.stringify(outsideMap).includes(os.tmpdir()), false);

    const transformed = new Map([[fixture.file, { filePath: fixture.file, source: "function second(){}" }]]);
    const changedMap = buildJsdocDocSourceMap({ ...request([doclet(fixture.file, "first", [0, 18])], fixture), sourceFiles: transformed });
    assert.deepEqual(changedMap.entries[0].sourceRefs, []);
  });
});

test("a later beforeParse rewrite cannot claim original-file AST precision", () => {
  withSource("function first(){}", (fixture) => {
    const record = fixture.sourceFiles.get(fixture.file);
    // <lang><zh-CN>模拟本插件捕获原文之后，另一插件改写同一事件对象供 JSDoc 解析。</zh-CN><en>Simulate another plugin rewriting the same event after this plugin captures the original text for JSDoc parsing.</en></lang>
    record.sourceEvent.source = "function other(){}";
    const map = buildJsdocDocSourceMap(request([doclet(fixture.file, "first", [0, 18])], fixture));
    assert.deepEqual(map.entries[0].sourceRefs, []);
  });
});

test("JSDoc pretreatment changes cannot be reported in original-file coordinates", () => {
  // <lang><zh-CN>JSDoc 4 的 parser 在 beforeParse 后另行处理 hashbang、压缩器注释与相邻注释。</zh-CN><en>JSDoc 4 pretreats hashbangs, minifier comments, and adjacent doclets after beforeParse.</en></lang>
  const sources = [
    "#!/usr/bin/env node\nfunction first(){}",
    "/*!* banner */ function first(){}",
    "/** A *//** B */ function first(){}"
  ];
  for (const source of sources) {
    withSource(source, (fixture) => {
      const start = source.indexOf("function first");
      const end = start + "function first(){}".length;
      const map = buildJsdocDocSourceMap(request([doclet(fixture.file, "first", [start, end])], fixture));
      assert.deepEqual(map.entries[0].sourceRefs, []);
    });
  }
});

test("non-JavaScript input cannot be labeled as an exact JavaScript AST source", () => {
  withSource("function first(){}", (fixture) => {
    const typedFile = path.join(fixture.root, "sample.ts");
    fs.writeFileSync(typedFile, "function first(){}", "utf8");
    const typedDoclet = doclet(typedFile, "first", [0, 18]);
    const requestWithTypedSource = {
      ...request([typedDoclet], fixture),
      sourceFiles: new Map([[typedFile, { filePath: typedFile, source: "function first(){}" }]])
    };
    const map = buildJsdocDocSourceMap(requestWithTypedSource);
    assert.deepEqual(map.entries[0].sourceRefs, []);
    assert.deepEqual(map.sources, []);
  });
});

test("unverified JSDoc parser versions keep identity without claiming exact ranges", () => {
  withSource("function first(){}", (fixture) => {
    const map = buildJsdocDocSourceMap({
      ...request([doclet(fixture.file, "first", [0, 18])], fixture),
      jsdocVersion: "4.0.4"
    });
    assert.equal(map.entries[0].symbolId, "jsdoc:function:first");
    assert.deepEqual(map.entries[0].sourceRefs, []);
  });
});

test("writer preflight rejects escaped paths and wrong integration identity", () => {
  withSource("function first(){}", (fixture) => {
    const integrationFile = path.join(fixture.root, "hia-integration.json");
    const mapFile = path.join(fixture.root, DOC_SOURCE_MAP_FILE);
    const map = buildJsdocDocSourceMap(request([doclet(fixture.file, "first", [0, 18])], fixture));
    fs.writeFileSync(integrationFile, "{}\n", "utf8");

    // <lang><zh-CN>写前必须拒绝从 builder 之后注入的越根路径与错误工件身份。</zh-CN><en>Preflight must reject traversal and mismatched artifact identity injected after the builder.</en></lang>
    const escaped = structuredClone(map);
    escaped.sources[0].path = "../secret.js";
    assert.throws(() => writeJsdocDocSourceMap(escaped, integrationFile), /preflight/);
    assert.equal(fs.existsSync(mapFile), false);
    const mismatched = structuredClone(map);
    mismatched.artifacts[0].path = "other-integration.json";
    assert.throws(() => writeJsdocDocSourceMap(mismatched, integrationFile), /preflight/);
    assert.equal(fs.existsSync(mapFile), false);
    const contaminated = structuredClone(map);
    contaminated.sources[0].sourcesContent = "private source text";
    assert.throws(() => writeJsdocDocSourceMap(contaminated, integrationFile), /preflight/);
    assert.equal(fs.existsSync(mapFile), false);

    // <lang><zh-CN>控制字符即使能被 URI 编码，也不得进入公开路径或来源身份。</zh-CN><en>Control characters must not enter public paths or source identities even when URI encoding accepts them.</en></lang>
    for (const control of ["\u0000", "\u001f", "\u007f"]) {
      const unsafe = structuredClone(map);
      unsafe.sources[0].path = `src/${control}hidden.js`;
      unsafe.sources[0].id = `source:${encodeURIComponent(unsafe.sources[0].path)}`;
      unsafe.entries[0].sourceRefs[0].sourceId = unsafe.sources[0].id;
      assert.throws(() => writeJsdocDocSourceMap(unsafe, integrationFile), /preflight/);
      assert.equal(fs.existsSync(mapFile), false);
    }

    assert.equal(writeJsdocDocSourceMap(map, integrationFile), mapFile);
    assert.equal(fs.existsSync(mapFile), true);
    clearJsdocDocSourceMap(integrationFile);
    assert.equal(fs.existsSync(mapFile), false);
  });
});

test("writer rejects an integration symlink whose real file is in another directory", (t) => {
  withSource("function first(){}", (fixture) => {
    // <lang><zh-CN>目标文件在另一真实目录中；只在系统允许符号链接时执行该边界例。</zh-CN><en>The target lives in another real directory; this boundary case runs where the system permits symlinks.</en></lang>
    const targetDir = path.join(fixture.root, "real-output");
    fs.mkdirSync(targetDir);
    const targetFile = path.join(targetDir, "target.json");
    fs.writeFileSync(targetFile, "{}\n", "utf8");
    const integrationFile = path.join(fixture.root, "hia-integration.json");
    try {
      fs.symlinkSync(targetFile, integrationFile, "file");
    } catch (error) {
      if (error.code === "EPERM" || error.code === "EACCES") {
        t.skip("File symlink creation is unavailable in this environment.");
        return;
      }
      throw error;
    }
    const map = buildJsdocDocSourceMap(request([doclet(fixture.file, "first", [0, 18])], fixture));
    assert.throws(() => writeJsdocDocSourceMap(map, integrationFile), /preflight/);
    assert.equal(fs.existsSync(path.join(fixture.root, DOC_SOURCE_MAP_FILE)), false);
  });
});

test("source-map opt-in requires a real integration output", () => {
  // <lang><zh-CN>禁用 integration 时地图既不生成，也留下固定可公开诊断。</zh-CN><en>Without integration, the map is not emitted and a fixed public-safe diagnostic remains.</en></lang>
  const system = plugin._hia.createPluginSystem({
    microPlugins: plugin._hia.builtInMicroPlugins,
    configOverrides: { integration: { enabled: false }, docSourceMap: { enabled: true } }
  });
  system.handle("processingComplete", { doclets: [] });
  assert.equal(system.getState().output.docSourceMapOutputFile, undefined);
  assert.ok(system.getState().diagnostics.list().some((entry) => entry.code === "HIA_DOC_SOURCE_MAP_REQUIRES_INTEGRATION"));
});

test("failed integration write does not leave a stale opt-in map", () => {
  withSource("function first(){}", (fixture) => {
    // <lang><zh-CN>将 integration 目标占为目录，可靠触发 Windows/Unix 写入失败。</zh-CN><en>Occupy the integration target with a directory to trigger a reliable write failure on Windows and Unix.</en></lang>
    const outputDir = path.join(fixture.root, "output");
    const integrationFile = path.join(outputDir, "hia-integration.json");
    const mapFile = path.join(outputDir, DOC_SOURCE_MAP_FILE);
    fs.mkdirSync(integrationFile, { recursive: true });
    fs.writeFileSync(mapFile, "stale", "utf8");
    const system = plugin._hia.createPluginSystem({
      microPlugins: plugin._hia.builtInMicroPlugins,
      configOverrides: {
        source: { basePath: fixture.root },
        integration: { enabled: true, outputFile: integrationFile },
        docSourceMap: { enabled: true }
      }
    });
    system.handle("processingComplete", { doclets: [] });
    assert.equal(fs.existsSync(mapFile), false);
    assert.equal(system.getState().output.docSourceMapOutputFile, undefined);
    assert.ok(system.getState().diagnostics.list().some((entry) => entry.code === "HIA_INTEGRATION_OUTPUT_WRITE_FAILED"));
  });
});

test("JSDoc CLI writes an opt-in sibling map without changing the default output", () => {
  withSource("/** Greets a visitor. */\nfunction greet(name) { return name; }\n", (fixture) => {
    // <lang><zh-CN>真实 hashbang 文件检验 JSDoc 预处理造成的范围降级。</zh-CN><en>A real hashbang file checks conservative range removal after JSDoc pretreatment.</en></lang>
    const scriptFile = path.join(fixture.root, "script.js");
    fs.writeFileSync(scriptFile, "#!/usr/bin/env node\n/** Starts a helper. */\nfunction launch() { return true; }\n", "utf8");
    /**
     * @lang zh-CN 用真实 JSDoc 解析、微插件顺序和 processingComplete 运行一次轻量工件构建。
     * @lang en Runs a small artifact build through the real JSDoc parser, micro-plugin order, and processingComplete event.
     * @param {boolean} enabled 是否启用独立映射。 / Whether the independent map is enabled.
     * @returns {{integrationFile:string,mapFile:string}} 同级工件路径。 / Sibling artifact paths.
     */
    function runJsdoc(enabled) {
      // <lang><zh-CN>两个运行使用独立输出目录，精确检查默认关闭。</zh-CN><en>Separate output directories make the default-off assertion exact.</en></lang>
      const outputDir = path.join(fixture.root, enabled ? "enabled" : "default");
      const integrationFile = path.join(outputDir, "hia-integration.json");
      const mapFile = path.join(outputDir, DOC_SOURCE_MAP_FILE);
      const configFile = path.join(fixture.root, enabled ? "enabled.json" : "default.json");
      // <lang><zh-CN>配置明确指定解析根与 integration 位置，避免依赖调用者工作目录。</zh-CN><en>The config fixes the parse root and integration path independently of caller cwd.</en></lang>
      const config = {
        plugins: [path.resolve(__dirname, "../src/index.cjs")],
        source: { include: [fixture.file, scriptFile] },
        opts: {
          destination: outputDir,
          hia: {
            source: { basePath: fixture.root },
            i18n: { enabled: false },
            integration: { enabled: true, outputFile: integrationFile },
            docSourceMap: { enabled }
          }
        }
      };
      fs.writeFileSync(configFile, JSON.stringify(config), "utf8");
      const result = spawnSync(process.execPath, [path.resolve(__dirname, "../node_modules/jsdoc/jsdoc.js"), "-c", configFile, "-X"], {
        cwd: fixture.root,
        encoding: "utf8",
        maxBuffer: 1024 * 1024
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(fs.existsSync(integrationFile), true);
      return { integrationFile, mapFile };
    }

    const baseline = runJsdoc(false);
    assert.equal(fs.existsSync(baseline.mapFile), false);
    const enabled = runJsdoc(true);
    assert.equal(fs.existsSync(enabled.mapFile), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(enabled.integrationFile, "utf8")), JSON.parse(fs.readFileSync(baseline.integrationFile, "utf8")));
    const map = JSON.parse(fs.readFileSync(enabled.mapFile, "utf8"));
    const greet = map.entries.find((entry) => entry.symbolId === "jsdoc:function:greet");
    assert.ok(greet);
    assert.equal(greet.sourceRefs.length, 1);
    assert.deepEqual(greet.sourceRefs[0].range, {
      start: { line: 2, column: 1 },
      end: { line: 2, column: "function greet(name) { return name; }".length + 1 }
    });
    assert.equal(greet.sourceRefs[0].rangeConvention.endBoundary, "exclusive");
    assert.equal(greet.sourceRefs[0].rangeConvention.columnUnit, "utf16-code-unit");
    const launch = map.entries.find((entry) => entry.symbolId === "jsdoc:function:launch");
    assert.ok(launch);
    assert.deepEqual(launch.sourceRefs, []);
    assert.equal(map.artifacts[0].path, "hia-integration.json");
    assert.equal(JSON.stringify(map).includes(fixture.root), false);
  });
});
