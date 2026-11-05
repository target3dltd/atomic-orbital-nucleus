// Builds the weekly campaign summary from the shared tracker (+ Pipedrive deal results) and posts it.
import { env, getStoreSafe } from "./lib.mjs";

const TEAM = ["Jack Weston", "Ashley Keeler", "Allan Rankin", "Ruslana Bletska", "Charlie Wadey"];
const DAY = 86400000;
const money = (n) => "£" + Math.round(n || 0).toLocaleString("en-GB");
const fmt = (iso) => new Date(iso + (iso.length === 10 ? "T00:00:00Z" : "")).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

async function pipedriveDeals(ids) {
  const token = env("PIPEDRIVE_API_TOKEN"); if (!token || !ids.length) return new Map();
  const base = `https://${env("PIPEDRIVE_DOMAIN", "api")}.pipedrive.com`, out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const r = await fetch(`${base}/api/v2/deals?ids=${ids.slice(i, i + 100).join(",")}&limit=100`, { headers: { "x-api-token": token, accept: "application/json" } });
    const j = await r.json().catch(() => ({}));
    (j.data || []).forEach((d) => out.set(d.id, d));
  }
  return out;
}

export async function buildSummary(now = new Date()) {
  const store = await getStoreSafe();
  const get = async (n) => ((await store.getWithMetadata("col:" + n, { type: "json" })) || {}).data || {};
  const camp = (await get("campaign")).docs || {};
  const meta = ((await get("meta")).docs || {}).summary || null;
  const since = now.getTime() - 7 * DAY, todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const deals = await pipedriveDeals([...new Set(Object.values(camp).map((x) => +x.pdDeal).filter((n) => n > 0))]);
  const people = {}; TEAM.forEach((n) => (people[n] = { owned: 0, contacted: 0, overdue: 0, dueWeek: 0, deals: 0, leads: 0, won: 0 }));
  let won = 0, wonN = 0, open = 0, openN = 0, lostN = 0, wonWeek = 0;
  for (const x of Object.values(camp)) {
    const d = deals.get(+x.pdDeal);
    if (d) { const v = d.value || 0; if (d.status === "won") { won += v; wonN++; if (d.won_time && Date.parse(d.won_time) > since) wonWeek += v; } else if (d.status === "lost") lostN++; else { open += v; openN++; } }
    if (!x.owner) continue;
    const p = people[x.owner] = people[x.owner] || { owned: 0, contacted: 0, overdue: 0, dueWeek: 0, deals: 0, leads: 0, won: 0 };
    p.owned++;
    if ((x.log || []).some((l) => Date.parse(l.at) > since && (l.type === "email" || l.type === "call"))) p.contacted++;
    if (x.next) { const dd = Math.round((Date.parse(x.next + "T00:00:00Z") - todayMs) / DAY); if (dd < 0) p.overdue++; else if (dd <= 7) p.dueWeek++; }
    if (x.pdDealAt && Date.parse(x.pdDealAt) > since) p.deals++;
    if (x.pdLeadAt && Date.parse(x.pdLeadAt) > since) p.leads++;
    if (d && d.status === "won") p.won += d.value || 0;
  }
  const L = [`*Motive upgrade campaign – week to ${now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}*`, ""];
  L.push(`Won so far: ${money(won)} from ${wonN} deal${wonN === 1 ? "" : "s"}${wonWeek ? ` (${money(wonWeek)} this week)` : ""} · ${openN} open (${money(open)}) · ${lostN} lost`, "");
  for (const [n, p] of Object.entries(people)) {
    if (!p.owned) { L.push(`${n}: no clients assigned yet`); continue; }
    L.push(`${n}: ${p.owned} clients · ${p.contacted} contacted this week · ${p.overdue} overdue · ${p.dueWeek} due this week · ${p.deals} deals / ${p.leads} leads created · ${money(p.won)} won`);
  }
  if (meta && meta.expiring) {
    const ex = meta.expiring.filter((e) => { const dd = (Date.parse(e.end + "T00:00:00Z") - todayMs) / DAY; return dd >= 0 && dd <= 30; });
    L.push("", `Maintenance ending in the next 30 days (${ex.length}):`);
    ex.slice(0, 15).forEach((e) => L.push(`• ${fmt(e.end)} – ${e.client} (${e.edition} 3) – ${(camp[e.key] || {}).owner || "UNASSIGNED"}`));
  }
  if (meta && meta.highFree) {
    const hf = meta.highFree.filter((h) => !(camp[h.key] || {}).owner);
    L.push("", `High-priority clients with no owner: ${hf.length}${hf.length ? " – top: " + hf.slice(0, 5).map((h) => h.client).join(", ") : ""}`);
  }
  if (meta && meta.at) L.push("", `Licence figures as of ${fmt(meta.at.slice(0, 10))} (updated whenever someone opens the planner).`);
  const site = env("URL"); if (site) L.push(`Open the planner: ${site}`);
  return L.join("\n");
}

export async function sendSummary(text) {
  const sent = [];
  const chat = env("GOOGLE_CHAT_WEBHOOK_URL");
  if (chat) {
    const r = await fetch(chat, { method: "POST", headers: { "content-type": "application/json; charset=UTF-8" }, body: JSON.stringify({ text }) });
    if (!r.ok) throw new Error("Google Chat webhook returned " + r.status);
    sent.push("Google Chat");
  }
  const key = env("RESEND_API_KEY"), to = env("SUMMARY_EMAIL_TO");
  if (key && to) {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: "Bearer " + key, "content-type": "application/json" },
      body: JSON.stringify({ from: env("SUMMARY_EMAIL_FROM", "Motive Planner <onboarding@resend.dev>"), to: to.split(/[,;]\s*/), subject: "Motive upgrade campaign – weekly summary", text: text.replace(/\*/g, "") }) });
    if (!r.ok) throw new Error("Email service returned " + r.status);
    sent.push("email");
  }
  return sent;
}
