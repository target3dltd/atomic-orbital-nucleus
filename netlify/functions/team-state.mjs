// Shared entries for the team dashboards (replaces the browser-only storage they shipped with).
//   GET  /api/team/state                         → { me, isAdmin, kpi_actuals, kpi_notes, milestones }
//   POST /api/team/state { key, patch }           → merges fields; a null value removes the field
// Who can do what:
//   kpi_actuals  co_*         company KPIs           read: everyone   write: admins
//                <person>_*   a person's KPIs        read: that person and admins   write: that person and admins
//   kpi_notes    <person>_*   monthly meeting notes  read and write: that person and admins
//   milestones   <number>     plan progress          read: everyone   write: admins
// A person is matched by the first name on their Pipedrive user (allan, ashley, jack…), the ids the dashboards use.
import { sessionFrom, isAdmin, jsonResponse as json } from "../lib/session.mjs";
import { kv } from "../lib/kv.mjs";

const KEYS = ["kpi_actuals", "kpi_notes", "milestones"];
const docKey = (k) => "team-dashboards/state/" + k;
export const personId = (name) => String(name || "").trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z-]/g, "");

function canRead(key, field, me, admin) {
  if (admin) return true;
  if (key === "milestones") return true;
  if (key === "kpi_actuals" && field.startsWith("co_")) return true;
  return !!me && field.startsWith(me + "_");
}
function canWrite(key, field, me, admin) {
  if (admin) return true;
  if (key === "milestones") return false;
  if (key === "kpi_actuals" && field.startsWith("co_")) return false;
  return !!me && field.startsWith(me + "_");
}

export default async (req) => {
  let s;
  try { s = await sessionFrom(req); } catch (e) { return json({ ok: false, message: e.message }, 503); }
  if (!s) return json({ ok: false, code: "needs_reauth", message: "Sign in to the Nucleus first." }, 401);
  const admin = isAdmin(s), me = personId(s.n || s.gn);
  const store = await kv();

  if (req.method === "GET") {
    const out = { ok: true, me, isAdmin: admin, name: s.n || s.gn };
    for (const k of KEYS) {
      const all = (await store.get(docKey(k), { type: "json" })) || {};
      out[k] = Object.fromEntries(Object.entries(all).filter(([f]) => canRead(k, f, me, admin)));
    }
    return json(out);
  }
  if (req.method !== "POST") return json({ ok: false, message: "GET or POST" }, 405);
  let body; try { body = await req.json(); } catch (e) { return json({ ok: false, message: "Body must be JSON" }, 400); }
  const { key, patch } = body || {};
  if (!KEYS.includes(key) || !patch || typeof patch !== "object" || Array.isArray(patch)) return json({ ok: false, message: "key and patch required" }, 400);
  const fields = Object.keys(patch);
  if (!fields.length || fields.length > 200) return json({ ok: false, message: "1 to 200 fields" }, 400);
  for (const f of fields) {
    if (!/^[A-Za-z0-9_.:-]{1,120}$/.test(f)) return json({ ok: false, message: "Bad field " + f }, 400);
    if (!canWrite(key, f, me, admin)) return json({ ok: false, code: "forbidden", message: "You can only change your own entries." + (admin ? "" : " Company figures and plan progress are for administrators.") }, 403);
    const v = patch[f];
    if (v !== null && typeof v !== "number" && !(typeof v === "string" && v.length <= 20000)) return json({ ok: false, message: "Values must be numbers or text" }, 400);
  }
  const cur = (await store.get(docKey(key), { type: "json" })) || {};
  for (const f of fields) { if (patch[f] === null) delete cur[f]; else cur[f] = patch[f]; }
  await store.setJSON(docKey(key), cur);
  return json({ ok: true });
};

export const config = { path: "/api/team/state" };
