// Nucleus build: copy public/ to dist/, minify and stamp a copyright banner on everything (v1.0.0).
// Run with `npm run build` (Netlify does this automatically; the site then publishes dist/).
//   - .js  (not /vendor/, not *.min.js): minified and mangled by terser  → slows casual copying
//   - .css (not *.min.css): minified by clean-css
//   - .html: whitespace and comments removed, inline <script>/<style> minified
//   - everything else (fonts, images, PDFs, docx, zips, vendor libs): copied unchanged
// Each file is handled on its own; if a minify ever fails, the original is copied so nothing breaks.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync } from "node:fs";
import { join, dirname, extname, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
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
  extractImages();
  addDock();
  stampVersions();
}
// Project sites carry their photos inside the page as base64 (Drift 2.3 MB, Clays 1.2 MB of a single file). Pulling
// them out into real image files makes the page a fraction of the size, lets the browser cache each image and load
// it only when it scrolls into view. On these two pages every embedded image is only ever shown (never exported),
// so <img src>, CSS url() and image strings in the page's data are all moved. Tools that build documents or exports
// from embedded images (SOW Builder, System Designer, Mocap Toolkit) are deliberately not on this list.
const EXTRACT = ["projects/drift/index.html", "projects/clays/index.html"];
function extractImages() {
  let files = 0, saved = 0;
  for (const rel of EXTRACT) {
    const abs = join(OUT, rel); let html;
    try { html = readFileSync(abs, "utf8"); } catch (e) { continue; }
    const dir = join(dirname(abs), "_img"); mkdirSync(dir, { recursive: true });
    const before = html.length;
    const put = (mime, b64) => {
      const ext = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg", "image/avif": "avif" }[mime.toLowerCase()];
      if (!ext || b64.length < 4000) return null; // small icons stay inline
      const buf = Buffer.from(b64, "base64"), name = createHash("sha1").update(buf).digest("hex").slice(0, 16) + "." + ext;
      writeFileSync(join(dir, name), buf); files++; return "_img/" + name;
    };
    html = html.replace(/<img\b([^>]*?)\ssrc=(["'])data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)\2([^>]*)>/gi, (m, pre, q, mime, b64, post) => {
      const u = put(mime, b64); if (!u) return m;
      const lazy = /\bloading=/i.test(pre + post) ? "" : ' loading="lazy" decoding="async"';
      return `<img${pre} src=${q}${u}${q}${post}${lazy}>`;
    });
    // image maps inside the page's data (e.g. IMG = { layout5: "data:…" }), used as <img src>; absolute so they work anywhere on the page
    const webBase = "/" + dirname(rel).split("\\").join("/") + "/";
    html = html.replace(/(["'])data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)\1/gi, (m, q, mime, b64) => { const u = put(mime, b64); return u ? q + webBase + u + q : m; });
    html = html.replace(/url\((["']?)data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)\1\)/gi, (m, q, mime, b64) => { const u = put(mime, b64); return u ? `url(${u})` : m; });
    writeFileSync(abs, html); saved += before - html.length;
  }
  console.log(`  moved ${files} embedded images out of project pages (${Math.round(saved / 1024)} KB lighter)`);
}

// The Nucleus dock (home, switch tool, Ask Claude) goes on every tool and project page, just before </body>.
// Pages that are public on purpose (the System Designer share viewer) don't get it.
function addDock() {
  const TAG = '<script src="/nucleus/dock.js" defer></script>';
  const SYNC = '<script src="/nucleus/sync.js"></script>';
  let n = 0;
  for (const abs of walk(OUT)) {
    const rel = relative(OUT, abs).split("\\").join("/");
    if (!/^(tools|projects)\/.+\.html$/.test(rel) || rel === "tools/system-designer/viewer.html") continue;
    let html = readFileSync(abs, "utf8");
    if (html.includes("/nucleus/dock.js")) continue;
    // sync first in <head>, so it sees every save the tool makes; the dock last in <body>
    const h = html.search(/<head[^>]*>/i);
    if (h >= 0) { const end = html.indexOf(">", h) + 1; html = html.slice(0, end) + SYNC + html.slice(end); }
    const i = html.toLowerCase().lastIndexOf("</body>");
    writeFileSync(abs, i >= 0 ? html.slice(0, i) + TAG + html.slice(i) : html + TAG); n++;
  }
  console.log(`  added the Nucleus dock to ${n} pages`);
}

// Cache-busting: every local .js/.css link in a page gets ?v=<hash of that file>, so browsers can keep
// scripts and styles for a day yet always fetch the new one after a deploy that changed it.
function stampVersions() {
  const hashes = new Map();
  const hashOf = (abs) => { if (!hashes.has(abs)) hashes.set(abs, createHash("sha1").update(readFileSync(abs)).digest("hex").slice(0, 10)); return hashes.get(abs); };
  let n = 0;
  for (const abs of walk(OUT)) {
    if (extname(abs).toLowerCase() !== ".html") continue;
    const html = readFileSync(abs, "utf8");
    const out = html.replace(/\b(src|href)=(["']?)([^"'\s>]+\.(?:js|css))(\2)/gi, (m, attr, q, url, q2) => {
      if (/^(?:[a-z]+:)?\/\//i.test(url) || url.startsWith("data:")) return m;
      const file = url.startsWith("/") ? join(OUT, url) : resolve(dirname(abs), url);
      if (!file.startsWith(OUT)) return m;
      try { statSync(file); } catch (e) { return m; }
      n++; return `${attr}=${q}${url}?v=${hashOf(file)}${q2}`;
    });
    if (out !== html) writeFileSync(abs, out);
  }
  console.log(`  versioned ${n} script and style links`);
}

build();
