// Shared campaign state (sales owner, stage, notes), system names/assignments and email templates.
// One JSON blob per collection; writes are read-modify-write with an ETag check so simultaneous edits don't overwrite each other.
import { guard, json, fail, getStoreSafe } from "../lib/motive/lib.mjs";

const COLLECTIONS = new Set(["campaign", "systems", "templates", "meta"]);
const MAX_DOC = 20000;       // bytes per document
const MAX_DOCS = 5000;       // documents per collection

export default async (req) => {
  const g = await guard(req); if (g) return g;
  const store = await getStoreSafe();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const names = (url.searchParams.get("collections") || [...COLLECTIONS].join(",")).split(",").filter((n) => COLLECTIONS.has(n));
    const out = {};
    for (const n of names) { const r = await store.getWithMetadata("col:" + n, { type: "json" }); out[n] = (r && r.data && r.data.docs) || {}; }
    return json({ ok: true, collections: out, at: new Date().toISOString() });
  }

  if (req.method !== "POST") return fail(405, "method_not_allowed", "Use GET or POST");
  let body; try { body = await req.json(); } catch (e) { return fail(400, "bad_request", "Body must be JSON"); }
  const { collection, id, op, data } = body || {};
  if (!COLLECTIONS.has(collection)) return fail(400, "bad_request", "Unknown collection");
  if (typeof id !== "string" || !/^[A-Za-z0-9_\-.~:@+]{1,200}$/.test(id)) return fail(400, "bad_request", "Bad document id");
  if (op !== "set" && op !== "delete") return fail(400, "bad_request", "op must be set or delete");
  if (op === "set") {
    if (!data || typeof data !== "object" || Array.isArray(data)) return fail(400, "bad_request", "data must be an object");
    if (JSON.stringify(data).length > MAX_DOC) return fail(413, "too_large", "Document too large");
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    const cur = await store.getWithMetadata("col:" + collection, { type: "json" });
    const docs = { ...((cur && cur.data && cur.data.docs) || {}) };
    if (op === "set") { docs[id] = data; if (Object.keys(docs).length > MAX_DOCS) return fail(413, "too_large", "Too many documents"); }
    else delete docs[id];
    const value = { docs, updatedAt: new Date().toISOString() };
    const res = cur && cur.etag ? await store.setJSON("col:" + collection, value, { onlyIfMatch: cur.etag }) : await store.setJSON("col:" + collection, value, { onlyIfNew: true });
    if (res && res.modified !== false) return json({ ok: true });
    await new Promise((r) => setTimeout(r, 60 + Math.random() * 200)); // someone else wrote first: re-read and retry
  }
  return fail(409, "conflict", "Too many simultaneous edits, try again");
};
export const config = { path: "/api/motive/state" };
