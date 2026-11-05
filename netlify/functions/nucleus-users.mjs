// GET /api/nucleus/users?ids=1,2,3 → { profiles: { "1": { name }, ... } }
// Names of colleagues, so shared tools can show who approved or changed something.
import { tokenFrom, pipedriveBase, jsonResponse as json } from "../lib/session.mjs";

export default async (req) => {
  let token;
  try { token = await tokenFrom(req); } catch (e) { return json({ code: "server_unavailable", message: e.message }, 503); }
  if (!token) return json({ code: "needs_reauth", message: "Sign in to the Nucleus first." }, 401);
  const ids = (new URL(req.url).searchParams.get("ids") || "").split(",").map((s) => s.trim()).filter((s) => /^\d{1,12}$/.test(s)).slice(0, 100);
  const profiles = {};
  if (!ids.length) return json({ profiles });
  const r = await fetch(pipedriveBase() + "/v1/users", { headers: { "x-api-token": token, accept: "application/json" } });
  const j = await r.json().catch(() => ({}));
  const all = new Map((j.data || []).map((u) => [String(u.id), u]));
  // Without the users scope, fall back to fetching each one
  await Promise.all(ids.map(async (id) => {
    let u = all.get(id);
    if (!u && !r.ok) { try { const x = await fetch(pipedriveBase() + "/v1/users/" + id, { headers: { "x-api-token": token, accept: "application/json" } }); u = (await x.json()).data; } catch (e) {} }
    if (u) profiles[id] = { name: u.name };
  }));
  return json({ profiles });
};

export const config = { path: "/api/nucleus/users" };
