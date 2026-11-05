// POST /api/nucleus/gmail { tool: "search_threads", input: { pageSize } } → { payload: { threads: [...] } }
// The support@ inbox for the Support dashboard. Signed-in people only.
// The Gmail search is fixed here on the server (SUPPORT_GMAIL_QUERY), so the page can't be used to read other mail.
// Two ways to connect, set in Netlify environment variables:
//   A) SUPPORT_GMAIL_APPS_SCRIPT_URL + SUPPORT_GMAIL_APPS_SCRIPT_TOKEN: the Apps Script in
//      netlify/lib/support/support-gmail-apps-script.gs, deployed by someone who receives support@ mail.
//   B) GOOGLE_SERVICE_ACCOUNT_JSON + SUPPORT_GMAIL_USER: a service account with Google Workspace
//      domain-wide delegation for https://www.googleapis.com/auth/gmail.readonly, reading SUPPORT_GMAIL_USER's mailbox.
// Each thread: { id, messageCount, viewUrl, messages: [{ subject, date (ISO), sender (address), labelIds }] }
import crypto from "node:crypto";
import { sessionFrom, envGet, jsonResponse as json } from "../lib/session.mjs";

export const DEFAULT_QUERY = '(to:support@target3d.co.uk OR cc:support@target3d.co.uk OR deliveredto:support@target3d.co.uk) newer_than:120d -subject:"Out of Office"';
const addr = (from) => { const m = String(from || "").match(/<([^>]+)>/); return (m ? m[1] : String(from || "")).trim().toLowerCase(); };

export default async (req) => {
  let s;
  try { s = await sessionFrom(req); } catch (e) { return json({ code: "server_unavailable", message: e.message }, 503); }
  if (!s) return json({ code: "needs_reauth", message: "Sign in to the Nucleus first." }, 401);
  if (req.method !== "POST") return json({ code: "bad_request", message: "POST only" }, 405);
  let body = {}; try { body = await req.json(); } catch (e) {}
  if (body.tool && body.tool !== "search_threads") return json({ code: "not_in_manifest", message: "Only search_threads is offered." }, 400);
  const max = Math.max(1, Math.min(100, Number(body.input && body.input.pageSize) || 50));
  const query = envGet("SUPPORT_GMAIL_QUERY", DEFAULT_QUERY);

  try {
    const script = envGet("SUPPORT_GMAIL_APPS_SCRIPT_URL");
    if (script) {
      const u = new URL(script.trim());
      u.searchParams.set("token", envGet("SUPPORT_GMAIL_APPS_SCRIPT_TOKEN").trim().replace(/^['"‘’“”]+|['"‘’“”]+$/g, ""));
      u.searchParams.set("q", query); u.searchParams.set("max", String(max));
      const r = await fetch(u, { redirect: "follow" });
      const text = await r.text();
      if (!r.ok || /^\s*</.test(text)) throw new Error("The support@ Apps Script didn't answer (" + r.status + "). Check it's deployed as a web app with access “Anyone”.");
      const j = JSON.parse(text);
      if (j.error) throw new Error("The support@ Apps Script refused: " + j.error);
      return json({ payload: { threads: j.threads || [] }, source: "apps_script" });
    }
    const saRaw = envGet("GOOGLE_SERVICE_ACCOUNT_JSON"), user = envGet("SUPPORT_GMAIL_USER");
    if (saRaw && user) {
      const sa = JSON.parse(saRaw.trim().startsWith("{") ? saRaw : Buffer.from(saRaw, "base64").toString("utf8"));
      const token = await delegatedToken(sa, user);
      const G = "https://gmail.googleapis.com/gmail/v1/users/me";
      const h = { authorization: "Bearer " + token };
      const lr = await fetch(`${G}/threads?maxResults=${max}&q=${encodeURIComponent(query)}`, { headers: h });
      const lj = await lr.json();
      if (!lr.ok) throw new Error("Gmail: " + ((lj.error && lj.error.message) || lr.status));
      const threads = await Promise.all((lj.threads || []).map(async (t) => {
        const r = await fetch(`${G}/threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, { headers: h });
        const j = await r.json();
        const messages = (j.messages || []).map((m) => {
          const hd = Object.fromEntries(((m.payload && m.payload.headers) || []).map((x) => [x.name.toLowerCase(), x.value]));
          return { subject: hd.subject || "", date: new Date(Number(m.internalDate) || Date.parse(hd.date)).toISOString(), sender: addr(hd.from), labelIds: m.labelIds || [] };
        });
        return { id: t.id, messageCount: messages.length, viewUrl: `https://mail.google.com/mail/u/0/#all/${t.id}`, messages };
      }));
      return json({ payload: { threads }, source: "service_account" });
    }
    return json({ code: "not_configured", message: "The support@ inbox isn't connected to the Nucleus yet. An administrator needs to set it up (README → Support dashboard)." }, 503);
  } catch (e) {
    return json({ code: "tool_error", message: String(e.message || e) }, 502);
  }
};

let cache = null;
async function delegatedToken(sa, subject) {
  if (cache && cache.sub === subject && cache.exp > Date.now() + 60000) return cache.token;
  const now = Math.floor(Date.now() / 1000);
  const b64u = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
  const unsigned = b64u({ alg: "RS256", typ: "JWT" }) + "." + b64u({ iss: sa.client_email, sub: subject, scope: "https://www.googleapis.com/auth/gmail.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(sa.private_key).toString("base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: unsigned + "." + sig }) });
  const j = await r.json();
  if (!r.ok) throw new Error("Google sign-in for the support@ mailbox failed: " + (j.error_description || j.error || r.status) + ". Check domain-wide delegation for gmail.readonly.");
  cache = { sub: subject, token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cache.token;
}

export const config = { path: "/api/nucleus/gmail" };
