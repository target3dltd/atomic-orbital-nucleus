// Serves Lana's serials sheet as CSV (base64) to the planner.
// 1) GOOGLE_SERVICE_ACCOUNT_JSON set: reads the live sheet through the Google Drive API (share the sheet with the service account's email, Viewer).
// 2) else SHEET_APPS_SCRIPT_URL set: calls the small Apps Script in google-apps-script.gs (private sheet, secret token).
// 3) else SHEET_CSV_URL set: fetches a "Publish to web" CSV link.
// 4) else: serves the snapshot bundled at deploy time.
import crypto from "node:crypto";
import { guard, json, fail, env } from "../lib/motive/lib.mjs";
import { SNAPSHOT_B64, SNAPSHOT_AT } from "../lib/motive/snapshot.mjs";

const SHEET_ID = "1XsO5ev1KNDBu_4xVzIbg8ff-rZWAJIm3Ytk_thnakao";
let tokenCache = null;

async function googleToken(sa) {
  if (tokenCache && tokenCache.exp > Date.now() + 60000) return tokenCache.token;
  const now = Math.floor(Date.now() / 1000);
  const b64u = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
  const unsigned = b64u({ alg: "RS256", typ: "JWT" }) + "." + b64u({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/drive.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(sa.private_key).toString("base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: unsigned + "." + sig }) });
  const j = await r.json();
  if (!r.ok) throw new Error("Google sign-in failed: " + (j.error_description || j.error || r.status));
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenCache.token;
}

export default async (req) => {
  const g = await guard(req); if (g) return g;
  try {
    const saRaw = env("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (saRaw) {
      const sa = JSON.parse(saRaw.trim().startsWith("{") ? saRaw : Buffer.from(saRaw, "base64").toString("utf8"));
      const token = await googleToken(sa);
      const id = env("SHEET_ID", SHEET_ID);
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/csv`, { headers: { authorization: "Bearer " + token } });
      if (!r.ok) throw new Error("Google Drive returned " + r.status + (r.status === 404 ? " (share the sheet with the service account email)" : ""));
      const buf = Buffer.from(await r.arrayBuffer());
      return json({ content: buf.toString("base64"), storedAt: Date.now(), source: "google" });
    }
    const script = env("SHEET_APPS_SCRIPT_URL");
    if (script) {
      // tolerate stray spaces or quote marks pasted around the token
      const token = env("SHEET_APPS_SCRIPT_TOKEN").trim().replace(/^['"‘’“”]+|['"‘’“”]+$/g, "").trim();
      const u = new URL(script.trim()); if (token) u.searchParams.set("token", token);
      const r = await fetch(u, { redirect: "follow" });
      const text = await r.text();
      if (!r.ok || /^<!doctype html|<html/i.test(text.trim())) throw new Error("The Apps Script link didn't return the sheet (" + r.status + "). Check it is deployed with access 'Anyone' and the token matches.");
      if (/^ERROR:/i.test(text)) throw new Error("The sheet script refused the token: check SHEET_APPS_SCRIPT_TOKEN in Netlify matches the TOKEN in the script exactly (" + text.slice(0, 60) + ")");
      return json({ content: Buffer.from(text, "utf8").toString("base64"), storedAt: Date.now(), source: "google" });
    }
    const pub = env("SHEET_CSV_URL");
    if (pub) {
      const r = await fetch(pub, { redirect: "follow" });
      if (!r.ok) throw new Error("Published sheet returned " + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      return json({ content: buf.toString("base64"), storedAt: Date.now(), source: "published" });
    }
    return json({ content: SNAPSHOT_B64, storedAt: Date.parse(SNAPSHOT_AT), source: "snapshot" });
  } catch (e) {
    return fail(502, "upstream_error", String(e.message || e));
  }
};
export const config = { path: "/api/motive/sheet" };
