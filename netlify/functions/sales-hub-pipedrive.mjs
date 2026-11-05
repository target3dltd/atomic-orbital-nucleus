// /api/sales-hub/pipedrive?path=/deals&… → Pipedrive (v1) for the Sales Hub (v1.0.0).
// Only people on the Sales Hub list (NUCLEUS_SALES_HUB_USERS) and administrators.
//   GET  reads company-wide with the shared read-only PIPEDRIVE_API_TOKEN (falls back to the person's own token).
//   PUT  /deals/<id> with { probability } only: Pipeline Triage's probability edit. Writes always use the
//        signed-in person's own Pipedrive token, so the change is recorded against them in Pipedrive.
import { sessionFrom, canUseSalesHub, envGet, pipedriveBase, jsonResponse as json } from "../lib/session.mjs";

const READ = ["/pipelines", "/stages", "/deals", "/dealFields", "/users", "/projects"];
const WRITE_FIELDS = ["probability"];

export default async (req) => {
  let s;
  try { s = await sessionFrom(req); } catch (e) { return json({ success: false, error: e.message }, 503); }
  if (!s) return json({ success: false, error: "Sign in to the Nucleus first.", code: "needs_reauth" }, 401);
  if (!canUseSalesHub(s)) return json({ success: false, error: "The Sales Hub isn't open to your account. Ask an administrator.", code: "forbidden" }, 403);

  const q = new URL(req.url).searchParams;
  const path = q.get("path") || "";
  if (!path || path.includes("..") || !READ.some((a) => path === a || path.startsWith(a + "/"))) return json({ success: false, error: "Path not allowed: " + path }, 403);
  const params = new URLSearchParams();
  for (const [k, v] of q) if (k !== "path" && k !== "api_token") params.append(k, v);

  let init;
  if (req.method === "GET") {
    init = { headers: { "x-api-token": envGet("PIPEDRIVE_API_TOKEN") || s.t, accept: "application/json" } };
  } else if (req.method === "PUT") {
    if (!/^\/deals\/\d+$/.test(path)) return json({ success: false, error: "Only a deal's probability can be changed here." }, 403);
    let body; try { body = await req.json(); } catch (e) { return json({ success: false, error: "Body must be JSON" }, 400); }
    const keys = Object.keys(body || {});
    if (!keys.length || keys.some((k) => !WRITE_FIELDS.includes(k))) return json({ success: false, error: "Only probability can be changed here." }, 403);
    const p = body.probability;
    if (p !== null && !(Number.isFinite(p) && p >= 0 && p <= 100)) return json({ success: false, error: "Probability must be 0 to 100." }, 400);
    init = { method: "PUT", headers: { "x-api-token": s.t, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ probability: p }) };
  } else {
    return json({ success: false, error: "GET or PUT only" }, 405);
  }

  try {
    const r = await fetch(`${pipedriveBase()}/v1${path}?${params}`, init);
    return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json", "cache-control": req.method === "GET" ? "private, max-age=60" : "no-store" } });
  } catch (e) {
    return json({ success: false, error: "Pipedrive unreachable: " + String(e && e.message || e) }, 502);
  }
};

export const config = { path: "/api/sales-hub/pipedrive" };
