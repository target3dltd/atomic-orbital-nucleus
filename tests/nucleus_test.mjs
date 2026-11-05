// Nucleus server tests against a fake Pipedrive. Run: node tests/nucleus_test.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.NUCLEUS_SECRET = "test-secret-0123456789abcdef";
process.env.NUCLEUS_LOCAL_STORE = path.join(root, "tests", ".test-store.json");
process.env.MUP_LOCAL_STORE = path.join(root, "tests", ".test-motive.json");
for (const f of [process.env.NUCLEUS_LOCAL_STORE, process.env.MUP_LOCAL_STORE]) try { fs.unlinkSync(f); } catch (e) {}
const { installFakePipedrive, GOOD, OTHER, calls } = await import("./fakepd.mjs");
installFakePipedrive();
const imp = (p) => import(pathToFileURL(path.join(root, p)).href);
const session = await imp("netlify/lib/session.mjs");
const auth = (await imp("netlify/functions/nucleus-auth.mjs")).default;
const pd = (await imp("netlify/functions/nucleus-pd.mjs")).default;
const store = (await imp("netlify/functions/nucleus-store.mjs")).default;
const users = (await imp("netlify/functions/nucleus-users.mjs")).default;
const pulse = (await imp("netlify/functions/nucleus-pulse.mjs")).default;
const gate = await imp("netlify/edge-functions/gate.js");
const find = (await imp("netlify/functions/pipedrive-find.mjs")).handler;
const searchDeals = (await imp("netlify/functions/pipedrive-search-deals.mjs")).handler;
const mHealth = (await imp("netlify/functions/motive-health.mjs")).default;
const mState = (await imp("netlify/functions/motive-state.mjs")).default;
const mPd = (await imp("netlify/functions/motive-pipedrive.mjs")).default;
const gmail = (await imp("netlify/functions/nucleus-gmail.mjs")).default;

