// "Your day" on the Nucleus home page (v1.0.0): the signed-in person's own
//   - Pipedrive activities: overdue and due today (read and ticked off with their own Pipedrive token)
//   - Google Calendar events today and Google Tasks due today or overdue, once they've connected Google
//     (a one-off extra permission; the refresh token is stored encrypted against their Google account)
//
//   GET  /api/nucleus/day                          → { pipedrive:{overdue,today}, google:{connected,events,tasks} }
//   POST /api/nucleus/day/done { kind, id, list }   → marks a Pipedrive activity or a Google task done
//   POST /api/nucleus/google/disconnect             → forgets (and revokes) the Calendar and Tasks permission
// Days follow UK time (Europe/London).
import { sessionFrom, unseal, seal, googleConfig, pipedriveBase, jsonResponse as json } from "../lib/session.mjs";
import { kv } from "../lib/kv.mjs";

const TZ = "Europe/London";
const userKey = (sub) => "users/" + String(sub).replace(/[^0-9A-Za-z_-]/g, "");

// yyyy-mm-dd for a moment, in UK time
export const ukDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
// offset of UK time from UTC at a moment, in minutes (0 or 60)
const ukOffset = (d) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value])); return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - d.getTime()) / 60000 / 30) * 30; };
// the UTC instant at which a UK calendar day starts
const ukDayStart = (ymd) => { const guess = new Date(ymd + "T00:00:00Z"); return new Date(guess.getTime() - ukOffset(guess) * 60000); };
const addDays = (ymd, n) => { const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function googleAccess(rec) {
  const g = googleConfig();
  if (!g || !rec || !rec.gtok) return null;
  const inner = await unseal(rec.gtok);
  if (!inner || !inner.rt) return null;
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: g.id, client_secret: g.secret, refresh_token: inner.rt, grant_type: "refresh_token" }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) { const e = new Error(j.error === "invalid_grant" ? "revoked" : "google_unavailable"); e.code = j.error; throw e; }
  return j.access_token;
}
const gget = async (token, url) => { const r = await fetch(url, { headers: { authorization: "Bearer " + token, accept: "application/json" } }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error((j.error && j.error.message) || "Google " + r.status); return j; };

export default async (req) => {
  let s;
  try { s = await sessionFrom(req); } catch (e) { return json({ ok: false, message: e.message }, 503); }
  if (!s) return json({ ok: false, code: "needs_reauth" }, 401);
  const url = new URL(req.url), path = url.pathname.replace(/\/+$/, "");
  const store = await kv();
  const rec = s.gs ? await store.get(userKey(s.gs), { type: "json" }) : null;

  if (path.endsWith("/google/disconnect")) {
    if (req.method !== "POST") return json({ ok: false }, 405);
    if (rec && rec.gtok) {
      const inner = await unseal(rec.gtok);
      if (inner && inner.rt) await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(inner.rt), { method: "POST" }).catch(() => {});
      delete rec.gtok; delete rec.gscopes; await store.setJSON(userKey(s.gs), rec);
    }
    return json({ ok: true });
  }

  if (path.endsWith("/day/done")) {
    if (req.method !== "POST") return json({ ok: false }, 405);
    let b; try { b = await req.json(); } catch (e) { return json({ ok: false, message: "Body must be JSON" }, 400); }
    if (b && b.kind === "pipedrive" && /^\d+$/.test(String(b.id))) {
      const r = await fetch(`${pipedriveBase()}/v1/activities/${b.id}`, { method: "PUT", headers: { "x-api-token": s.t, "content-type": "application/json" }, body: JSON.stringify({ done: 1 }) });
      return json({ ok: r.ok }, r.ok ? 200 : r.status);
    }
    if (b && b.kind === "task" && /^[\w-]+$/.test(String(b.id)) && /^[\w-]+$/.test(String(b.list))) {
      try {
        const token = await googleAccess(rec); if (!token) return json({ ok: false, code: "google_not_connected" }, 400);
        const r = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${b.list}/tasks/${b.id}`, { method: "PATCH", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify({ status: "completed" }) });
        return json({ ok: r.ok }, r.ok ? 200 : r.status);
      } catch (e) { return json({ ok: false, code: e.message }, 502); }
    }
    return json({ ok: false, message: "kind must be pipedrive or task" }, 400);
  }

  // ---- GET: the day ----
  const today = ukDate(), dayStart = ukDayStart(today), dayEnd = ukDayStart(addDays(today, 1));
  const out = { ok: true, today, pipedrive: { overdue: [], today: [] }, google: { available: !!googleConfig() && !!s.gs, connected: !!(rec && rec.gtok), events: [], tasks: [] } };
  const company = s.c || "app";

  const pdJob = (async () => {
    const r = await fetch(`${pipedriveBase()}/v1/activities?user_id=${s.uid}&done=0&start_date=${addDays(today, -365)}&end_date=${today}&limit=500`, { headers: { "x-api-token": s.t, accept: "application/json" } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Pipedrive " + r.status);
    for (const a of j.data || []) {
      if (!a || !a.due_date) continue;
      // due_time is UTC in Pipedrive; show it in UK time
      let time = null, at = null;
      if (a.due_time) { at = new Date(a.due_date + "T" + a.due_time + ":00Z"); time = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(at); }
      const localDate = at ? ukDate(at) : a.due_date;
      const item = { kind: "pipedrive", id: a.id, title: a.subject || a.type || "Activity", type: a.type || null, date: localDate, time, at: at ? at.toISOString() : null,
        context: [a.deal_title, a.org_name, a.person_name].filter(Boolean).join(" · ") || null,
        url: a.deal_id ? `https://${company}.pipedrive.com/deal/${a.deal_id}` : a.org_id ? `https://${company}.pipedrive.com/organization/${a.org_id}` : `https://${company}.pipedrive.com/activities/list` };
      if (localDate < today) out.pipedrive.overdue.push(item); else if (localDate === today) out.pipedrive.today.push(item);
    }
    out.pipedrive.overdue.sort((x, y) => (x.date + (x.time || "")).localeCompare(y.date + (y.time || "")));
    out.pipedrive.today.sort((x, y) => (x.time || "").localeCompare(y.time || ""));
  })().catch((e) => { out.pipedrive.error = String(e.message || e); });

  const gJob = (async () => {
    if (!out.google.connected) return;
    let token;
    try { token = await googleAccess(rec); } catch (e) {
      if (e.message === "revoked") { delete rec.gtok; await store.setJSON(userKey(s.gs), rec); out.google.connected = false; out.google.revoked = true; return; }
      throw e;
    }
    const [cal, lists] = await Promise.all([
      gget(token, "https://www.googleapis.com/calendar/v3/calendars/primary/events?" + new URLSearchParams({ timeMin: dayStart.toISOString(), timeMax: dayEnd.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "50" })).catch((e) => ({ error: e.message })),
      gget(token, "https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=20").catch((e) => ({ error: e.message })),
    ]);
    if (cal.error) out.google.calendarError = cal.error;
    for (const ev of cal.items || []) {
      if (ev.status === "cancelled") continue;
      const me = (ev.attendees || []).find((x) => x.self);
      if (me && me.responseStatus === "declined") continue;
      const allDay = !!(ev.start && ev.start.date);
      const start = allDay ? null : new Date(ev.start.dateTime), end = allDay || !ev.end ? null : new Date(ev.end.dateTime);
      const fmt = (d) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
      out.google.events.push({ kind: "event", id: ev.id, title: ev.summary || "(no title)", allDay, time: start ? fmt(start) : null, end: end ? fmt(end) : null, at: start ? start.toISOString() : null, endAt: end ? end.toISOString() : null,
        context: ev.location || (ev.hangoutLink ? "Google Meet" : null), url: ev.htmlLink || null, meet: ev.hangoutLink || null });
    }
    if (lists.error) out.google.tasksError = lists.error;
    const tasks = await Promise.all((lists.items || []).map((l) => gget(token, `https://tasks.googleapis.com/tasks/v1/lists/${l.id}/tasks?` + new URLSearchParams({ showCompleted: "false", showHidden: "false", dueMax: dayEnd.toISOString(), maxResults: "100" }))
      .then((j) => (j.items || []).map((t) => ({ t, l }))).catch(() => [])));
    for (const { t, l } of tasks.flat()) {
      if (!t.due) continue;
      const date = t.due.slice(0, 10); // Google stores a task's due day at midnight UTC
      out.google.tasks.push({ kind: "task", id: t.id, list: l.id, listName: l.title, title: t.title || "(untitled task)", date, overdue: date < today, url: t.webViewLink || "https://tasks.google.com/" });
    }
    out.google.tasks.sort((a, b) => a.date.localeCompare(b.date));
  })().catch((e) => { out.google.error = String(e.message || e); });

  await Promise.all([pdJob, gJob]);
  return json(out);
};

export const config = { path: ["/api/nucleus/day", "/api/nucleus/day/done", "/api/nucleus/google/disconnect"] };
