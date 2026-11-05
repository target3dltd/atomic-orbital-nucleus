// GET /api/team/pipedrive?path=/deals&… → read-only Pipedrive (v1) for the team dashboards.
// Signed-in people only. Company-wide figures need a token that can see every deal, so this uses the
// shared read-only PIPEDRIVE_API_TOKEN when it is set, and otherwise the signed-in person's own token
// (then each person sees only the deals Pipedrive lets them see).
import { sessionFrom, envGet, pipedriveBase, jsonResponse as json } from "../lib/session.mjs";

const ALLOWED = ["/deals", "/deals/summary", "/dealFields", "/users", "/stages", "/pipelines", "/activities", "/organizations", "/persons", "/deals/timeline"];

export default async (req) => {
  let s;
  try { s = await sessionFrom(req); } catch (e) { return json({ success: false, error: e.message }, 503); }
  if (!s) return json({ success: false, error: "Sign in to the Nucleus first.", code: "needs_reauth" }, 401);
  if (req.method !== "GET") return json({ success: false, error: "GET only" }, 405);
  const q = new URL(req.url).searchParams;
  const path = q.get("path") || "/deals";
  if (path.includes("..") || !ALLOWED.some((a) => path === a || path.startsWith(a + "/"))) return json({ success: false, error: "Path not allowed: " + path }, 403);
  const params = new URLSearchParams();
  for (const [k, v] of q) if (k !== "path" && k !== "api_token") params.append(k, v);
  const token = envGet("PIPEDRIVE_API_TOKEN") || s.t;
  try {
    const r = await fetch(`${pipedriveBase()}/v1${path}?${params}`, { headers: { "x-api-token": token, accept: "application/json" } });
    return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json", "cache-control": "private, max-age=60", "x-nucleus-token": envGet("PIPEDRIVE_API_TOKEN") ? "shared" : "personal" } });
  } catch (e) {
    return json({ success: false, error: String(e && e.message || e) }, 502);
  }
};

export const config = { path: "/api/team/pipedrive" };
