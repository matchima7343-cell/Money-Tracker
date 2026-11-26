import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(__dirname, "src/app.js");
const OUT_FILE = path.resolve(__dirname, "dist/app.bundle.js");

const visited = new Set();
const modules = [];

function toModuleId(absPath) {
  return path.relative(__dirname, absPath).replace(/\\/g, "/");
}

function transformModule(absPath) {
  if (visited.has(absPath)) return;
  visited.add(absPath);

  let code = fs.readFileSync(absPath, "utf8");
  const dir = path.dirname(absPath);
  const deps = [];

  // Transform static ES imports (handles multiline { ... } imports)
  code = code.replace(
    /^\s*import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']\s*;?/gm,
    (_, spec, rel) => {
      const target = path.resolve(dir, rel);
      deps.push(target);
      const modId = toModuleId(target);
      const trimmed = spec.trim();

      if (trimmed.startsWith("*")) {
        const alias = trimmed.replace(/^\*\s+as\s+/, "").trim();
        return `const ${alias} = __require("${modId}");`;
      }
      if (trimmed.startsWith("{")) {
        const inner = trimmed
          .slice(1, -1)
          .replace(/\s+as\s+/g, ": ");
        return `const {${inner}} = __require("${modId}");`;
      }
      return `const ${trimmed} = __require("${modId}").default;`;
    }
  );

  // Transform side-effect imports
  code = code.replace(/^\s*import\s+["']([^"']+)["']\s*;?/gm, (_, rel) => {
    const target = path.resolve(dir, rel);
    deps.push(target);
    return `__require("${toModuleId(target)}");`;
  });

  // Visit dependencies first (post-order)
  for (const dep of deps) {
    transformModule(dep);
  }

  const exportedNames = [];

  // export async function name
  code = code.replace(/^export\s+async\s+function\s+([A-Za-z_$][\w$]*)/gm, (_, name) => {
    exportedNames.push(name);
    return `async function ${name}`;
  });

  // export function name
  code = code.replace(/^export\s+function\s+([A-Za-z_$][\w$]*)/gm, (_, name) => {
    exportedNames.push(name);
    return `function ${name}`;
  });

  // export const/let/var name
  code = code.replace(/^export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/gm, (_, kind, name) => {
    exportedNames.push(name);
    return `${kind} ${name}`;
  });

  // export { a, b as c }
  code = code.replace(/^export\s*\{([^}]+)\}\s*;?/gm, (_, list) => {
    const assigns = list
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const parts = item.split(/\s+as\s+/);
        const local = parts[0].trim();
        const ext = (parts[1] || parts[0]).trim();
        return `exports.${ext} = ${local};`;
      });
    return assigns.join("\n");
  });

  const exportFooter = exportedNames.map((n) => `exports.${n} = ${n};`).join("\n");
  modules.push({
    id: toModuleId(absPath),
    code: `${code}\n${exportFooter}`
  });
}

transformModule(ENTRY);

const bundleParts = [
  "// Auto-generated classic browser bundle from src/app.js for file:// and http:// compatibility.",
  "(function () {",
  '  "use strict";',
  "  const __factories = {",
  ...modules.map(
    (m) => `    ${JSON.stringify(m.id)}: function (exports, __require) {\n${m.code}\n    },`
  ),
  "  };",
  "  const __cache = {};",
  "  function __require(id) {",
  "    if (__cache[id]) return __cache[id].exports;",
  "    const mod = { exports: {} };",
  "    __cache[id] = mod;",
  "    const fn = __factories[id];",
  '    if (!fn) throw new Error("Missing bundled module: " + id);',
  "    fn(mod.exports, __require);",
  "    return mod.exports;",
  "  }",
  `  __require(${JSON.stringify(toModuleId(ENTRY))});`,
  "})();"
];

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, bundleParts.join("\n"), "utf8");
console.log(`Built ${toModuleId(OUT_FILE)} (${modules.length} modules, ${fs.statSync(OUT_FILE).size} bytes)`);
