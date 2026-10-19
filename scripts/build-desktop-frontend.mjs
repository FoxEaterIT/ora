import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "src-tauri/index.html");
const output = resolve(root, "src-tauri/frontend-dist");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const tauriConfig = JSON.parse(await readFile(resolve(root, "src-tauri/tauri.conf.json"), "utf8"));

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
let html = await readFile(source, "utf8");
const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/gi)];
const scripts = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/gi)];
if (styles.length !== 1 || scripts.length !== 1) {
  throw new Error("Expected exactly one inline style block and module script block in the desktop frontend.");
}
const css = styles[0][1];
const js = scripts[0][1];
const bundle = await build({
  stdin: { contents: js, resolveDir: resolve(root, "src-tauri"), sourcefile: "desktop-entry.js", loader: "js" },
  bundle: true,
  format: "iife",
  write: false,
  platform: "browser",
  target: "es2022",
});
const script = `(()=>{const invoke=(command,args)=>window.__TAURI_INTERNALS__.invoke(command,args);${bundle.outputFiles[0].text}\n})();`;
const cssHash = createHash("sha256").update(css).digest("base64");
const jsHash = createHash("sha256").update(script).digest("base64");
html = html
  .replace(styles[0][0], `<style>${css}</style>`)
  .replace(scripts[0][0], `<script>${script}</script>`);
const csp = `default-src 'self'; connect-src 'self' http: https:; img-src 'self' data: https:; style-src 'self' 'sha256-${cssHash}'; script-src 'self' 'sha256-${jsHash}'`;
html = html.replace("</head>", `<meta http-equiv="Content-Security-Policy" content="${csp}"></head>`);
const htmlFile = `index-${createHash("sha256").update(html).digest("hex").slice(0, 12)}.html`;
await writeFile(resolve(output, htmlFile), html, "utf8");
await writeFile(resolve(output, "index.html"), `<!doctype html><meta http-equiv="refresh" content="0; url=${htmlFile}">`, "utf8");
await cp(resolve(root, "src-tauri/icons/icon.ico"), resolve(output, "favicon.ico"));
await writeFile(
  resolve(output, "build-info.json"),
  `${JSON.stringify({ appVersion: tauriConfig.version, frontendVersion: packageJson.version }, null, 2)}\n`,
  "utf8",
);
