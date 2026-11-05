// Nucleus session: the person's Pipedrive API token is sealed (AES-256-GCM) inside an
// HttpOnly cookie. Browser code never sees the token; server functions open the cookie
// to call Pipedrive as that person. Uses Web Crypto only, so it runs in Node functions
// and in the Deno edge function alike.
// Requires NUCLEUS_SECRET (any long random string) in Netlify environment variables.

export const COOKIE = "nucleus_s";
const enc = new TextEncoder(), dec = new TextDecoder();

export function envGet(name, fallback = "") {
  try { if (globalThis.Netlify && Netlify.env) { const v = Netlify.env.get(name); if (v != null && v !== "") return v; } } catch (e) {}
  try { if (globalThis.Deno && Deno.env) { const v = Deno.env.get(name); if (v != null && v !== "") return v; } } catch (e) {}
  try { const v = globalThis.process && process.env[name]; if (v != null && v !== "") return v; } catch (e) {}
  return fallback;
}

const b64u = (buf) => { let s = ""; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64u = (s) => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };

let keyCache = null, keyFor = null;
async function key() {
  const secret = envGet("NUCLEUS_SECRET");
  if (!secret || secret.length < 16) throw Object.assign(new Error("NUCLEUS_SECRET is not set (or shorter than 16 characters) in Netlify environment variables"), { code: "not_configured" });
  if (keyCache && keyFor === secret) return keyCache;
  const raw = await crypto.subtle.digest("SHA-256", enc.encode("nucleus-session-v1:" + secret));
  keyCache = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  keyFor = secret;
  return keyCache;
}

export async function seal(obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), enc.encode(JSON.stringify(obj)));
  return b64u(iv) + "." + b64u(ct);
}

export async function unseal(str) {
  if (!str || typeof str !== "string" || !str.includes(".")) return null;
  try {
    const [iv, ct] = str.split(".");
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64u(iv) }, await key(), unb64u(ct));
    const s = JSON.parse(dec.decode(pt));
    if (!s || !s.exp || Date.now() > s.exp) return null;
    return s;
  } catch (e) {
    if (e && e.code === "not_configured") throw e;
    return null;
  }
}

export function readCookie(cookieHeader, name = COOKIE) {
  for (const part of String(cookieHeader || "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

// Works with a Fetch Request (v2 functions, edge) or a legacy Lambda event.
function cookieHeaderOf(reqOrEvent) {
  if (!reqOrEvent) return "";
  if (reqOrEvent.headers && typeof reqOrEvent.headers.get === "function") return reqOrEvent.headers.get("cookie") || "";
  const h = reqOrEvent.headers || {};
  return h.cookie || h.Cookie || "";
}

// A full session: signed in (with Google when it is set up) and holding a Pipedrive token.
export async function sessionFrom(reqOrEvent) {
  const s = await unseal(readCookie(cookieHeaderOf(reqOrEvent)));
  if (!s || !s.t || s.pending) return null;
  if (googleConfig() && !s.gs) return null; // once Google is on, token-only sessions from before no longer count
  return s;
}

// Any session, including one that has signed in with Google but not yet connected Pipedrive.
export async function anySessionFrom(reqOrEvent) {
  return unseal(readCookie(cookieHeaderOf(reqOrEvent)));
}

export async function cookieValue(reqOrEvent, name) {
  return unseal(readCookie(cookieHeaderOf(reqOrEvent), name));
}

// Pipedrive token for this request, or null when nobody is signed in.
export async function tokenFrom(reqOrEvent) {
  const s = await sessionFrom(reqOrEvent);
  return s ? s.t : null;
}

export function sessionCookie(value, { maxAgeSec = null, secure = true, name = COOKIE, path = "/" } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, "HttpOnly", "SameSite=Lax"];
  if (secure) parts.push("Secure");
  if (maxAgeSec != null) parts.push(`Max-Age=${maxAgeSec}`);
  return parts.join("; ");
}
export const clearCookie = (secure = true, name = COOKIE, path = "/") => `${name}=; Path=${path}; HttpOnly; SameSite=Lax;${secure ? " Secure;" : ""} Max-Age=0`;

// ---- Google sign-in ----
// Turned on by setting GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. Until then the Nucleus signs in with a Pipedrive token alone.
export function googleConfig() {
  const id = envGet("GOOGLE_CLIENT_ID"), secret = envGet("GOOGLE_CLIENT_SECRET");
  return id && secret ? { id, secret } : null;
}
export function allowedGoogleDomains() {
  return envGet("NUCLEUS_GOOGLE_DOMAINS", "target3d.co.uk,atomicorbital.co.uk").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}
export function sessionDays() {
  const n = Number(envGet("NUCLEUS_SESSION_DAYS", "7"));
  return n > 0 && n <= 90 ? n : 7;
}

// ---- Roles ----
// NUCLEUS_ADMINS: comma-separated emails (Google email, or Pipedrive email when Google isn't set up).
export function adminEmails() {
  return envGet("NUCLEUS_ADMINS").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}
export function isAdmin(s) {
  if (!s) return false;
  const list = adminEmails();
  // With Google sign-in, only the Google email counts (a Pipedrive token can be anyone's).
  const email = s.gs ? s.ge : s.e;
  return !!email && list.includes(String(email).toLowerCase());
}

// Which Pipedrive companies may sign in. Comma-separated company subdomains or numeric company IDs.
export function allowedCompanies() {
  return envGet("NUCLEUS_ALLOWED_COMPANIES", "target3d2").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function pipedriveBase() {
  return "https://api.pipedrive.com";
}

export const jsonResponse = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
