// GET /api/nucleus/pulse → a few live Pipedrive figures for the signed-in person, shown on the Nucleus hub.
import { sessionFrom, pipedriveBase, jsonResponse as json } from "../lib/session.mjs";

export default async (req) => {
  let s;
  try { s = await sessionFrom(req); } catch (e) { return json({ ok: false, message: e.message }, 503); }
  if (!s) return json({ ok: false, code: "needs_reauth" }, 401);
  const get = async (path) => {
    const r = await fetch(pipedriveBase() + path, { headers: { "x-api-token": s.t, accept: "application/json" } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  };
  const today = new Date().toISOString().slice(0, 10);
  const out = { ok: true, at: new Date().toISOString() };
  const jobs = [
    get(`/v1/deals/summary?status=open&user_id=${s.uid}`).then((j) => {
      const d = j.data || {};
      out.myOpenDeals = d.total_count || 0;
      out.myOpenValue = d.total_currency_converted_value_formatted || d.total_weighted_currency_converted_value_formatted || null;
    }),
    get(`/v1/deals/summary?status=open`).then((j) => {
      const d = j.data || {};
      out.teamOpenDeals = d.total_count || 0;
      out.teamOpenValue = d.total_currency_converted_value_formatted || null;
    }),
    get(`/v1/activities?user_id=${s.uid}&done=0&start_date=2000-01-01&end_date=${today}&limit=500`).then((j) => {
      out.myActivitiesDue = (j.data || []).length;
    }),
  ];
  const res = await Promise.allSettled(jobs);
  out.partial = res.some((r) => r.status === "rejected");
  return json(out);
};

export const config = { path: "/api/nucleus/pulse" };
