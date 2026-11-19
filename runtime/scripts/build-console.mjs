// Build the browser console's script from the runtime's own TypeScript (one implementation of the gates, agents
// and workflows for the server and the console). Output: console/qottuf-console.js, a single IIFE exposing
// window.QottufConsole. Run: npm run build:console
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = await build({
  entryPoints: [path.join(root, "src/console/bundle.ts")],
  outfile: path.join(root, "console/qottuf-console.js"),
  bundle: true,
  format: "iife",
  globalName: "QottufConsole",
  platform: "browser",
  target: "es2022",
  minify: true,
  legalComments: "none",
  metafile: true,
  logLevel: "warning",
  banner: { js: "/* Qottuf BD console: gates, agents and workflows, built from runtime/src. Do not edit; run npm run build:console. */" },
});
const bytes = Object.values(result.metafile.outputs)[0].bytes;
console.log(`console/qottuf-console.js: ${(bytes / 1024).toFixed(0)} KB`);
