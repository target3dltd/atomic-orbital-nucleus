// Pipedrive proxy: only the operations the planner uses (read deals, organisations, contacts and user names; create deals, leads and notes). The API token never reaches the browser.
import { guard, json, fail, env } from "../lib/motive/lib.mjs";

const idsParam = (ids) => (Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 100).join(",");

export default async (req) => {
  const g = await guard(req); if (g) return g;
  if (req.method !== "POST") return fail(405, "method_not_allowed", "POST only");
  // Nucleus: runs as the signed-in person with their own Pipedrive token.
  const token = req.nucleus && req.nucleus.t;
  if (!token) return fail(401, "signed_out", "Sign in to the Nucleus first.");
  const base = `https://${env("PIPEDRIVE_DOMAIN", "api")}.pipedrive.com`;
  let body; try { body = await req.json(); } catch (e) { return fail(400, "bad_request", "Body must be JSON"); }
  const { tool, input = {} } = body || {};
  const call = async (method, path, payload) => {
    const r = await fetch(base + path, { method, headers: { "x-api-token": token, accept: "application/json", ...(payload ? { "content-type": "application/json" } : {}) }, body: payload ? JSON.stringify(payload) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.success === false) throw { status: r.status, message: j.error || j.message || r.statusText };
    return j;
  };
  try {
    if (tool === "getDeals") {
      const q = new URLSearchParams();
      if (input.ids) { const ids = idsParam(input.ids); if (!ids) return json({ payload: { data: [] } }); q.set("ids", ids); }
      if (input.pipeline_id) q.set("pipeline_id", String(Number(input.pipeline_id)));
      if (Array.isArray(input.custom_fields) && input.custom_fields.length) q.set("custom_fields", input.custom_fields.filter((k) => /^[a-f0-9]{40}$/.test(k)).join(","));
      q.set("limit", String(Math.min(Number(input.limit) || 100, 500)));
      const data = []; let cursor = null, pages = 0;
      do { if (cursor) q.set("cursor", cursor); const j = await call("GET", "/api/v2/deals?" + q); data.push(...(j.data || [])); cursor = j.additional_data && j.additional_data.next_cursor; pages++; } while (cursor && !input.ids && pages < 10);
      return json({ payload: { data }, storedAt: Date.now() });
    }
    if (tool === "getOrganizations" || tool === "getPersons") {
      const ids = idsParam(input.ids); if (!ids) return json({ payload: { data: [] } });
      const j = await call("GET", `/api/v2/${tool === "getPersons" ? "persons" : "organizations"}?ids=${ids}&limit=100`);
      return json({ payload: { data: j.data || [] }, storedAt: Date.now() });
    }
    if (tool === "getUsers") {
      const j = await call("GET", "/v1/users");
      const data = (j.data || []).map((u) => ({ id: u.id, name: u.name, active_flag: u.active_flag }));
      return json({ payload: { data }, storedAt: Date.now() });
    }
    if (tool === "addNote") {
      const target = ["deal_id", "org_id", "person_id", "lead_id"].find((k) => input[k]);
      if (!target || !input.content) return fail(400, "bad_request", "content and one of deal_id, org_id, person_id or lead_id are required");
      const payload = { content: String(input.content).slice(0, 2000), [target]: input[target] };
      if (input.user_id) payload.user_id = Number(input.user_id);
      const j = await call("POST", "/v1/notes", payload);
      return json({ payload: { data: { id: j.data && j.data.id } } });
    }
    if (tool === "addDeal") {
      const allowed = ["title", "value", "currency", "pipeline_id", "stage_id", "org_id", "person_id", "owner_id"];
      const payload = Object.fromEntries(Object.entries(input).filter(([k]) => allowed.includes(k)));
      if (!payload.title) return fail(400, "bad_request", "title required");
      const j = await call("POST", "/api/v2/deals", payload);
      return json({ payload: { data: j.data } });
    }
    if (tool === "addLead") {
      const allowed = ["title", "organization_id", "person_id", "value", "owner_id"];
      const payload = Object.fromEntries(Object.entries(input).filter(([k]) => allowed.includes(k)));
      if (!payload.title || (!payload.organization_id && !payload.person_id)) return fail(400, "bad_request", "title and an organisation or person are required");
      const j = await call("POST", "/v1/leads", payload);
      return json({ payload: { data: j.data } });
    }
    return fail(400, "bad_request", "Unsupported Pipedrive operation");
  } catch (e) {
    return fail(e.status === 401 || e.status === 403 ? 502 : 502, "upstream_error", "Pipedrive: " + (e.message || "request failed"));
  }
};
export const config = { path: "/api/motive/pipedrive" };
