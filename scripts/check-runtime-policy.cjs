/**
 * @file
 * @lang zh-CN 只读核本仓运行/锁/CI基线；版本声明不是产品兼容、实际归档或npm发行证明。
 * @lang en Read-only runtime, lock and CI baseline checks; declarations do not prove product compatibility, real archives or npm publication.
 */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * @lang zh-CN 判断正式版进程是否位于已确认两条运行线的实测下限内，不自动接受其它LTS或预发布。
 * @lang en Checks a release process against tested floors on the two confirmed runtime lines, without automatically accepting other LTS lines or prereleases.
 * @param {string} version <lang><zh-CN>Node完整三段版本，可带v前缀。</zh-CN><en>Full three-part Node version, optionally prefixed with v.</en></lang>
 * @returns {boolean} <lang><zh-CN>支持范围内为真，无I/O。</zh-CN><en>True within the supported range, without I/O.</en></lang>
 */
function supportsRuntime(version) {
  // <lang><zh-CN>只解析实际Node格式，不做任意SemVer范围解析或字符串强制转换。</zh-CN><en>Parse actual Node versions only, without arbitrary SemVer ranges or string coercion.</en></lang>
  const match = typeof version === "string" && /^v?(\d+)\.(\d+)\.(\d+)$/u.exec(version);
  if (!match) return false;
  const [major, minor, patch] = match.slice(1).map(Number);
  return major === 22 ? minor > 23 || minor === 23 && patch >= 4
    : major === 24 && (minor > 22 || minor === 22 && patch >= 1);
}

/**
 * @lang zh-CN 校验受信仓库根/已有工作区的清单、锁、mise和本仓固定CI形态；只读，不查询registry或执行包。
 * @lang en Checks manifests, locks, mise and this repository's fixed CI layout in a trusted repository/workspace, read-only without registry queries or package execution.
 * @param {string} root <lang><zh-CN>受信仓库根；fixture可使用本测试创建的隔离目录。</zh-CN><en>Trusted repository root, or an isolated fixture directory owned by the test.</en></lang>
 * @returns {number} <lang><zh-CN>核过的清单数（含根），不是稳定包数量。</zh-CN><en>Checked manifest count, including root, not a stable-package count.</en></lang>
 * @throws {Error} <lang><zh-CN>缺文件、损坏JSON或基线漂移即停止，不重写输入。</zh-CN><en>Stops on missing files, malformed JSON or baseline drift without rewriting inputs.</en></lang>
 */
function checkRuntimePolicy(root) {
  // <lang><zh-CN>根与锁从同一受信目录读取，不跨仓推断或升级依赖。</zh-CN><en>Read root and lock from the same trusted directory without cross-repository inference or dependency upgrades.</en></lang>
  const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
  const range = "^22.23.4 || ^24.22.1";
  const manifest = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));
  const owned = [["", manifest]];
  if (manifest.workspaces?.includes("packages/*")) {
    for (const entry of fs.readdirSync(path.join(root, "packages"), {withFileTypes: true})) {
      if (entry.isDirectory()) owned.push([`packages/${entry.name}`, JSON.parse(read(`packages/${entry.name}/package.json`))]);
    }
  }
  // <lang><zh-CN>只核本仓owner锁条目，既有registry依赖的历史engine声明不能被改写。</zh-CN><en>Check owned lock entries only; never rewrite historical engine declarations on registry dependencies.</en></lang>
  for (const [directory, entry] of owned) {
    assert.equal(entry.engines?.node, range, "Owned source engine policy drifted.");
    assert.equal(lock.packages[directory]?.engines?.node, range, "Owned lock engine policy drifted.");
    if (entry.devDependencies?.jsdoc !== undefined) assert.equal(entry.devDependencies.jsdoc, "4.0.5", "Tested JSDoc version drifted.");
  }
  // <lang><zh-CN>匹配本仓明确的四组合CI，不宣称实现通用YAML校验器；真实平台结果须另核Actions。</zh-CN><en>Match this repository's explicit four-cell CI, not a general YAML validator; actual platform results require separate Actions evidence.</en></lang>
  const ci = read(".github/workflows/ci.yml");
  assert.match(ci, /runs-on:\s*\$\{\{ matrix\.os \}\}/u, "CI operating-system selector drifted.");
  assert.match(ci, /os:\s*\n\s*- ubuntu-latest\s*\n\s*- windows-latest/u, "CI platform matrix drifted.");
  assert.match(ci, /node:\s*\n\s*- 22\.23\.4\s*\n\s*- 24\.22\.1/u, "CI runtime matrix drifted.");
  assert.match(ci, /run: npm ci/u, "CI must use the committed lock.");
  assert.match(read(".mise.toml"), /^node = "24\.22\.1"\s*$/mu, "Local Node selection drifted.");
  return owned.length;
}

module.exports = {checkRuntimePolicy, supportsRuntime};
// <lang><zh-CN>直接执行时同时拒绝不支持的当前进程；测试import只提供无副作用的函数。</zh-CN><en>Direct invocation also rejects unsupported current processes; test imports expose functions without side effects.</en></lang>
if (require.main === module) {
  assert.ok(supportsRuntime(process.versions.node), "Release checks require the supported Node.js 22/24 floors.");
  console.log(`Runtime policy passed: ${checkRuntimePolicy(path.resolve(__dirname, ".."))} owned manifests; declaration check only.`);
}