let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log("  ✓", name); } catch (e) { fail++; console.log("  ✗", name, "\n     ", e && e.message || e); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || "") + " expected " + JSON.stringify(b) + " got " + JSON.stringify(a)); };
const ok = (c, m) => { if (!c) throw new Error(m || "assertion failed"); };
const U = (p) => "https://nucleus.test" + p;
const req = (p, { method = "GET", body, cookie } = {}) => new Request(U(p), { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const jbody = async (r) => ({ status: r.status, j: await r.json() });

console.log("Session");
await t("seal and unseal round trip", async () => { const s = await session.seal({ t: GOOD, exp: Date.now() + 1000 }); eq((await session.unseal(s)).t, GOOD); });
await t("tampered cookie is refused", async () => { const s = await session.seal({ t: GOOD, exp: Date.now() + 1000 }); const x = s.slice(0, -3) + (s.endsWith("A") ? "BBB" : "AAA"); eq(await session.unseal(x), null); });
await t("expired cookie is refused", async () => { eq(await session.unseal(await session.seal({ t: GOOD, exp: Date.now() - 1 })), null); });
await t("different secret can't open it", async () => { const s = await session.seal({ t: GOOD, exp: Date.now() + 1000 }); process.env.NUCLEUS_SECRET = "another-secret-0123456789"; const r = await session.unseal(s); process.env.NUCLEUS_SECRET = "test-secret-0123456789abcdef"; eq(r, null); });
await t("missing secret is reported, not ignored", async () => { const keep = process.env.NUCLEUS_SECRET; delete process.env.NUCLEUS_SECRET; let code = null; try { await session.seal({}); } catch (e) { code = e.code; } process.env.NUCLEUS_SECRET = keep; eq(code, "not_configured"); });

console.log("Sign in");
let cookie = "";
await t("rejects a malformed token", async () => { const { status } = await jbody(await auth(req("/api/nucleus/login", { method: "POST", body: { token: "nope" } }))); eq(status, 400); });
await t("rejects a token Pipedrive refuses", async () => { const { status, j } = await jbody(await auth(req("/api/nucleus/login", { method: "POST", body: { token: "c".repeat(40) } }))); eq(status, 401); eq(j.code, "rejected"); });
await t("rejects a token from another company", async () => { const { status, j } = await jbody(await auth(req("/api/nucleus/login", { method: "POST", body: { token: OTHER } }))); eq(status, 403); eq(j.code, "wrong_company"); ok(/elsewhere/.test(j.message)); });
await t("accepts a good token and sets an HttpOnly Secure cookie", async () => {
  const r = await auth(req("/api/nucleus/login", { method: "POST", body: { token: GOOD } }));
  const sc = r.headers.get("set-cookie"); const { j } = await jbody(r);
  eq(j.user.name, "Ashley Keeler"); ok(/HttpOnly/.test(sc) && /Secure/.test(sc) && /SameSite=Lax/.test(sc), sc); ok(!/Max-Age/.test(sc), "session cookie without remember");
  ok(!sc.includes(GOOD), "token must not appear in clear"); ok(!JSON.stringify(j).includes(GOOD));
  cookie = sc.split(";")[0];
});
await t("remember me sets a 30-day cookie", async () => { const r = await auth(req("/api/nucleus/login", { method: "POST", body: { token: GOOD, remember: true } })); ok(/Max-Age=2592000/.test(r.headers.get("set-cookie"))); });
await t("/me returns the person, never the token", async () => { const { status, j } = await jbody(await auth(req("/api/nucleus/me", { cookie }))); eq(status, 200); eq(j.user.id, 7); ok(!JSON.stringify(j).includes(GOOD)); });
await t("/me without cookie is 401", async () => { eq((await auth(req("/api/nucleus/me"))).status, 401); });
await t("logout clears the cookie", async () => { const r = await auth(req("/api/nucleus/logout", { method: "POST", cookie })); ok(/Max-Age=0/.test(r.headers.get("set-cookie"))); });

console.log("Google sign-in");
{
  process.env.GOOGLE_CLIENT_ID = "cid.apps.googleusercontent.com"; process.env.GOOGLE_CLIENT_SECRET = "csecret";
  process.env.NUCLEUS_ADMINS = "ashley.k@target3d.co.uk";
  const cookieOf = (r, name = "nucleus_s") => { const all = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get("set-cookie")]; const c = all.find((x) => x && x.startsWith(name + "=")); return c ? c.split(";")[0] : ""; };
  const start = async (next) => { const r = await auth(req("/api/nucleus/google/start" + (next ? "?next=" + encodeURIComponent(next) : ""))); const loc = new URL(r.headers.get("location")); return { r, loc, state: loc.searchParams.get("state"), sc: cookieOf(r, "nucleus_oauth") }; };
  const back = (st, code) => auth(req(`/api/nucleus/google/callback?code=${code}&state=${st.state}`, { cookie: st.sc }));
  let pendingCookie = "", fullCookie = "";
  await t("config says Google is on", async () => { eq((await jbody(await auth(req("/api/nucleus/config")))).j.google, true); });
  await t("start sends people to Google with state and the callback", async () => { const st = await start("/tools/motive/"); eq(st.r.status, 302); eq(st.loc.host, "accounts.google.com"); ok(st.loc.searchParams.get("redirect_uri").endsWith("/api/nucleus/google/callback")); ok(st.sc.length > 20); });
  await t("callback refuses a mismatched state", async () => { const st = await start(); const r = await auth(req(`/api/nucleus/google/callback?code=code-ashley&state=nope`, { cookie: st.sc })); ok(r.headers.get("location").includes("error=google_state")); });
  await t("callback refuses other domains", async () => { const st = await start(); const r = await back(st, "code-gmail"); ok(r.headers.get("location").includes("error=google_domain")); });
  await t("first time: pending session, asked for Pipedrive", async () => {
    const st = await start("/tools/motive/"); const r = await back(st, "code-ashley");
    eq(r.headers.get("location"), "/?next=" + encodeURIComponent("/tools/motive/")); pendingCookie = cookieOf(r);
    const { j } = await jbody(await auth(req("/api/nucleus/me", { cookie: pendingCookie }))); eq([j.pending, j.user.email], [true, "ashley.k@target3d.co.uk"]);
  });
  await t("a pending session can't open tools or call Pipedrive", async () => {
    eq((await gate.default(req("/tools/motive/", { cookie: pendingCookie }), { next: () => "NEXT" })).status, 302);
    eq((await pd(req("/api/nucleus/pd", { method: "POST", cookie: pendingCookie, body: { tool: "getOrganizations", input: {} } }))).status, 401);
  });
  await t("token-only login is refused once Google is on", async () => { const { status, j } = await jbody(await auth(req("/api/nucleus/login", { method: "POST", body: { token: GOOD } }))); eq(status, 401); eq(j.code, "google_required"); });
  await t("old token-only sessions stop working once Google is on", async () => { eq((await auth(req("/api/nucleus/me", { cookie }))).status, 401); });
  await t("connecting Pipedrive stores the token and signs in for 7 days", async () => {
    const r = await auth(req("/api/nucleus/login", { method: "POST", cookie: pendingCookie, body: { token: GOOD } })); const { j } = await jbody(r);
    eq(j.ok, true); eq(j.user.google.email, "ashley.k@target3d.co.uk"); eq(j.user.isAdmin, true); fullCookie = cookieOf(r); ok(/Max-Age=604800/.test(r.headers.get("set-cookie")));
    const store = JSON.parse(fs.readFileSync(process.env.NUCLEUS_LOCAL_STORE, "utf8")); const rec = store["users/1001"];
    ok(rec && rec.token && !JSON.stringify(rec).includes(GOOD), "stored, and encrypted"); eq(rec.pipedrive.name, "Ashley Keeler");
  });
  await t("signed-in Google session opens tools and runs as that person", async () => { eq(await gate.default(req("/tools/motive/", { cookie: fullCookie }), { next: () => "NEXT" }), "NEXT"); calls.length = 0; await pd(req("/api/nucleus/pd", { method: "POST", cookie: fullCookie, body: { tool: "getOrganizations", input: {} } })); eq(calls[0].token, GOOD); });
  await t("next time: Google alone signs straight in", async () => {
    const st = await start("/tools/sow-builder/"); calls.length = 0; const r = await back(st, "code-ashley");
    eq(r.headers.get("location"), "/tools/sow-builder/"); ok(calls.some((c) => c.path === "/v1/users/me" && c.token === GOOD), "stored token re-checked");
    const { j } = await jbody(await auth(req("/api/nucleus/me", { cookie: cookieOf(r) }))); eq([j.signedIn, j.user.pipedrive.name], [true, "Ashley Keeler"]);
  });
  await t("admins only: Performance Hub", async () => {
    eq(await gate.default(req("/tools/team-dashboards/performance-hub.html", { cookie: fullCookie }), { next: () => "NEXT" }), "NEXT");
    const st = await start(); const p = cookieOf(await back(st, "code-sam")); const r = await auth(req("/api/nucleus/login", { method: "POST", cookie: p, body: { token: GOOD } })); const sam = cookieOf(r);
    eq((await jbody(r)).j.user.isAdmin, false);
    eq((await gate.default(req("/tools/team-dashboards/performance-hub.html", { cookie: sam }), { next: () => "NEXT" })).status, 403);
    eq(await gate.default(req("/tools/team-dashboards/sales.html", { cookie: sam }), { next: () => "NEXT" }), "NEXT");
  });
  await t("a rejected stored token asks for a new one", async () => {
    const store = JSON.parse(fs.readFileSync(process.env.NUCLEUS_LOCAL_STORE, "utf8"));
    store["users/1001"].token = await session.seal({ t: "c".repeat(40), exp: Date.now() + 1e9 }); fs.writeFileSync(process.env.NUCLEUS_LOCAL_STORE, JSON.stringify(store));
    const st = await start(); const r = await back(st, "code-ashley"); const { j } = await jbody(await auth(req("/api/nucleus/me", { cookie: cookieOf(r) })));
    eq([j.pending, j.reason], [true, "token_rejected"]);
  });
  await t("forget removes the stored token", async () => {
    const r = await auth(req("/api/nucleus/pipedrive/forget", { method: "POST", cookie: fullCookie })); eq(r.status, 200);
    const store = JSON.parse(fs.readFileSync(process.env.NUCLEUS_LOCAL_STORE, "utf8")); ok(!store["users/1001"].token);
    eq((await jbody(await auth(req("/api/nucleus/me", { cookie: cookieOf(r) })))).j.pending, true);
  });
  delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET;
}

console.log("Team dashboards");
{
  const teamState = (await imp("netlify/functions/team-state.mjs")).default;
  const teamPd = (await imp("netlify/functions/team-pipedrive.mjs")).default;
  const lr = await auth(req("/api/nucleus/login", { method: "POST", body: { token: GOOD } }));
  const ck = lr.headers.get("set-cookie").split(";")[0];
  const post = (body) => teamState(req("/api/team/state", { method: "POST", cookie: ck, body }));
  await t("team Pipedrive proxy needs a session and is read-only", async () => {
    eq((await teamPd(req("/api/team/pipedrive?path=/deals"))).status, 401);
    eq((await teamPd(req("/api/team/pipedrive?path=/deals", { method: "POST", cookie: ck, body: {} }))).status, 405);
    eq((await teamPd(req("/api/team/pipedrive?path=/users/me/../../files", { cookie: ck }))).status, 403);
    calls.length = 0; const r = await teamPd(req("/api/team/pipedrive?path=/deals&status=all_not_deleted&api_token=evil", { cookie: ck })); eq(r.status, 200);
    eq(calls[0].token, GOOD); ok(!calls[0].search.includes("evil"));
  });
  await t("uses the shared read-only token when set", async () => { process.env.PIPEDRIVE_API_TOKEN = OTHER; calls.length = 0; await teamPd(req("/api/team/pipedrive?path=/deals", { cookie: ck })); eq(calls[0].token, OTHER); delete process.env.PIPEDRIVE_API_TOKEN; });
  process.env.NUCLEUS_ADMINS = "someone@else.com";
  await t("a team member edits their own KPIs and notes", async () => {
    eq((await post({ key: "kpi_actuals", patch: { ashley_0: 7 } })).status, 200);
    eq((await post({ key: "kpi_notes", patch: { "ashley_month_2026-11-01": "Good month" } })).status, 200);
  });
  await t("…but not someone else's, company figures or plan progress", async () => {
    eq((await post({ key: "kpi_actuals", patch: { allan_0: 1 } })).status, 403);
    eq((await post({ key: "kpi_actuals", patch: { co_rev: 1 } })).status, 403);
    eq((await post({ key: "milestones", patch: { 3: 50 } })).status, 403);
  });
  process.env.NUCLEUS_ADMINS = "ashley.k@target3d.co.uk";
  await t("an administrator can edit anything", async () => {
    eq((await post({ key: "kpi_actuals", patch: { allan_0: 3, co_rev: 1200000 } })).status, 200);
    eq((await post({ key: "milestones", patch: { 3: 50 } })).status, 200);
    eq((await post({ key: "kpi_notes", patch: { "allan_month_2026-11-01": "Private to Allan" } })).status, 200);
  });
  process.env.NUCLEUS_ADMINS = "someone@else.com";
  await t("a team member reads company figures, plan progress and only their own entries", async () => {
    const { j } = await jbody(await teamState(req("/api/team/state", { cookie: ck })));
    eq(j.me, "ashley"); eq(j.isAdmin, false); eq(j.kpi_actuals, { ashley_0: 7, co_rev: 1200000 }); eq(Object.keys(j.kpi_notes), ["ashley_month_2026-11-01"]); eq(j.milestones, { 3: 50 });
  });
  await t("null removes an entry", async () => { await post({ key: "kpi_actuals", patch: { ashley_0: null } }); const { j } = await jbody(await teamState(req("/api/team/state", { cookie: ck }))); ok(!("ashley_0" in j.kpi_actuals)); });
  delete process.env.NUCLEUS_ADMINS;
}

console.log("Gate");
await t("redirects to sign-in without a session", async () => { const r = await gate.default(new Request(U("/tools/motive/?x=1")), { next: () => "NEXT" }); eq(r.status, 302); eq(r.headers.get("location"), "/?next=" + encodeURIComponent("/tools/motive/?x=1")); });
await t("lets a signed-in person through", async () => { eq(await gate.default(req("/tools/motive/", { cookie }), { next: () => "NEXT" }), "NEXT"); });
await t("viewer.html stays public", async () => { ok(gate.config.excludedPath.includes("/tools/system-designer/viewer.html")); });

console.log("Pipedrive proxy (claude-shim)");
const call = (tool, input, c = cookie) => pd(req("/api/nucleus/pd", { method: "POST", cookie: c, body: { tool, input } }));
await t("401 needs_reauth without a session", async () => { const { status, j } = await jbody(await call("getOrganizations", {}, "")); eq(status, 401); eq(j.code, "needs_reauth"); });
await t("getOrganizations: arrays become comma lists, runs with the person's token", async () => {
  calls.length = 0; const { j } = await jbody(await call("getOrganizations", { limit: 500, custom_fields: ["abc"], include_fields: ["people_count", "won_deals_count"] }));
  eq(j.payload.data.length, 5); const c = calls[0]; eq(c.token, GOOD); ok(c.search.includes("include_fields=people_count%2Cwon_deals_count"), c.search);
});
await t("getDeals open+won+lost drops the status filter", async () => { calls.length = 0; await call("getDeals", { org_id: 12, status: ["open", "won", "lost"] }); ok(!calls[0].search.includes("status"), calls[0].search); });
await t("updateLead goes to v1 PATCH, updateNote to v1 PUT", async () => {
  calls.length = 0; await call("updateLead", { id: "abc-123", organization_id: 11 }).catch(() => {}); await call("updateNote", { id: 4, org_id: 11 });
  eq([calls[0].method, calls[0].path], ["PATCH", "/v1/leads/abc-123"]); eq([calls[1].method, calls[1].path], ["PUT", "/v1/notes/4"]); eq(calls[1].body, { org_id: 11 });
});
await t("updateOrganization PATCHes v2 without the id in the body", async () => { calls.length = 0; await call("updateOrganization", { id: 12, name: "zz MERGED" }); eq(calls[0].method, "PATCH"); eq(calls[0].body, { name: "zz MERGED" }); });
await t("unknown tools are refused", async () => { const { status, j } = await jbody(await call("deleteEverything", {})); eq(status, 400); eq(j.code, "not_in_manifest"); });
await t("bad ids are refused", async () => { const { status } = await jbody(await call("getOrganization", { id: "../users" })); eq(status, 400); });
await t("getAccountContext mirrors the connector's shape", async () => {
  const { j } = await jbody(await call("getAccountContext", {})); const dep = j.payload.custom_fields.person.find((f) => f.field_name === "Department");
  ok(dep && dep.is_custom_field && dep.is_writable && dep.field_type === "varchar"); eq(j.payload.pipelines[0].stages[0].name, "Qualified");
});
await t("users endpoint returns colleague names", async () => { const { j } = await jbody(await users(req("/api/nucleus/users?ids=9,7", { cookie }))); eq(j.profiles["9"].name, "Lana Smith"); });
await t("pulse returns figures", async () => { const { j } = await jbody(await pulse(req("/api/nucleus/pulse", { cookie }))); eq([j.myOpenDeals, j.myActivitiesDue, j.teamOpenValue], [12, 3, "£1,204,950"]); });

console.log("Shared store");
const st = (body) => store(req("/api/nucleus/store", { method: "POST", cookie, body }));
await t("refuses without a session", async () => { eq((await store(req("/api/nucleus/store?ns=merge-desk&collection=decisions"))).status, 401); });
await t("set, get, update, list, delete", async () => {
  await st({ ns: "merge-desk", doc: "decisions/g-11-12", op: "set", data: { status: "approved", by: 7 } });
  await st({ ns: "merge-desk", doc: "decisions/g-21-22", op: "set", data: { status: "dismissed" } });
  await st({ ns: "merge-desk", doc: "decisions/g-11-12", op: "update", data: { name: "University of Leeds" } });
  const one = (await jbody(await store(req("/api/nucleus/store?ns=merge-desk&doc=decisions/g-11-12", { cookie })))).j;
  eq(one, { exists: true, data: { status: "approved", by: 7, name: "University of Leeds" } });
  let list = (await jbody(await store(req("/api/nucleus/store?ns=merge-desk&collection=decisions", { cookie })))).j;
  eq(list.docs.length, 2);
  await st({ ns: "merge-desk", doc: "decisions/g-21-22", op: "delete" });
  list = (await jbody(await store(req("/api/nucleus/store?ns=merge-desk&collection=decisions", { cookie })))).j;
  eq(list.docs.map((d) => d.id), ["g-11-12"]);
});
await t("namespaces don't leak", async () => { const l = (await jbody(await store(req("/api/nucleus/store?ns=other-tool&collection=decisions", { cookie })))).j; eq(l.docs.length, 0); });
await t("rejects path tricks", async () => { eq((await st({ ns: "merge-desk", doc: "../x/y", op: "set", data: {} })).status, 400); eq((await st({ ns: "Merge Desk", doc: "a/b", op: "set", data: {} })).status, 400); });

console.log("System Designer functions");
const ev = (q, c) => ({ httpMethod: "GET", headers: c ? { cookie: c } : {}, queryStringParameters: q, body: null });
await t("pipedrive-find without session is 401", async () => { eq((await find(ev({ type: "deal", term: "leeds" }))).statusCode, 401); });
await t("pipedrive-find runs with the person's token", async () => { calls.length = 0; const r = await find(ev({ type: "deal", term: "leeds" }, cookie)); eq(r.statusCode, 200); eq(calls[0].token, GOOD); eq(JSON.parse(r.body).items[0].item.id, 901); });
await t("pipedrive-search-deals works", async () => { const r = await searchDeals(ev({ term: "leeds" }, cookie)); eq(r.statusCode, 200); eq(JSON.parse(r.body).deals[0].id, 901); });

console.log("Motive functions");
await t("health needs a session", async () => { eq((await mHealth(req("/api/motive/health"))).status, 401); const { j } = await jbody(await mHealth(req("/api/motive/health", { cookie }))); eq([j.ok, j.user], [true, "Ashley Keeler"]); });
await t("state saves and reads", async () => {
  eq((await mState(req("/api/motive/state", { method: "POST", cookie, body: { collection: "campaign", id: "org-11", op: "set", data: { stage: "Contacted" } } }))).status, 200);
  const { j } = await jbody(await mState(req("/api/motive/state?collections=campaign", { cookie }))); eq(j.collections.campaign["org-11"].stage, "Contacted");
});
await t("motive pipedrive runs with the person's token", async () => { calls.length = 0; const { status } = await jbody(await mPd(req("/api/motive/pipedrive", { method: "POST", cookie, body: { tool: "getUsers" } }))); eq(status, 200); eq(calls[0].token, GOOD); });

console.log("Support dashboard sources");
const gm = (body, c = cookie) => gmail(req("/api/nucleus/gmail", { method: "POST", cookie: c, body }));
await t("support tickets: pipeline 2 deals with include_fields", async () => { calls.length = 0; const { j } = await jbody(await call("getDeals", { pipeline_id: 2, include_fields: ["last_incoming_mail_time", "email_messages_count"], custom_fields: ["d496e5747c93a62edf3c7240eff53c8a4bf2a232"], limit: 500 })); eq(j.payload.data.length, 4); ok(calls[0].search.includes("include_fields=last_incoming_mail_time%2Cemail_messages_count")); });
await t("support stages: pipeline 2 only", async () => { const { j } = await jbody(await call("getStages", { pipeline_id: 2, sort_by: "order_nr" })); eq(j.payload.data.map((x) => x.id), [10, 196, 11]); });
await t("gmail needs a session", async () => { eq((await gm({ tool: "search_threads" }, "")).status, 401); });
await t("gmail says not_configured until an admin connects it", async () => { const { status, j } = await jbody(await gm({ tool: "search_threads", input: { pageSize: 50 } })); eq(status, 503); eq(j.code, "not_configured"); });
await t("gmail via Apps Script, query fixed on the server", async () => {
  process.env.SUPPORT_GMAIL_APPS_SCRIPT_URL = "https://script.google.com/macros/s/x/exec"; process.env.SUPPORT_GMAIL_APPS_SCRIPT_TOKEN = "gmail-token";
  calls.length = 0; const { status, j } = await jbody(await gm({ tool: "search_threads", input: { pageSize: 50, query: "from:boss" } }));
  eq(status, 200); eq(j.payload.threads.length, 2); const q = new URLSearchParams(calls[0].search).get("q"); ok(q.includes("support@target3d.co.uk") && !q.includes("boss"), q);
  process.env.SUPPORT_GMAIL_APPS_SCRIPT_TOKEN = "wrong"; const bad = await jbody(await gm({ tool: "search_threads" })); eq(bad.status, 502); ok(/refused/.test(bad.j.message));
  delete process.env.SUPPORT_GMAIL_APPS_SCRIPT_URL; delete process.env.SUPPORT_GMAIL_APPS_SCRIPT_TOKEN;
});
await t("gmail refuses other tools", async () => { eq((await gm({ tool: "send_message" })).status, 400); });

console.log("Sales Hub");
{
  const sh = (await imp("netlify/functions/sales-hub-pipedrive.mjs")).default;
  const mk = async (email, extra = {}) => "nucleus_s=" + await session.seal({ t: GOOD, uid: 7, e: email, c: "target3d2", exp: Date.now() + 1e9, ...extra });
  const allan = await mk("allan.r@target3d.co.uk"), outsider = await mk("sam@atomicorbital.co.uk");
  process.env.NUCLEUS_ADMINS = "ashley.k@target3d.co.uk";
  await t("Sales Hub pages: listed people in, others refused, admins in", async () => {
    eq(await gate.default(req("/tools/sales-hub/pipeline-triage.html", { cookie: allan }), { next: () => "NEXT" }), "NEXT");
    eq(await gate.default(req("/tools/sales-hub", { cookie: allan }), { next: () => "NEXT" }), "NEXT");
    eq((await gate.default(req("/tools/sales-hub/", { cookie: outsider }), { next: () => "NEXT" })).status, 403);
    process.env.NUCLEUS_ADMINS = "sam@atomicorbital.co.uk";
    eq(await gate.default(req("/tools/sales-hub/", { cookie: outsider }), { next: () => "NEXT" }), "NEXT");
    process.env.NUCLEUS_ADMINS = "ashley.k@target3d.co.uk";
    process.env.NUCLEUS_SALES_HUB_USERS = "sam@atomicorbital.co.uk";
    eq((await gate.default(req("/tools/sales-hub/", { cookie: allan }), { next: () => "NEXT" })).status, 403, "list comes from the setting");
    delete process.env.NUCLEUS_SALES_HUB_USERS;
  });
  await t("/me says who can see the Sales Hub", async () => {
    eq((await jbody(await auth(req("/api/nucleus/me", { cookie: allan })))).j.user.salesHub, true);
    eq((await jbody(await auth(req("/api/nucleus/me", { cookie: outsider })))).j.user.salesHub, false);
  });
  await t("Sales Hub proxy: reads with the shared token, refuses outsiders and other paths", async () => {
    eq((await sh(req("/api/sales-hub/pipedrive?path=/deals"))).status, 401);
    eq((await sh(req("/api/sales-hub/pipedrive?path=/deals", { cookie: outsider }))).status, 403);
    eq((await sh(req("/api/sales-hub/pipedrive?path=/persons", { cookie: allan }))).status, 403);
    process.env.PIPEDRIVE_API_TOKEN = OTHER; calls.length = 0;
    eq((await sh(req("/api/sales-hub/pipedrive?path=/deals&status=open&api_token=evil", { cookie: allan }))).status, 200);
    eq(calls[0].token, OTHER); ok(!calls[0].search.includes("evil"));
  });
  await t("Sales Hub proxy: only a deal's probability can be changed, as the person", async () => {
    calls.length = 0;
    eq((await sh(req("/api/sales-hub/pipedrive?path=/deals/3001", { method: "PUT", cookie: allan, body: { probability: 60 } }))).status, 200);
    eq([calls[0].method, calls[0].token], ["PUT", GOOD]);
    eq((await sh(req("/api/sales-hub/pipedrive?path=/deals/3001", { method: "PUT", cookie: allan, body: { probability: 60, value: 1 } }))).status, 403);
    eq((await sh(req("/api/sales-hub/pipedrive?path=/deals/3001", { method: "PUT", cookie: allan, body: { probability: 300 } }))).status, 400);
    eq((await sh(req("/api/sales-hub/pipedrive?path=/stages/1", { method: "PUT", cookie: allan, body: { probability: 5 } }))).status, 403);
    eq((await sh(req("/api/sales-hub/pipedrive?path=/deals/3001", { method: "DELETE", cookie: allan }))).status, 405);
    delete process.env.PIPEDRIVE_API_TOKEN;
  });
  await t("Sales Hub settings in the store are for Sales Hub people only", async () => {
    const body = { ns: "sales-hub", doc: "settings/pipeline-bucket-overrides", op: "set", data: { overrides: { 3001: "HOT" } } };
    eq((await store(req("/api/nucleus/store", { method: "POST", cookie: outsider, body }))).status, 403);
    eq((await store(req("/api/nucleus/store", { method: "POST", cookie: allan, body }))).status, 200);
    eq((await jbody(await store(req("/api/nucleus/store?ns=sales-hub&doc=settings/pipeline-bucket-overrides", { cookie: allan })))).j.data.overrides["3001"], "HOT");
    eq((await store(req("/api/nucleus/store?ns=sales-hub&doc=settings/pipeline-bucket-overrides", { cookie: outsider }))).status, 403);
  });
}

console.log("Pages");
const pub =(p) => fs.readFileSync(path.join(root, "public", p), "utf8");
await t("merge desk loads the shim before its own script", async () => { const s = pub("tools/duplicate-eraser/index.html"); ok(s.indexOf("/nucleus/claude-shim.js") > 0 && s.indexOf("/nucleus/claude-shim.js") < s.indexOf('const VERSION = "1.3.0"')); });
await t("motive page uses namespaced API", async () => { const s = pub("tools/motive/index.html"); ok(s.includes('fetch("/api/motive/health"') && s.includes('fetch("/api/motive/" + path')); });
await t("system designer allows Nucleus hosts", async () => { ok(pub("tools/system-designer/index.html").includes("T3D_NUCLEUS_HOSTS=['atomic-orbital.netlify.app'")); });
await t("every tool and project page wears the Atomic Orbital skin, with no Google Fonts", async () => {
  const src = pub("nucleus/registry.js"); const w = {}; new Function("window", src)(w);
  for (const i of w.NUCLEUS_REGISTRY.items) if (i.status === "live") {
    const html = pub(i.href.replace(/^\//, "") + (i.href.endsWith(".html") ? "" : "index.html"));
    ok(!/fonts\.googleapis\.com/.test(html), i.id + " still loads Google Fonts");
    ok(html.includes("<!-- ao-skin -->") || html.includes("/brand/css/atomic-orbital.css"), i.id + " has no Atomic Orbital styling");
  }
});
await t("Target3D header logos are replaced in the project sites", async () => {
  for (const id of ["clays", "lle", "drift"]) { const h = pub("projects/" + id + "/index.html"); ok(h.includes('class="ao-logo-on-light"') && !/<a class="logo"[^>]*><img src="data:/.test(h), id); }
});
await t("Sales Hub pages have no Firebase or CDN left and load the Nucleus shell", async () => {
  for (const n of ["revenue-scoreboard", "pipeline-triage", "sales-report", "weekly-pulse", "weekly-deals-report", "supplier-forecast"]) {
    const h = pub("tools/sales-hub/" + n + ".html");
    ok(!/firebase|auth-guard|\.netlify\/functions|cdnjs/.test(h), n);
    ok(h.includes('<script src="hub.js"></script>') && h.includes("const PD_PROXY = '/api/sales-hub/pipedrive'"), n);
  }
  ok(pub("tools/sales-hub/pipeline-triage.html").includes("SalesHubStore.get('settings/pipeline-bucket-overrides')"));
});
await t("every live registry entry has an index.html", async () => {
  const src = pub("nucleus/registry.js"); const w = {}; new Function("window", src)(w);
  for (const i of w.NUCLEUS_REGISTRY.items) if (i.status === "live") ok(fs.existsSync(path.join(root, "public", i.href, i.href.endsWith(".html") ? "" : "index.html")), i.href);
});

for (const f of [process.env.NUCLEUS_LOCAL_STORE, process.env.MUP_LOCAL_STORE]) try { fs.unlinkSync(f); } catch (e) {}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
