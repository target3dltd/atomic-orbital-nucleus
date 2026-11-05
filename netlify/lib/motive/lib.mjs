import { sessionFrom } from "../session.mjs";
// Shared helpers for the Motive Upgrade Planner's Netlify functions.

export function env(name, fallback = "") {
  try { if (globalThis.Netlify && Netlify.env) { const v = Netlify.env.get(name); if (v != null && v !== "") return v; } } catch (e) {}
  const v = process.env[name];
  return v != null && v !== "" ? v : fallback;
}

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });
}

export function fail(status, code, message) { return json({ ok: false, code, message }, status); }

// Access control. Normally the whole site sits behind Netlify's own Visitor access password
// (Site configuration > Access & security), which Netlify enforces before any page or function runs.
// Optional extra layer: set SITE_PASSWORD (and optionally SITE_USERNAME) to also require HTTP Basic Auth on the API.
export function authorised(req) {
  const pass = env("SITE_PASSWORD");
  if (!pass) return true; // rely on Netlify Visitor access password protection
  const user = env("SITE_USERNAME");
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Basic\s+(.+)$/i);
  if (!m) return false;
  let decoded = "";
  try { decoded = Buffer.from(m[1], "base64").toString("utf8"); } catch (e) { return false; }
  const i = decoded.indexOf(":");
  const u = decoded.slice(0, i), p = decoded.slice(i + 1);
  return safeEqual(p, pass) && (!user || safeEqual(u, user));
}
function safeEqual(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
// Nucleus: every Motive API call needs a signed-in Nucleus session (Pipedrive token sealed in the cookie).
// The optional SITE_PASSWORD layer above still applies on top if set.
export async function guard(req) {
  if (!authorised(req)) return new Response("Authentication required", { status: 401, headers: { "www-authenticate": 'Basic realm="Motive Upgrade Planner", charset="UTF-8"', "cache-control": "no-store" } });
  let s = null;
  try { s = await sessionFrom(req); } catch (e) { return fail(503, "not_configured", e.message); }
  if (!s) return fail(401, "signed_out", "Sign in to the Nucleus with your Pipedrive API token first.");
  req.nucleus = s;
  return null;
}

// Storage: Netlify Blobs in production; an in-memory/file store when run locally for testing (MUP_LOCAL_STORE=path).
let storePromise = null;
export function getStoreSafe() {
  if (!storePromise) storePromise = (async () => {
    if (process.env.MUP_LOCAL_STORE) return localStore(process.env.MUP_LOCAL_STORE);
    const { getStore } = await import("../blobs.mjs");
    return getStore({ name: "motive-planner", consistency: "strong" });
  })();
  return storePromise;
}
function localStore(file) {
  const fs = awaitImportFs();
  const load = () => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return {}; } };
  const save = (o) => fs.writeFileSync(file, JSON.stringify(o));
  return {
    async getWithMetadata(key) { const o = load(); return o[key] ? { data: o[key].data, etag: o[key].etag, metadata: {} } : null; },
    async setJSON(key, value, opts = {}) {
      const o = load(); const cur = o[key];
      if (opts.onlyIfMatch && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified: false };
      if (opts.onlyIfNew && cur) return { modified: false };
      const etag = String(Date.now()) + Math.random().toString(36).slice(2, 6);
      o[key] = { data: value, etag }; save(o); return { modified: true, etag };
    },
  };
}
import * as fsMod from "node:fs";
function awaitImportFs() { return fsMod; }
