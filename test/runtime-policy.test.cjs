/**
 * @file
 * @lang zh-CN 核必要前端包的源/锁/CI运行声明，实际双Node和归档消费另行验收，不冒称已发布身份变化。
 * @lang en Checks source, lock and CI runtime declarations for required frontend packages; actual dual-Node and archive consumption remain separate, without claiming published identities changed.
 */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const os = require("node:os");

// <lang><zh-CN>本测试只读取自身仓库；范围来自已有workspace，不跨仓扫描。</zh-CN><en>Read this repository only, deriving scope from its existing workspace without cross-repository scanning.</en></lang>
const root = path.resolve(__dirname, "..");
const expected = "^22.23.4 || ^24.22.1";
/** @lang zh-CN 读取本仓受信JSON，无写入。 @lang en Reads trusted repository JSON without writes. */
const json = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));

/** @lang zh-CN 源清单与实际锁的根/工作区条目必须一致，不修改包版本。 @lang en Root/workspace source manifests and actual lock entries must agree, without changing package versions. */
test("required frontend manifests and lock entries declare the tested Node range", () => {
  const manifest = json("package.json");
  assert.equal(manifest.engines?.node, expected);
  const lock = json("package-lock.json");
  assert.equal(lock.packages[""]?.engines?.node, expected);
  if (manifest.workspaces?.includes("packages/*")) {
    for (const item of fs.readdirSync(path.join(root, "packages"), {withFileTypes: true})) {
      if (!item.isDirectory()) continue;
      const directory = `packages/${item.name}`;
      assert.equal(json(`${directory}/package.json`).engines?.node, expected);
      assert.equal(lock.packages[directory]?.engines?.node, expected);
    }
  }
});

/** @lang zh-CN CI用两平台两补丁，默认Node24，JSDoc开发版本有声明时精确锁定4.0.5；不扩大公开peer兼容承诺。 @lang en CI uses two platforms/two patches and defaults to Node24; declared JSDoc development versions pin 4.0.5 without expanding public peer compatibility claims. */
test("CI and local tooling select the supported runtime matrix", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  assert.match(workflow, /runs-on:\s*\$\{\{ matrix\.os \}\}/u);
  assert.match(workflow, /os:\s*\n\s*- ubuntu-latest\s*\n\s*- windows-latest/u);
  assert.match(workflow, /node:\s*\n\s*- 22\.23\.4\s*\n\s*- 24\.22\.1/u);
  assert.match(workflow, /run: npm ci/u);
  assert.match(fs.readFileSync(path.join(root, ".mise.toml"), "utf8"), /^node = "24\.22\.1"\s*$/mu);
  const jsdoc = json("package.json").devDependencies?.jsdoc;
  if (jsdoc !== undefined) assert.equal(jsdoc, "4.0.5");
});

/** @lang zh-CN 下限、其它major与预发布分别验证，不由Node26的新LTS状态扩大本项目承诺。 @lang en Tests floors, other majors and prereleases separately; Node26's LTS status never expands this project's promise automatically. */
test("runtime checks preserve explicit floors and reject unsupported versions", () => {
  const {supportsRuntime} = require("../scripts/check-runtime-policy.cjs");
  for (const value of ["18.20.0", "20.20.2", "22.23.3", "24.22.0", "25.0.0", "26.0.0", "24.22.1-rc.1", null]) assert.equal(supportsRuntime(value), false);
  for (const value of ["22.23.4", "22.24.0", "v24.22.1", "24.23.0"]) assert.equal(supportsRuntime(value), true);
});

/** @lang zh-CN 真实隔离fixture分别打破源/锁/CI/mise与JSDoc约束，检查器必须拒绝且不自动改写。 @lang en Real isolated fixtures independently break source, lock, CI, mise and JSDoc constraints; the checker must reject without rewriting them. */
test("release checker rejects drift in each owned runtime surface", () => {
  const {checkRuntimePolicy} = require("../scripts/check-runtime-policy.cjs");
  // <lang><zh-CN>目录为本测试唯一创建，只存合成清单；不会操作业务仓。</zh-CN><en>This test owns a unique directory holding synthetic manifests only, never business repositories.</en></lang>
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "hia-runtime-policy-"));
  const files = {
    "package.json": JSON.stringify({workspaces: ["packages/*"], engines: {node: expected}, devDependencies: {jsdoc: "4.0.5"}}),
    "packages/example/package.json": JSON.stringify({engines: {node: expected}}),
    "package-lock.json": JSON.stringify({packages: {"": {engines: {node: expected}}, "packages/example": {engines: {node: expected}}}}),
    ".mise.toml": '[tools]\nnode = "24.22.1"\n',
    ".github/workflows/ci.yml": 'runs-on: ${{ matrix.os }}\nos:\n  - ubuntu-latest\n  - windows-latest\nnode:\n  - 22.23.4\n  - 24.22.1\nrun: npm ci\n'
  };
  try {
    for (const [file, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(temporary, file)), {recursive: true});
      fs.writeFileSync(path.join(temporary, file), text);
    }
    assert.equal(checkRuntimePolicy(temporary), 2);
    for (const [file, text] of Object.entries(files)) {
      // <lang><zh-CN>每次只改一份文件且保留错误原文，证明检查不会静默修复输入。</zh-CN><en>Change one file at a time and retain its invalid bytes, proving checks never silently repair inputs.</en></lang>
      const changed = text.replaceAll("22.23.4", "20.20.2").replaceAll("24.22.1", "20.20.2");
      fs.writeFileSync(path.join(temporary, file), changed);
      assert.throws(() => checkRuntimePolicy(temporary));
      assert.equal(fs.readFileSync(path.join(temporary, file), "utf8"), changed);
      fs.writeFileSync(path.join(temporary, file), text);
    }
    const changed = files["package.json"].replace('"jsdoc":"4.0.5"', '"jsdoc":"^4.0.5"');
    fs.writeFileSync(path.join(temporary, "package.json"), changed);
    assert.throws(() => checkRuntimePolicy(temporary));
  } finally {
    // <lang><zh-CN>递归删除前核绝对父目录及本测试前缀，只清理本次创建的目录。</zh-CN><en>Verify the absolute parent and test prefix before recursively deleting only this invocation's directory.</en></lang>
    if (path.dirname(path.resolve(temporary)) !== path.resolve(os.tmpdir()) || !path.basename(temporary).startsWith("hia-runtime-policy-")) throw new Error("Unsafe fixture cleanup path.");
    fs.rmSync(temporary, {recursive: true, force: true});
  }
});
