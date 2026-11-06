// Your saved work and settings, kept with your account so they follow you to any device (v1.0.0).
// Tools keep some things in the browser (SOW drafts, System Designer site visits and presets, pinned docs on project
// sites, "who you are" in Motive…). /nucleus/sync.js copies the listed keys here and back.
//   GET  /api/nucleus/prefs?tool=sow-builder        → { keys: { name: { v, at } } }   (tool=* for all your tools)
//   POST /api/nucleus/prefs { tool, keys: { name: { v, at } | { del: true, at } } }   → newest change per key wins
// One blob per person per tool. Only ever readable by that person.
import { sessionFrom, jsonResponse as json } from "../lib/session.mjs";
import { kv } from "../lib/kv.mjs";

const TOOL = /^[a-z0-9-]{1,40}$/;
const KEY = /^[\w.:@+-]{1,120}$/;
const MAX_TOOL_BYTES = 4 * 1024 * 1024;
const who = (s) => String(s.gs || "pd" + s.uid).replace(/[^0-9A-Za-z_-]/g, "");

export default async (req) => {
  let s;
  try { s = await sessionFrom(req); } catch (e) { return json({ ok: false, message: e.message }, 503); }
  if (!s) return json({ ok: false, code: "needs_reauth" }, 401);
  const st = await kv(), base = `prefs/${who(s)}/`;
  const url = new URL(req.url);

  if (req.method === "GET") {
    const tool = url.searchParams.get("tool") || "";
    if (tool === "*") {
      const { blobs } = await st.list({ prefix: base });
      const out = {};
      await Promise.all((blobs || []).map(async (b) => { out[b.key.slice(base.length)] = ((await st.get(b.key, { type: "json" })) || {}).keys || {}; }));
      return json({ ok: true, tools: out });
    }
    if (!TOOL.test(tool)) return json({ ok: false, message: "Bad tool" }, 400);
    const rec = (await st.get(base + tool, { type: "json" })) || {};
    return json({ ok: true, keys: rec.keys || {} });
  }

  if (req.method !== "POST") return json({ ok: false }, 405);
  let b; try { b = await req.json(); } catch (e) { return json({ ok: false, message: "Body must be JSON" }, 400); }
  if (!b || !TOOL.test(b.tool || "") || !b.keys || typeof b.keys !== "object") return json({ ok: false, message: "tool and keys needed" }, 400);
  const rec = (await st.get(base + b.tool, { type: "json" })) || { keys: {} };
  let changed = 0;
  for (const [k, v] of Object.entries(b.keys)) {
    if (!KEY.test(k) || !v || typeof v.at !== "number") continue;
    const cur = rec.keys[k];
    if (cur && cur.at >= v.at) continue; // keep the newer change
    if (v.del) rec.keys[k] = { del: true, at: v.at };
    else if (typeof v.v === "string") rec.keys[k] = { v: v.v, at: v.at };
    else continue;
    changed++;
  }
  rec.updatedAt = new Date().toISOString();
  if (JSON.stringify(rec).length > MAX_TOOL_BYTES) return json({ ok: false, code: "too_large", message: "Too much saved for this tool" }, 413);
  if (changed) await st.setJSON(base + b.tool, rec);
  return json({ ok: true, changed, keys: rec.keys });
};

export const config = { path: "/api/nucleus/prefs" };
