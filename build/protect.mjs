// Nucleus build: copy public/ to dist/, minify and stamp a copyright banner on everything (v1.0.0).
// Run with `npm run build` (Netlify does this automatically; the site then publishes dist/).
//   - .js  (not /vendor/, not *.min.js): minified and mangled by terser  → slows casual copying
//   - .css (not *.min.css): minified by clean-css
//   - .html: whitespace and comments removed, inline <script>/<style> minified
//   - everything else (fonts, images, PDFs, docx, zips, vendor libs): copied unchanged
// Each file is handled on its own; if a minify ever fails, the original is copied so nothing breaks.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync } from "node:fs";
import { join, dirname, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { minify as terser } from "terser";
import { minify as htmlmin } from "html-minifier-terser";
import CleanCSS from "clean-css";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "public"), OUT = join(root, "dist");
const BANNER = "© 2026 Ashley Keeler. All rights reserved. Unauthorised copying, redistribution or reuse of this code is prohibited.";
const JS_BANNER = `/*! ${BANNER} */\n`;
const cleancss = new CleanCSS({ level: 2, returnPromise: true });

const skipJs = (p) => p.includes("/vendor/") || p.endsWith(".min.js");
const skipCss = (p) => p.endsWith(".min.css");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out;
}

let min = 0, copied = 0, failed = 0;
async function build() {
  rmSync(OUT, { recursive: true, force: true });
  for (const abs of walk(SRC)) {
    const rel = relative(SRC, abs), dst = join(OUT, rel), ext = extname(abs).toLowerCase();
    mkdirSync(dirname(dst), { recursive: true });
    try {
      if (ext === ".js" && !skipJs(abs)) {
        const r = await terser(readFileSync(abs, "utf8"), { format: { comments: false, preamble: JS_BANNER.trim() }, mangle: true, compress: true });
        writeFileSync(dst, r.code); min++;
      } else if (ext === ".css" && !skipCss(abs)) {
        const r = await cleancss.minify(readFileSync(abs, "utf8"));
        writeFileSync(dst, JS_BANNER + r.styles); min++;
      } else if (ext === ".html") {
        const out = await htmlmin(readFileSync(abs, "utf8"), {
          collapseWhitespace: true, removeComments: true, minifyCSS: true,
          minifyJS: { mangle: true, compress: true }, ignoreCustomComments: [], removeAttributeQuotes: false,
        });
        writeFileSync(dst, "<!-- " + BANNER + " -->\n" + out); min++;
      } else {
        copyFileSync(abs, dst); copied++;
      }
    } catch (e) {
      copyFileSync(abs, dst); failed++;
      console.warn("  kept original (minify failed):", rel, "—", String(e && e.message || e).slice(0, 120));
    }
  }
  console.log(`Nucleus build → dist/ : ${min} minified, ${copied} copied${failed ? ", " + failed + " kept as-is" : ""}.`);
}
build();
