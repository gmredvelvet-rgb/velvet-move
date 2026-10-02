/**
 * Velvet Move — pre-flight checks.
 *
 *   node tests/run.mjs
 *
 * No dependencies, no build step, no running Foundry. Everything here catches
 * a class of mistake that this module has actually shipped: a bug you cannot
 * see by reading the diff, only by loading the world and clicking.
 *
 * Foundry never loads this folder.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  checkImports, checkActions, checkLocalization, checkTemplates, checkCssCollisions
} from "./checks/static.mjs";
import { checkSceneControls } from "./checks/scene-controls.mjs";
import { checkRenderers } from "./checks/renderers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Every .js under scripts/ must parse as an ES module. */
function checkSyntax() {
  const problems = [];
  const walk = (dir, out = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (entry.name.endsWith(".js")) out.push(full);
    }
    return out;
  };

  for (const file of walk(path.join(root, "scripts"))) {
    try {
      execFileSync(process.execPath, ["--input-type=module", "--check"], {
        input: fs.readFileSync(file, "utf8"),
        stdio: ["pipe", "pipe", "pipe"]
      });
    } catch (err) {
      const detail = String(err.stderr ?? err.message).split("\n").find(line => line.includes("Error")) ?? "";
      problems.push(`${path.relative(root, file).replace(/\\/g, "/")}: ${detail.trim()}`);
    }
  }
  return problems;
}

/** Manifest and language files must be valid JSON. */
function checkJson() {
  const problems = [];
  const files = ["module.json", ...fs.readdirSync(path.join(root, "lang")).map(f => `lang/${f}`)];
  for (const file of files) {
    try {
      JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
    } catch (err) {
      problems.push(`${file}: ${err.message}`);
    }
  }
  return problems;
}

const checks = [
  ["syntax", checkSyntax],
  ["json", checkJson],
  ["imports", checkImports],
  ["actions", checkActions],
  ["localization", checkLocalization],
  ["templates", checkTemplates],
  ["css collisions", checkCssCollisions],
  ["renderers", checkRenderers],
  ["scene controls", checkSceneControls],
  ["TaleSpire footsteps", () => {
    try {
      execFileSync(process.execPath, ["--test", "tests/talespire-footsteps.test.mjs"], { cwd: root, stdio: "pipe" });
      return [];
    } catch (error) {
      return [String(error.stdout ?? error.message)];
    }
  }],
  ["menu opening", () => {
    try {
      execFileSync(process.execPath, ["--test", "tests/menu-opening.test.mjs"], { cwd: root, stdio: "pipe" });
      return [];
    } catch (error) {
      return [String(error.stdout ?? error.message)];
    }
  }]
];

let failed = 0;
for (const [name, run] of checks) {
  const problems = await run();
  if (problems.length) {
    failed++;
    console.log(`FAIL  ${name}`);
    for (const problem of problems) console.log(`        ${problem}`);
  } else {
    console.log(`ok    ${name}`);
  }
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exitCode = failed ? 1 : 0;
