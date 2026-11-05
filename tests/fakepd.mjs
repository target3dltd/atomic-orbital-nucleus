// A small fake Pipedrive for tests. Token GOOD signs in to company target3d2; OTHER belongs to another company.
export const GOOD = "a".repeat(40), OTHER = "b".repeat(40);
export const calls = [];
const H = "0123456789abcdef0123456789abcdef01234567"; // a custom field key

const orgs = [
  { id: 11, name: "University of Leeds", people_count: 4, open_deals_count: 1, closed_deals_count: 3, won_deals_count: 2, activities_count: 5, notes_count: 2, add_time: "2019-03-01", custom_fields: {}, label_ids: [] },
  { id: 12, name: "Leeds University - School of Mechanical Engineering", people_count: 2, open_deals_count: 0, closed_deals_count: 1, won_deals_count: 1, activities_count: 1, notes_count: 0, add_time: "2022-06-01", custom_fields: {}, label_ids: [] },
  { id: 21, name: "UCL", people_count: 1, open_deals_count: 1, closed_deals_count: 0, won_deals_count: 0, activities_count: 0, notes_count: 0, add_time: "2023-01-01", custom_fields: {}, label_ids: [] },
  { id: 22, name: "University College London", people_count: 3, open_deals_count: 0, closed_deals_count: 2, won_deals_count: 2, activities_count: 2, notes_count: 1, add_time: "2018-01-01", custom_fields: {}, label_ids: [] },
  { id: 31, name: "Acme Motion Ltd", people_count: 1, open_deals_count: 1, closed_deals_count: 0, won_deals_count: 0, activities_count: 0, notes_count: 0, add_time: "2024-01-01", custom_fields: {}, label_ids: [] },
];
const persons = [{ id: 501, name: "Dr Jo Bloggs", org_id: 12, emails: [{ value: "j.bloggs@leeds.ac.uk" }], custom_fields: {} }];
const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString().replace(/\.\d+Z$/, "Z");
const deals = [
  { id: 901, title: "Leeds MechEng mocap", org_id: 12, status: "won", pipeline_id: 1, custom_fields: {} },
  { id: 3001, title: "3001 - Prime x22 not syncing", pipeline_id: 2, stage_id: 10, status: "open", add_time: iso(20), update_time: iso(16), last_incoming_mail_time: iso(3), last_outgoing_mail_time: iso(5), email_messages_count: 6, undone_activities_count: 1, channel_id: "WebForms", custom_fields: { d496e5747c93a62edf3c7240eff53c8a4bf2a232: "Cameras drop out of sync after an hour" } },
  { id: 3002, title: "3002 - Motive licence won't activate", pipeline_id: 2, stage_id: 11, status: "open", add_time: iso(9), update_time: iso(1), last_incoming_mail_time: iso(4), last_outgoing_mail_time: iso(1), email_messages_count: 3, undone_activities_count: 0, channel_id: "ManuallyCreated", custom_fields: {} },
  { id: 3003, title: "3003 - Return PrimeX 41 for repair", pipeline_id: 2, stage_id: 196, status: "open", add_time: iso(40), update_time: iso(2), email_messages_count: 2, undone_activities_count: 2, custom_fields: {} },
  { id: 3004, title: "3004 - Suit sizing question", pipeline_id: 2, stage_id: 10, status: "won", add_time: iso(70), update_time: iso(12), close_time: iso(12), email_messages_count: 4, custom_fields: {} },
];

const ok = (data, extra = {}) => new Response(JSON.stringify({ success: true, data, ...extra }), { status: 200, headers: { "content-type": "application/json" } });
const bad = (status, error) => new Response(JSON.stringify({ success: false, error }), { status, headers: { "content-type": "application/json" } });

