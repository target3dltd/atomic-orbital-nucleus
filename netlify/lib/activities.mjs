// The signed-in person's open Pipedrive activities that are overdue or due today (UK days), using Pipedrive's v2 API.
// (The v1 /activities list stopped returning results for the Nucleus, so "Your day" and the hub pulse both use this.)
import { pipedriveBase } from "./session.mjs";

const TZ = "Europe/London";
export const ukDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
export const addDays = (ymd, n) => { const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ukTime = (d) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);

async function pd(token, path) {
  const r = await fetch(pipedriveBase() + path, { headers: { "x-api-token": token, accept: "application/json" } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) throw new Error(j.error || "Pipedrive " + r.status);
  return j;
}

// Newest due date first, so future activities come first and we stop once we're past the look-back window.
export async function myOpenActivities(token, uid, { lookbackDays = 365, maxPages = 6 } = {}) {
  const today = ukDate(), oldest = addDays(today, -lookbackDays), out = [];
  let cursor = null;
  for (let page = 0; page < maxPages; page++) {
    const q = new URLSearchParams({ owner_id: String(uid), done: "false", sort_by: "due_date", sort_direction: "desc", limit: "500" });
    if (cursor) q.set("cursor", cursor);
    const j = await pd(token, "/api/v2/activities?" + q);
    let stop = false;
    for (const a of j.data || []) {
      if (!a || a.is_deleted || !a.due_date) continue;
      if (a.due_date < addDays(oldest, -1)) { stop = true; break; }
      out.push(a);
    }
    cursor = j.additional_data && j.additional_data.next_cursor;
    if (stop || !cursor) break;
  }
  return out;
}

// Shape them for "Your day": UK times, deal / organisation / person names, and a link into Pipedrive.
export async function myDay(token, uid, company) {
  const today = ukDate(), acts = await myOpenActivities(token, uid);
  const items = [];
  for (const a of acts) {
    let time = null, at = null, date = a.due_date;
    if (a.due_time) { at = new Date(a.due_date + "T" + String(a.due_time).slice(0, 5) + ":00Z"); time = ukTime(at); date = ukDate(at); }
    if (date > today) continue;
    items.push({ a, date, time, at });
  }
  // names for context (one call per kind, up to 100 ids each)
  const ids = (k) => [...new Set(items.map((x) => x.a[k]).filter(Boolean))].slice(0, 100);
  const names = {};
  await Promise.all([["deal_id", "deals", "title"], ["org_id", "organizations", "name"], ["person_id", "persons", "name"]].map(async ([k, path, field]) => {
    const list = ids(k); if (!list.length) return;
    try { const j = await pd(token, `/api/v2/${path}?ids=${list.join(",")}&limit=100`); for (const r of j.data || []) names[k + r.id] = r[field]; } catch (e) { /* names are optional */ }
  }));
  const base = `https://${company || "app"}.pipedrive.com`;
  const shaped = items.map(({ a, date, time, at }) => ({
    kind: "pipedrive", id: a.id, title: a.subject || a.type || "Activity", type: a.type || null, date, time, at: at ? at.toISOString() : null,
    context: [names["deal_id" + a.deal_id], names["org_id" + a.org_id], names["person_id" + a.person_id]].filter(Boolean).join(" · ") || null,
    meet: a.conference_meeting_url || null,
    url: a.deal_id ? `${base}/deal/${a.deal_id}` : a.org_id ? `${base}/organization/${a.org_id}` : a.person_id ? `${base}/person/${a.person_id}` : `${base}/activities/list`,
  }));
  const overdue = shaped.filter((x) => x.date < today).sort((x, y) => (x.date + (x.time || "")).localeCompare(y.date + (y.time || "")));
  const todays = shaped.filter((x) => x.date === today).sort((x, y) => (x.time || "").localeCompare(y.time || ""));
  return { overdue, today: todays };
}

export async function completeActivity(token, id) {
  const r = await fetch(`${pipedriveBase()}/api/v2/activities/${id}`, { method: "PATCH", headers: { "x-api-token": token, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ done: true }) });
  return r.ok;
}
