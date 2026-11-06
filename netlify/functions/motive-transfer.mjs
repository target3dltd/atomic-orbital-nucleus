// Moving the Motive tracker from the old Motive Upgrade Planner site into the Nucleus without losing anything (v1.0.0).
// Administrators only.
//   GET  /api/motive/export                   → the whole tracker as JSON (a backup; same shape as the old site's /api/state)
//   POST /api/motive/import { collections, dryRun }
//        Merges an export from the old site (or a backup) into the Nucleus. Per document, the newer one wins
//        (by its updatedAt); documents only in the Nucleus are kept. Safe to run more than once, so you can import
//        now, let people keep working, and import again just before switching the old site off.
import { guard, json, fail, getStoreSafe } from "../lib/motive/lib.mjs";
import { isAdmin } from "../lib/session.mjs";

const COLLECTIONS = ["campaign", "systems", "templates", "meta"];
const stampOf = (d) => Date.parse((d && (d.updatedAt || d.at || d.savedAt)) || "") || 0;

export default async (req) => {
  const g = await guard(req); if (g) return g;
  if (!isAdmin(req.nucleus)) return fail(403, "forbidden", "Only Nucleus administrators can import or export the Motive tracker.");
  const store = await getStoreSafe();
  const path = new URL(req.url).pathname;

  if (path.endsWith("/export")) {
    const out = {};
    for (const n of COLLECTIONS) { const r = await store.getWithMetadata("col:" + n, { type: "json" }); out[n] = (r && r.data && r.data.docs) || {}; }
    return new Response(JSON.stringify({ ok: true, collections: out, at: new Date().toISOString(), from: "nucleus" }, null, 1), {
      headers: { "content-type": "application/json", "content-disposition": `attachment; filename="motive-tracker-${new Date().toISOString().slice(0, 10)}.json"`, "cache-control": "no-store" } });
  }

  if (req.method !== "POST") return fail(405, "method_not_allowed", "POST to import");
  let body; try { body = await req.json(); } catch (e) { return fail(400, "bad_request", "Body must be JSON (the file from the old site's /api/state)"); }
  const incoming = (body && body.collections) || {};
  if (!COLLECTIONS.some((n) => incoming[n] && typeof incoming[n] === "object")) return fail(400, "bad_request", "That doesn't look like a Motive tracker export: no campaign, systems, templates or meta.");
  const report = {};
  for (const n of COLLECTIONS) {
    const inc = incoming[n]; if (!inc || typeof inc !== "object") continue;
    for (let attempt = 0; attempt < 6; attempt++) {
      const cur = await store.getWithMetadata("col:" + n, { type: "json" });
      const docs = { ...((cur && cur.data && cur.data.docs) || {}) };
      const r = { added: 0, updated: 0, keptNewer: 0, same: 0 };
      for (const [id, d] of Object.entries(inc)) {
        if (!/^[A-Za-z0-9_\-.~:@+]{1,200}$/.test(id) || !d || typeof d !== "object" || Array.isArray(d)) continue;
        const mine = docs[id];
        if (!mine) { docs[id] = d; r.added++; }
        else if (JSON.stringify(mine) === JSON.stringify(d)) r.same++;
        else if (stampOf(d) > stampOf(mine)) { docs[id] = d; r.updated++; }
        else r.keptNewer++;
      }
      report[n] = r;
      if (body.dryRun) break;
      if (!r.added && !r.updated) break;
      const value = { docs, updatedAt: new Date().toISOString(), importedAt: new Date().toISOString() };
      const res = cur && cur.etag ? await store.setJSON("col:" + n, value, { onlyIfMatch: cur.etag }) : await store.setJSON("col:" + n, value, { onlyIfNew: true });
      if (res && res.modified !== false) break;
      if (attempt === 5) return fail(409, "conflict", "People are editing right now; try the import again in a moment.");
      await new Promise((ok) => setTimeout(ok, 80 + Math.random() * 200));
    }
  }
  return json({ ok: true, dryRun: !!body.dryRun, report });
};

export const config = { path: ["/api/motive/import", "/api/motive/export"] };
