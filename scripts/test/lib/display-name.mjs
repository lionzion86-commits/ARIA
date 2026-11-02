/* /display-name.js in a sandbox: the one display rule every surface calls. */
import vm from "node:vm";
import { readFileSync } from "node:fs";
export function loadDisplayName(root) {
  const ctx = { };
  vm.runInNewContext(readFileSync(root + "display-name.js", "utf8"), ctx);
  return ctx.AriaDisplayName;
}
