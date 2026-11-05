// Shared storage for Nucleus tools (Netlify Blobs), shaped like an artifact's database:
//   GET  /api/nucleus/store?ns=merge-desk&collection=decisions   → { docs:[{id,data}] }
//   GET  /api/nucleus/store?ns=merge-desk&doc=settings/main       → { exists, data }
//   POST /api/nucleus/store { ns, doc:"decisions/g-1-2", op:"set"|"update"|"delete", data }
// One blob per document, so two people saving different documents never overwrite each other.
// Signed-in people only.
import { sessionFrom, jsonResponse as json } from "../lib/session.mjs";
import { kv } from "../lib/kv.mjs";

const NS = /^[a-z0-9-]{1,40}$/;
const SEG = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
const MAX_DOC = 200000;

const store = kv;

function validDoc(path) {
  const parts = String(path || "").split("/");
  return parts.length === 2 && parts.every((p) => SEG.test(p));
}

export default async (req) => {
  let s;
  try { s = await sessionFrom(req); } catch (e) { return json({ code: "server_unavailable", message: e.message }, 503); }
  if (!s) return json({ code: "needs_reauth", message: "Sign in to the Nucleus first." }, 401);
  const st = await store();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const ns = url.searchParams.get("ns");
    if (!NS.test(ns || "")) return json({ code: "invalid_argument", message: "Bad ns" }, 400);
    const col = url.searchParams.get("collection"), doc = url.searchParams.get("doc");
    if (col) {
      if (!SEG.test(col)) return json({ code: "invalid_argument", message: "Bad collection" }, 400);
      const prefix = `${ns}/${col}/`;
      const { blobs } = await st.list({ prefix });
      const docs = (await Promise.all((blobs || []).map(async (b) => {
        const data = await st.get(b.key, { type: "json" });
        return data == null ? null : { id: b.key.slice(prefix.length), data };
      }))).filter(Boolean);
      return json({ docs });
    }
    if (doc) {
      if (!validDoc(doc)) return json({ code: "invalid_argument", message: "Bad doc path" }, 400);
      const data = await st.get(`${ns}/${doc}`, { type: "json" });
      return json({ exists: data != null, data: data == null ? null : data });
    }
    return json({ code: "invalid_argument", message: "collection or doc required" }, 400);
  }

  if (req.method !== "POST") return json({ code: "invalid_argument", message: "GET or POST" }, 405);
  let body; try { body = await req.json(); } catch (e) { return json({ code: "invalid_argument", message: "Body must be JSON" }, 400); }
  const { ns, doc, op, data } = body || {};
  if (!NS.test(ns || "") || !validDoc(doc)) return json({ code: "invalid_argument", message: "Bad ns or doc" }, 400);
  const key = `${ns}/${doc}`;
  if (op === "delete") { await st.delete(key); return json({ ok: true }); }
  if (op !== "set" && op !== "update") return json({ code: "invalid_argument", message: "op must be set, update or delete" }, 400);
  if (!data || typeof data !== "object" || Array.isArray(data)) return json({ code: "invalid_argument", message: "data must be an object" }, 400);
  let value = data;
  if (op === "update") { const cur = await st.get(key, { type: "json" }); value = { ...(cur || {}), ...data }; }
  if (JSON.stringify(value).length > MAX_DOC) return json({ code: "invalid_argument", message: "Document too large" }, 413);
  await st.setJSON(key, value);
  return json({ ok: true });
};

export const config = { path: "/api/nucleus/store" };

