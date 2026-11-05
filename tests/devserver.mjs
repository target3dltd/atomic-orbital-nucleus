// Local test harness that behaves like Netlify for the Nucleus: static files from public/,
// the edge gate, v2 functions by their config.path, and legacy functions at /.netlify/functions/<name>.
// With MOCK_PD=1, Pipedrive is replaced by a small fake (tests/fakepd.mjs).
//   NUCLEUS_SECRET=dev-secret-1234567890 MOCK_PD=1 node tests/devserver.mjs 8888
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.argv[2] || 8888);
process.env.NUCLEUS_LOCAL_STORE ||= path.join(root, "tests", ".store.json");
process.env.MUP_LOCAL_STORE ||= path.join(root, "tests", ".motive-store.json");
if (process.env.MOCK_PD) { const { installFakePipedrive } = await import("./fakepd.mjs"); installFakePipedrive(); }

const fnDir = path.join(root, "netlify", "functions");
const v2 = [], legacy = {};
for (const f of fs.readdirSync(fnDir)) {
  const mod = await import(pathToFileURL(path.join(fnDir, f)).href);
  const name = f.replace(/\.m?js$/, "");
  if (mod.handler) legacy[name] = mod.handler;
  if (mod.default && mod.config && mod.config.path) for (const p of [].concat(mod.config.path)) v2.push([p, mod.default]);
}
const gate = await import(pathToFileURL(path.join(root, "netlify", "edge-functions", "gate.js")).href);
const glob = (pat, p) => new RegExp("^" + pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$").test(p);

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff": "font/woff", ".json": "application/json", ".ico": "image/x-icon", ".txt": "text/plain", ".md": "text/plain" };

function readBody(req) { return new Promise((res) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => res(Buffer.concat(c))); }); }
async function send(res, response) {
  const headers = {}; response.headers.forEach((v, k) => { headers[k] = v; });
  res.writeHead(response.status, headers); res.end(Buffer.from(await response.arrayBuffer()));
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readBody(req);
    const request = new Request(url, { method: req.method, headers: req.headers, body });

    for (const [p, fn] of v2) if (glob(p, url.pathname)) return send(res, await fn(request, {}));
    const lm = url.pathname.match(/^\/\.netlify\/functions\/([a-z0-9-]+)$/);
    if (lm && legacy[lm[1]]) {
      const r = await legacy[lm[1]]({ httpMethod: req.method, headers: req.headers, queryStringParameters: Object.fromEntries(url.searchParams), body: body ? body.toString() : null });
      res.writeHead(r.statusCode, r.headers || {}); return res.end(r.body);
    }

    const gc = gate.config;
    if (gc.path.some((p) => glob(p, url.pathname)) && !(gc.excludedPath || []).some((p) => glob(p, url.pathname))) {
      const r = await gate.default(request, { next: () => null });
      if (r) return send(res, r);
    }

    const pubDir = path.join(root, process.env.NUCLEUS_PUBLIC_DIR || "public");
    let file = path.join(pubDir, decodeURIComponent(url.pathname));
    if (!file.startsWith(pubDir)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("Not found"); }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "x-frame-options": "SAMEORIGIN" });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e); res.writeHead(500); res.end(String(e));
  }
}).listen(port, () => console.log(`Nucleus dev harness on http://localhost:${port}`));
