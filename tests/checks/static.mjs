/**
 * Static checks over the module's sources.
 *
 * None of these need a browser or a running Foundry, and each one exists
 * because the matching mistake has actually shipped at least once:
 *
 * - an import naming an export that was renamed or removed
 * - a `data-action` in a template with no handler behind it
 * - a localization key used in code but missing from a language file
 * - a Handlebars or HTML block left unclosed
 * - a CSS class shared with another installed module, whose stylesheet is
 *   loaded world-wide and will happily restyle ours
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const modulesDir = path.resolve(root, "..");

function walk(dir, filter, out = [], depth = 0) {
  if (depth > 6) return out;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".git", "packs", "tests"].includes(entry.name)) continue;
      walk(full, filter, out, depth + 1);
    } else if (filter(entry.name)) out.push(full);
  }
  return out;
}

const scripts = walk(path.join(root, "scripts"), name => name.endsWith(".js"));
const templates = walk(path.join(root, "templates"), name => name.endsWith(".hbs"));
const rel = file => path.relative(root, file).replace(/\\/g, "/");

/* -------------------------------------------- */

export function checkImports() {
  const problems = [];
  const exportsOf = new Map();

  for (const file of scripts) {
    const src = fs.readFileSync(file, "utf8");
    const names = new Set();
    for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
      names.add(m[1]);
    }
    for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
      for (const part of m[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/).pop().trim();
        if (name) names.add(name);
      }
    }
    if (/export\s+default/.test(src)) names.add("default");
    exportsOf.set(path.resolve(file), names);
  }

  for (const file of scripts) {
    const src = fs.readFileSync(file, "utf8");

    for (const m of src.matchAll(/import\s+(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
      const [, named, spec] = m;
      if (!spec.startsWith(".")) continue;
      const target = path.resolve(path.dirname(file), spec);
      if (!fs.existsSync(target)) {
        problems.push(`${rel(file)} imports a module that does not exist: ${spec}`);
        continue;
      }
      const available = exportsOf.get(target) ?? new Set();
      for (const part of named.split(",")) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (name && !available.has(name)) {
          problems.push(`${rel(file)} imports "${name}" from ${spec}, which does not export it`);
        }
      }
    }

    for (const m of src.matchAll(/import\s+(?:\*\s+as\s+[\w$]+|[A-Za-z_$][\w$]*)\s+from\s*["'](\.[^"']+)["']/g)) {
      const target = path.resolve(path.dirname(file), m[1]);
      if (!fs.existsSync(target)) problems.push(`${rel(file)} imports a module that does not exist: ${m[1]}`);
    }
  }
  return problems;
}

/* -------------------------------------------- */

export function checkActions() {
  const problems = [];
  const menu = fs.readFileSync(path.join(root, "scripts/apps/menu.js"), "utf8");
  const start = menu.indexOf("actions: {");
  if (start === -1) return ["scripts/apps/menu.js declares no actions block"];

  const block = menu.slice(start, menu.indexOf("};", start));
  const declared = new Set([...block.matchAll(/^\s{6}([A-Za-z][\w]*)\s*:/gm)].map(m => m[1]));

  for (const template of templates) {
    const src = fs.readFileSync(template, "utf8");
    for (const m of src.matchAll(/data-action="([^"]+)"/g)) {
      if (!declared.has(m[1])) problems.push(`${rel(template)} uses data-action="${m[1]}" with no handler`);
    }
  }
  for (const action of declared) {
    const used = templates.some(t => fs.readFileSync(t, "utf8").includes(`data-action="${action}"`));
    if (!used) problems.push(`action "${action}" is declared but no template calls it`);
  }
  return problems;
}

/* -------------------------------------------- */

