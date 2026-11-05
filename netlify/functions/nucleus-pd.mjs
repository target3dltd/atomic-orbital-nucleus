// POST /api/nucleus/pd  { tool, input }  →  { payload }
// Pipedrive for tools that were first built as claude.ai artifacts. It answers the same
// tool names and shapes as the Pipedrive connector, so a page calling
// mcp.callTool("Pipedrive", "getDeals", {...}) works unchanged through /nucleus/claude-shim.js.
// Every call runs as the signed-in person, with their own Pipedrive token from the session cookie.
import { tokenFrom, pipedriveBase, jsonResponse as json } from "../lib/session.mjs";

const csv = (v) => (Array.isArray(v) ? v.join(",") : v);
const qs = (input, skip = []) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(input || {})) {
    if (skip.includes(k) || v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
    q.set(k, String(csv(v)));
  }
  const s = q.toString();
  return s ? "?" + s : "";
};
const idOf = (input) => {
  const id = input && input.id;
  if (id == null || !/^[A-Za-z0-9-]{1,64}$/.test(String(id))) throw { status: 400, message: "id is required" };
  return encodeURIComponent(String(id));
};
const without = (o, ...keys) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !keys.includes(k)));

// Reading tools: [method, path builder]
const READ = {
  getOrganizations: (i) => ["GET", "/api/v2/organizations" + qs(i)],
  getOrganization:  (i) => ["GET", "/api/v2/organizations/" + idOf(i) + qs(i, ["id"])],
  getPersons:       (i) => ["GET", "/api/v2/persons" + qs(i)],
  getPerson:        (i) => ["GET", "/api/v2/persons/" + idOf(i) + qs(i, ["id"])],
  getDeals:         (i) => ["GET", "/api/v2/deals" + qs(dealStatus(i))],
  getDeal:          (i) => ["GET", "/api/v2/deals/" + idOf(i) + qs(i, ["id"])],
  getActivities:    (i) => ["GET", "/api/v2/activities" + qs(i)],
  getLeads:         (i) => ["GET", "/v1/leads" + qs(i)],
  getNotes:         (i) => ["GET", "/v1/notes" + qs(i)],
  searchOrganization: (i) => ["GET", "/api/v2/organizations/search" + qs(i)],
  searchPersons:    (i) => ["GET", "/api/v2/persons/search" + qs(i)],
  searchDeals:      (i) => ["GET", "/api/v2/deals/search" + qs(i)],
  getStages:        (i) => ["GET", "/api/v2/stages" + qs(i)],
  getProducts:      (i) => ["GET", "/api/v2/products" + qs(i)],
};
// open + won + lost is the same as "not deleted", which is Pipedrive's default
function dealStatus(i) {
  const s = i && i.status;
  if (Array.isArray(s)) {
    const set = new Set(s);
    if (["open", "won", "lost"].every((x) => set.has(x)) && !set.has("deleted")) return without(i, "status");
  }
  return i;
}

// Writing tools: [method, path, body]
const WRITE = {
  updateOrganization: (i) => ["PATCH", "/api/v2/organizations/" + idOf(i), without(i, "id")],
  updatePerson:       (i) => ["PATCH", "/api/v2/persons/" + idOf(i), without(i, "id")],
  updateDeal:         (i) => ["PATCH", "/api/v2/deals/" + idOf(i), without(i, "id")],
  updateActivity:     (i) => ["PATCH", "/api/v2/activities/" + idOf(i), without(i, "id")],
  updateLead:         (i) => ["PATCH", "/v1/leads/" + idOf(i), without(i, "id")],
  updateNote:         (i) => ["PUT", "/v1/notes/" + idOf(i), without(i, "id")],
  addNote:            (i) => ["POST", "/v1/notes", i],
};

export default async (req) => {
  if (req.method !== "POST") return json({ code: "bad_request", message: "POST only" }, 405);
  let token;
  try { token = await tokenFrom(req); } catch (e) { return json({ code: "server_unavailable", message: e.message }, 503); }
  if (!token) return json({ code: "needs_reauth", message: "Your Nucleus session has ended. Sign in again with your Pipedrive API token." }, 401);

  let body; try { body = await req.json(); } catch (e) { return json({ code: "bad_request", message: "Body must be JSON" }, 400); }
  const tool = body && body.tool, input = (body && body.input) || {};

  const call = async (method, path, payload) => {
    const r = await fetch(pipedriveBase() + path, {
      method,
      headers: { "x-api-token": token, accept: "application/json", ...(payload ? { "content-type": "application/json" } : {}) },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.success === false) throw { status: r.status, message: j.error || j.message || r.statusText, retryAfter: r.headers.get("retry-after") };
    return j;
  };

  try {
    if (tool === "getAccountContext") return json({ payload: await accountContext(call) });
    if (READ[tool]) { const [m, p] = READ[tool](input); return json({ payload: await call(m, p) }); }
    if (WRITE[tool]) { const [m, p, b] = WRITE[tool](input); return json({ payload: await call(m, p, b) }); }
    return json({ code: "not_in_manifest", message: `The Nucleus doesn't offer the Pipedrive tool "${tool}".` }, 400);
  } catch (e) {
    const status = e.status || 502;
    if (status === 429) return json({ code: "server_unavailable", retryable: true, retryAfterMs: (Number(e.retryAfter) || 2) * 1000, message: "Pipedrive rate limit" }, 429);
    if (status === 401) return json({ code: "needs_reauth", message: "Pipedrive no longer accepts your token. Sign out of the Nucleus and in again." }, 401);
    return json({ code: "tool_error", message: String(e.message || "Pipedrive request failed") }, status >= 400 && status < 600 ? status : 502);
  }
};

// The connector's getAccountContext, rebuilt from Pipedrive's field lists.
async function accountContext(call) {
  const kinds = { deal: "dealFields", person: "personFields", organization: "organizationFields", activity: "activityFields", product: "productFields" };
  const custom_fields = {};
  await Promise.all(Object.entries(kinds).map(async ([kind, ep]) => {
    const out = []; let start = 0;
    for (let page = 0; page < 10; page++) {
      const j = await call("GET", `/v1/${ep}?start=${start}&limit=500`);
      for (const f of j.data || []) {
        const isCustom = /^[a-f0-9]{40}$/.test(f.key);
        out.push({ field_name: f.name, field_code: f.key, field_type: f.field_type, options: f.options || null, subfields: null,
          is_custom_field: isCustom, is_optional_response_field: false, is_writable: isCustom ? f.edit_flag !== false : f.bulk_edit_allowed !== false });
      }
      const pg = j.additional_data && j.additional_data.pagination;
      if (pg && pg.more_items_in_collection) start = pg.next_start; else break;
    }
    custom_fields[kind] = out;
  }));
  let pipelines = [];
  try {
    const [p, s] = await Promise.all([call("GET", "/api/v2/pipelines"), call("GET", "/api/v2/stages?limit=500")]);
    pipelines = (p.data || []).map((pl) => ({ id: pl.id, name: pl.name, stages: (s.data || []).filter((st) => st.pipeline_id === pl.id).map((st) => ({ id: st.id, name: st.name, order_nr: st.order_nr })) }));
  } catch (e) {}
  return { pipelines, custom_fields };
}

export const config = { path: "/api/nucleus/pd" };