export function installFakePipedrive() {
  const real = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "oauth2.googleapis.com") {
      const form = new URLSearchParams(init.body || "");
      calls.push({ method: "POST", path: "google-token", code: form.get("code") });
      const people = {
        "code-ashley": { sub: "1001", email: "ashley.k@target3d.co.uk", hd: "target3d.co.uk", name: "Ashley Keeler" },
        "code-sam": { sub: "1002", email: "sam@atomicorbital.co.uk", hd: "atomicorbital.co.uk", name: "Sam Kaighin" },
        "code-gmail": { sub: "1003", email: "someone@gmail.com", name: "Someone" },
      };
      const p = people[form.get("code")];
      if (!p) return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
      const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
      const id = [b64({ alg: "RS256" }), b64({ iss: "https://accounts.google.com", aud: form.get("client_id"), email_verified: true, ...p }), "sig"].join(".");
      return new Response(JSON.stringify({ id_token: id, access_token: "x" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.hostname === "script.google.com") {
      calls.push({ method: "GET", path: "apps-script", search: url.search });
      if (url.searchParams.get("token") !== "gmail-token") return new Response(JSON.stringify({ error: "bad token" }), { status: 200 });
      return new Response(JSON.stringify({ threads: [
        { id: "t1", messageCount: 2, viewUrl: "https://mail.google.com/mail/u/0/#all/t1", messages: [{ subject: "Licence help", date: iso(3), sender: "lab@uni.ac.uk", labelIds: [] }, { subject: "Re: Licence help", date: iso(1), sender: "client@uni.ac.uk", labelIds: ["UNREAD"] }] },
        { id: "t2", messageCount: 2, viewUrl: "https://mail.google.com/mail/u/0/#all/t2", messages: [{ subject: "RMA 41", date: iso(6), sender: "x@studio.com", labelIds: [] }, { subject: "Re: RMA 41", date: iso(2), sender: "lana@target3d.co.uk", labelIds: [] }] },
      ] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.hostname !== "api.pipedrive.com") return real(input, init);
    const hdrs = new Headers(init.headers || {});
    const token = hdrs.get("x-api-token") || url.searchParams.get("api_token");
    const method = (init.method || "GET").toUpperCase();
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method, path: url.pathname, search: url.search, token, body });
    if (token !== GOOD && token !== OTHER) return bad(401, "unauthorized access");
    const p = url.pathname;
    if (p === "/v1/users/me") return ok(token === GOOD
      ? { id: 7, name: "Ashley Keeler", email: "ashley.k@target3d.co.uk", company_id: 555, company_domain: "target3d2", company_name: "Target3D", active_flag: true }
      : { id: 8, name: "Someone Else", email: "x@else.com", company_id: 999, company_domain: "elsewhere", company_name: "Elsewhere Ltd", active_flag: true });
    if (p === "/v1/users") return ok([{ id: 7, name: "Ashley Keeler" }, { id: 9, name: "Lana Smith" }]);
    if (p === "/v1/deals/summary") return ok({ total_count: url.searchParams.get("user_id") ? 12 : 87, total_currency_converted_value_formatted: url.searchParams.get("user_id") ? "£148,200" : "£1,204,950" });
    if (p === "/v1/activities") return ok([{ id: 1 }, { id: 2 }, { id: 3 }]);
    if (p === "/api/v2/organizations" && method === "GET") return ok(orgs, { additional_data: { next_cursor: null } });
    let m;
    if ((m = p.match(/^\/api\/v2\/organizations\/(\d+)$/))) {
      const o = orgs.find((x) => x.id === +m[1]); if (!o) return bad(404, "not found");
      if (method === "PATCH") Object.assign(o, body);
      return ok(o);
    }
    if (p === "/api/v2/persons") return ok(persons.filter((x) => !url.searchParams.get("org_id") || x.org_id === +url.searchParams.get("org_id")), { additional_data: { next_cursor: null } });
    if ((m = p.match(/^\/api\/v2\/persons\/(\d+)$/)) && method === "PATCH") { const x = persons.find((y) => y.id === +m[1]); Object.assign(x, body); return ok(x); }
    if (p === "/api/v2/deals") return ok(deals.filter((x) => (!url.searchParams.get("org_id") || x.org_id === +url.searchParams.get("org_id")) && (!url.searchParams.get("pipeline_id") || x.pipeline_id === +url.searchParams.get("pipeline_id"))), { additional_data: { next_cursor: null } });
    if ((m = p.match(/^\/api\/v2\/deals\/(\d+)$/)) && method === "PATCH") { const x = deals.find((y) => y.id === +m[1]); Object.assign(x, body); return ok(x); }
    if (p === "/api/v2/activities") return ok([], { additional_data: { next_cursor: null } });
    if (p === "/v1/deals") {
      const owners = [["Allan Rankin", 1], ["Ashley Keeler", 7], ["Jack Weston", 3], ["Ryan Mercier", 4]];
      const v1 = Array.from({ length: 40 }, (_, i) => { const o = owners[i % 4], won = i % 3 === 0, d = iso(i * 6); return { id: 5000 + i, title: "Deal " + (i + 1), value: 2000 + i * 1750, currency: "GBP", status: won ? "won" : i % 7 === 0 ? "lost" : "open", user_id: { id: o[1], name: o[0] }, owner_name: o[0], stage_id: 1, pipeline_id: 1, add_time: d.replace("T", " ").slice(0, 19), update_time: d.replace("T", " ").slice(0, 19), won_time: won ? d.replace("T", " ").slice(0, 19) : null, activities_count: i % 4 }; });
      return ok(v1, { additional_data: { pagination: { more_items_in_collection: false } } });
    }
    if (p === "/v1/stages" || p === "/v1/pipelines") return ok([{ id: 1, name: "Qualified", pipeline_id: 1, order_nr: 1 }]);
    if (p === "/v1/leads" || (p === "/v1/notes" && method === "GET")) return ok([], { additional_data: { pagination: { more_items_in_collection: false } } });
    if (p === "/v1/notes" && method === "POST") return ok({ id: 4242 });
    if (/^\/v1\/(deal|person|organization|activity|product)Fields$/.test(p)) {
      const kind = p.match(/v1\/(\w+)Fields/)[1];
      const f = [{ key: "name", name: "Name", field_type: "varchar" }];
      if (kind === "person") f.push({ key: H, name: "Department", field_type: "varchar", edit_flag: true });
      if (kind === "deal") f.push({ key: H.replace("0", "1"), name: "Client Department", field_type: "varchar", edit_flag: true });
      return ok(f, { additional_data: { pagination: { more_items_in_collection: false } } });
    }
    if (p === "/api/v2/pipelines") return ok([{ id: 1, name: "UK Tech Sales" }]);
    if (p === "/api/v2/stages") {
      const all = [{ id: 1, name: "Qualified", pipeline_id: 1, order_nr: 1 }, { id: 10, name: "New ticket", pipeline_id: 2, order_nr: 1 }, { id: 196, name: "RMA – In progress", pipeline_id: 2, order_nr: 2 }, { id: 11, name: "Support complete – For review", pipeline_id: 2, order_nr: 3 }];
      const pid = url.searchParams.get("pipeline_id"); return ok(all.filter((x) => !pid || x.pipeline_id === +pid));
    }
    if (p === "/api/v2/deals/search") return ok({ items: [{ item: { id: 901, title: "Leeds MechEng mocap", organization: { name: "University of Leeds" }, stage: { name: "Won" }, status: "won" } }] });
    if (p === "/v1/deals/search") return ok({ items: [{ item: { id: 901, title: "Leeds MechEng mocap", organization: { name: "University of Leeds" }, status: "won", value: 1000, currency: "GBP" } }] });
    if ((m = p.match(/^\/v1\/deals\/(\d+)$/))) return ok({ id: +m[1], title: "Leeds MechEng mocap", org_name: "University of Leeds", stage: { name: "Won" }, status: "won" });
    if (p === "/api/v2/deals" && method === "POST") return ok({ id: 999 });
    return bad(404, "fake pipedrive: no route for " + method + " " + p);
  };
}