export function checkLocalization() {
  const problems = [];
  const langs = {};
  for (const file of fs.readdirSync(path.join(root, "lang"))) {
    if (file.endsWith(".json")) {
      langs[file] = JSON.parse(fs.readFileSync(path.join(root, "lang", file), "utf8"));
    }
  }

  const used = new Set();
  for (const file of [...scripts, ...templates]) {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/["'](VELVETMOVE\.[\w.]+)["']/g)) used.add(m[1]);
    // Keys built by interpolation cannot be checked; flag the template form so
    // the omission is at least visible.
    for (const m of src.matchAll(/`(VELVETMOVE\.[\w.]*)\$\{/g)) used.add(`${m[1]}*`);
  }

  for (const key of [...used].sort()) {
    if (key.endsWith("*")) continue;
    for (const [file, entries] of Object.entries(langs)) {
      if (!(key in entries)) problems.push(`${key} is missing from lang/${file}`);
    }
  }

  const [first, ...rest] = Object.entries(langs);
  if (first) {
    for (const [file, entries] of rest) {
      for (const key of Object.keys(first[1])) {
        if (!(key in entries)) problems.push(`${key} is in lang/${first[0]} but not lang/${file}`);
      }
    }
  }
  return problems;
}

/* -------------------------------------------- */

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr"]);

export function checkTemplates() {
  const problems = [];

  for (const file of templates) {
    const src = fs.readFileSync(file, "utf8");

    const blocks = [];
    for (const m of src.matchAll(/\{\{([#/])([a-zA-Z_$][\w.$-]*)/g)) {
      const [, kind, name] = m;
      const line = src.slice(0, m.index).split("\n").length;
      if (kind === "#") blocks.push({ name, line });
      else {
        const open = blocks.pop();
        if (!open) problems.push(`${rel(file)}:${line} {{/${name}}} closes nothing`);
        else if (open.name !== name) {
          problems.push(`${rel(file)}:${line} {{/${name}}} closes {{#${open.name}}} from line ${open.line}`);
        }
      }
    }
    for (const open of blocks) problems.push(`${rel(file)}:${open.line} {{#${open.name}}} is never closed`);

    // Strip handlebars so attribute values full of braces do not confuse the
    // tag scanner, then check element nesting. A stray tag makes the browser
    // re-parent elements, which is how a list ends up outside its section.
    const html = src.replace(/\{\{![\s\S]*?\}\}/g, "").replace(/\{\{[\s\S]*?\}\}/g, "X");
    const tags = [];
    for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
      const [, closing, rawName, , selfClose] = m;
      const name = rawName.toLowerCase();
      const line = html.slice(0, m.index).split("\n").length;
      if (VOID_TAGS.has(name) || selfClose) continue;
      if (!closing) tags.push({ name, line });
      else {
        const open = tags.pop();
        if (!open) problems.push(`${rel(file)}:${line} </${name}> closes nothing`);
        else if (open.name !== name) {
          problems.push(`${rel(file)}:${line} </${name}> closes <${open.name}> from line ${open.line}`);
        }
      }
    }
    for (const open of tags) problems.push(`${rel(file)}:${open.line} <${open.name}> is never closed`);

    // HandlebarsApplicationMixin#parsePartHTML throws unless a part renders
    // exactly one root element.
    const roots = html.replace(/<!--[\s\S]*?-->/g, "").trim();
    let depth = 0;
    let topLevel = 0;
    for (const m of roots.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
      const [, closing, rawName, , selfClose] = m;
      if (VOID_TAGS.has(rawName.toLowerCase()) || selfClose) continue;
      if (!closing) {
        if (depth === 0) topLevel++;
        depth++;
      } else depth--;
    }
    if (topLevel !== 1) {
      problems.push(`${rel(file)} renders ${topLevel} root elements; a template part must render exactly 1`);
    }
  }
  return problems;
}

/* -------------------------------------------- */

export function checkCssCollisions() {
  const problems = [];

  const classesIn = files => {
    const found = new Set();
    for (const file of files) {
      for (const m of fs.readFileSync(file, "utf8").matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) found.add(m[1]);
    }
    return found;
  };

  const ours = classesIn(walk(path.join(root, "styles"), name => name.endsWith(".css")));
  // Only our own namespaced classes are our problem; the shared Foundry ones
  // (window-content, notes…) are meant to be shared.
  const namespaced = [...ours].filter(c => c.startsWith("vmove-") || c.startsWith("velvet-move"));

  let others = 0;
  for (const entry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === path.basename(root)) continue;
    const files = walk(path.join(modulesDir, entry.name), name => name.endsWith(".css"), [], 3);
    if (!files.length) continue;
    others++;
    const theirs = classesIn(files);
    for (const cls of namespaced) {
      if (theirs.has(cls)) problems.push(`.${cls} is also defined by ${entry.name}`);
    }
  }

  if (!others) problems.push("no other modules were scanned — is this module inside a Foundry modules folder?");
  return problems;
}
