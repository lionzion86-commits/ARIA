/* ============================================================
   LIFT NAMED DECLARATIONS OUT OF index.html.

   index.html is a plain <script>, not a module, so its functions cannot
   be imported. This finds `function NAME(` / `const NAME =` / `let NAME =`
   declarations that start a line, cuts each one out whole (brace- and
   string-aware), and evaluates them together in a fresh context -- the
   real code, not a copy of it. Missing names are skipped when listed in
   `optional`, so the same list runs against an older index.html.
   ============================================================ */
import vm from "node:vm";

function cutDeclaration(src, start) {
  let i = start, depth = 0, seenBody = false;
  const isFn = /^(?:async\s+)?function\b/.test(src.slice(start, start + 20));
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); if (i < 0) break; continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i + 2) + 1; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      for (i++; i < src.length && src[i] !== q; i++) if (src[i] === "\\") i++;
      continue;
    }
    /* A regex literal: after an operator-ish character, skip to its end. */
    if (c === "/") {
      let k = i - 1; while (k > start && /\s/.test(src[k])) k--;
      if (/[=(,:!&|?;{}\[]/.test(src[k]) || src.slice(k - 5, k + 1).endsWith("return")) {
        let inClass = false;
        for (i++; i < src.length; i++) {
          if (src[i] === "\\") { i++; continue; }
          if (src[i] === "[") inClass = true;
          else if (src[i] === "]") inClass = false;
          else if (src[i] === "/" && !inClass) break;
        }
        continue;
      }
    }
    if (c === "{" || c === "(" || c === "[") { depth++; if (c === "{") seenBody = true; }
    else if (c === "}" || c === ")" || c === "]") {
      depth--;
      if (isFn && depth === 0 && c === "}" && seenBody) return src.slice(start, i + 1);
    } else if (!isFn && c === ";" && depth === 0) return src.slice(start, i + 1);
  }
  throw new Error("unterminated declaration at " + start);
}

export function liftDeclarations(html, names, { optional = [], extra = "" } = {}) {
  const src = html.replace(/\r\n/g, "\n");
  const parts = [];
  for (const name of names) {
    const re = new RegExp(`^(?:async\\s+)?function\\s+${name}\\s*\\(|^(?:const|let|var)\\s+${name}\\s*=`, "m");
    const m = re.exec(src);
    if (!m) {
      if (optional.includes(name)) continue;
      throw new Error(`${name} is not declared in index.html`);
    }
    parts.push(cutDeclaration(src, m.index));
  }
  const exportsLine = "\n;globalThis.__lifted = {" + names.map(n => `${n}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(", ") + "};";
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(extra + "\n" + parts.join("\n") + exportsLine, sandbox, { filename: "index.html#lifted" });
  return sandbox.__lifted;
}

/* The same declarations as source text, in the order given -- for
   build scripts that ship a slice of the page as its own file. */
export function extractDeclarations(html, names) {
  const src = html.replace(/\r\n/g, "\n");
  return names.map((name) => {
    const re = new RegExp(`^(?:async\\s+)?function\\s+${name}\\s*\\(|^(?:const|let|var)\\s+${name}\\s*=`, "m");
    const m = re.exec(src);
    if (!m) throw new Error(`${name} is not declared in index.html`);
    return cutDeclaration(src, m.index);
  }).join("\n");
}
