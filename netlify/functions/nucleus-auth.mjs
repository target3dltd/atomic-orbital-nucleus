// Nucleus sign-in (v2).
//
// With Google set up (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET):
//   1. GET  /api/nucleus/google/start     → off to Google (company domains only)
//   2. GET  /api/nucleus/google/callback  → back from Google. If this person has connected Pipedrive before, their
//                                           stored token is checked and they're in. If not, they get a short-lived
//                                           "pending" session and the page asks for their Pipedrive token, once.
//   3. POST /api/nucleus/login { token }   → checks the token with Pipedrive, stores it (encrypted) against the
//                                           Google account, and signs in.
// Without Google: POST /api/nucleus/login { token, remember } signs in with the Pipedrive token alone (v1 behaviour).
//
//   GET  /api/nucleus/config               → { google } so the sign-in page knows which to show
//   GET  /api/nucleus/me                   → who is signed in, admin or not (never the token)
//   POST /api/nucleus/pipedrive/forget     → removes the stored Pipedrive token (to connect a new one)
//   POST /api/nucleus/logout               → ends the session (the stored token stays for next time)
import {
  seal, unseal, anySessionFrom, cookieValue, sessionCookie, clearCookie, allowedCompanies, pipedriveBase,
  googleConfig, allowedGoogleDomains, sessionDays, isAdmin, canUseSalesHub, envGet, jsonResponse as json,
} from "../lib/session.mjs";
import { kv } from "../lib/kv.mjs";

const HOUR = 3600 * 1000, DAY = 24 * HOUR;
const STATE_COOKIE = "nucleus_oauth";
const safeNext = (n) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/");
const redirect = (location, cookies = []) => {
  const h = new Headers({ location, "cache-control": "no-store" });
  cookies.forEach((c) => h.append("set-cookie", c));
  return new Response(null, { status: 302, headers: h });
};
const userKey = (sub) => "users/" + String(sub).replace(/[^0-9A-Za-z_-]/g, "");

function publicUser(s) {
  return {
    id: s.uid, name: s.n || s.gn, email: s.e, company: s.c, companyName: s.cn, icon: s.i || s.gp || null,
    google: s.gs ? { email: s.ge, name: s.gn } : null,
    pipedrive: s.t ? { id: s.uid, name: s.n, email: s.e } : null,
    isAdmin: isAdmin(s),
    salesHub: canUseSalesHub(s),
  };
}

// Ask Pipedrive who a token belongs to, and whether that company may use the Nucleus.
async function checkPipedrive(token) {
  if (!/^[A-Za-z0-9]{20,80}$/.test(token || "")) return { error: json({ ok: false, code: "bad_token", message: "That doesn't look like a Pipedrive API token. It's a string of about 40 letters and numbers from Pipedrive → Personal preferences → API." }, 400) };
  const r = await fetch(pipedriveBase() + "/v1/users/me", { headers: { "x-api-token": token, accept: "application/json" } });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) return { error: json({ ok: false, code: "rejected", message: "Pipedrive rejected that token. Copy it again from Personal preferences → API." }, 401), rejected: true };
  if (!r.ok || !j.data) return { error: json({ ok: false, code: "upstream", message: "Pipedrive didn't answer properly (" + r.status + "). Try again in a moment." }, 502) };
  const u = j.data, company = String(u.company_domain || "").toLowerCase(), allowed = allowedCompanies();
  if (!allowed.includes(company) && !allowed.includes(String(u.company_id))) return { error: json({ ok: false, code: "wrong_company", message: `That token belongs to the Pipedrive company "${u.company_name || company}" (${company || u.company_id}), which isn't allowed into this Nucleus. An administrator can add it to NUCLEUS_ALLOWED_COMPANIES.` }, 403) };
  if (u.active_flag === false) return { error: json({ ok: false, code: "inactive", message: "That Pipedrive user is deactivated." }, 403) };
  return { user: u, company };
}

function fullSession(pd, token, g, exp) {
  return { t: token, uid: pd.user.id, n: pd.user.name, e: pd.user.email, c: pd.company, cn: pd.user.company_name, i: pd.user.icon_url || (g && g.gp) || null,
    ...(g ? { gs: g.gs, ge: g.ge, gn: g.gn, gp: g.gp || null } : {}), exp };
}

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/nucleus\//, "");
  const secure = url.protocol === "https:";
  const google = googleConfig();

  try {
    if (path === "config") return json({ ok: true, google: !!google, domains: google ? allowedGoogleDomains() : [] });

    if (path === "me") {
      const s = await anySessionFrom(req);
      if (s && s.pending) return json({ ok: true, signedIn: false, pending: true, user: { name: s.gn, email: s.ge, icon: s.gp || null }, reason: s.why || null });
      if (!s || !s.t || (google && !s.gs)) return json({ ok: false, signedIn: false, google: !!google }, 401);
      return json({ ok: true, signedIn: true, user: publicUser(s), expires: s.exp });
    }

    if (path === "logout") {
      if (req.method !== "POST") return json({ ok: false, message: "POST only" }, 405);
      return json({ ok: true }, 200, { "set-cookie": clearCookie(secure) });
    }

    // ---------- Google ----------
    if (path === "google/start") {
      if (!google) return redirect("/?error=google_not_configured");
      const state = crypto.randomUUID();
      const sealed = await seal({ st: state, next: safeNext(url.searchParams.get("next")), exp: Date.now() + 10 * 60 * 1000 });
      const domains = allowedGoogleDomains();
      const q = new URLSearchParams({
        client_id: google.id, redirect_uri: callbackUrl(url), response_type: "code", scope: "openid email profile",
        state, prompt: "select_account", ...(domains.length === 1 ? { hd: domains[0] } : {}),
      });
      return redirect("https://accounts.google.com/o/oauth2/v2/auth?" + q, [sessionCookie(sealed, { name: STATE_COOKIE, maxAgeSec: 600, secure, path: "/api/nucleus/google" })]);
    }

    if (path === "google/callback") {
      if (!google) return redirect("/?error=google_not_configured");
      const st = await cookieValue(req, STATE_COOKIE);
      const clearState = clearCookie(secure, STATE_COOKIE, "/api/nucleus/google");
      if (url.searchParams.get("error")) return redirect("/?error=google_cancelled", [clearState]);
      if (!st || st.st !== url.searchParams.get("state")) return redirect("/?error=google_state", [clearState]);
      const tr = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code: url.searchParams.get("code") || "", client_id: google.id, client_secret: google.secret, redirect_uri: callbackUrl(url), grant_type: "authorization_code" }),
      });
      const tj = await tr.json().catch(() => ({}));
      if (!tr.ok || !tj.id_token) {
        // Google's reason (never includes the secret) goes to the function log, and a specific code to the page.
        console.error("Google token exchange failed", tr.status, tj.error || "", tj.error_description || "", "redirect_uri=" + callbackUrl(url));
        const why = tj.error === "invalid_client" ? "google_client" : tj.error === "redirect_uri_mismatch" ? "google_redirect" : "google_token";
        return redirect("/?error=" + why, [clearState]);
      }
      // The ID token came straight from Google over TLS, so its claims can be read without re-verifying the signature.
      const claims = JSON.parse(Buffer.from(tj.id_token.split(".")[1], "base64url").toString("utf8"));
      const email = String(claims.email || "").toLowerCase(), domain = email.split("@")[1] || "";
      if (claims.aud !== google.id || !/^(https:\/\/)?accounts\.google\.com$/.test(claims.iss) || !claims.email_verified || !claims.sub) {
        console.error("Google ID token rejected", { aud_ok: claims.aud === google.id, iss: claims.iss, email_verified: claims.email_verified });
        return redirect("/?error=google_token", [clearState]);
      }
      if (!allowedGoogleDomains().includes(domain) || (claims.hd && !allowedGoogleDomains().includes(String(claims.hd).toLowerCase()))) return redirect("/?error=google_domain&email=" + encodeURIComponent(email), [clearState]);
      const g = { gs: claims.sub, ge: email, gn: claims.name || email, gp: claims.picture || null };
      const next = st.next || "/";

      // Connected before? Use the stored token, after checking it still works.
      const store = await kv();
      const rec = await store.get(userKey(g.gs), { type: "json" });
      let why = null;
      if (rec && rec.token) {
        const inner = await unseal(rec.token);
        if (inner && inner.t) {
          const pd = await checkPipedrive(inner.t);
          if (!pd.error) {
            await store.setJSON(userKey(g.gs), { ...rec, email: g.ge, name: g.gn, lastSignIn: new Date().toISOString(), pipedrive: { id: pd.user.id, name: pd.user.name, email: pd.user.email } });
            const sealed = await seal(fullSession(pd, inner.t, g, Date.now() + sessionDays() * DAY));
            return redirect(next, [clearState, sessionCookie(sealed, { maxAgeSec: sessionDays() * 86400, secure })]);
          }
          why = pd.rejected ? "token_rejected" : null;
          if (!pd.rejected) return redirect("/?error=pipedrive_unavailable", [clearState]);
        }
      }
      const pending = await seal({ pending: true, ...g, why, exp: Date.now() + 30 * 60 * 1000 });
      return redirect(next === "/" ? "/" : "/?next=" + encodeURIComponent(next), [clearState, sessionCookie(pending, { maxAgeSec: 1800, secure })]);
    }

    // ---------- Pipedrive token ----------
    if (path === "login") {
      if (req.method !== "POST") return json({ ok: false, message: "POST only" }, 405);
      let body; try { body = await req.json(); } catch (e) { return json({ ok: false, code: "bad_request", message: "Body must be JSON" }, 400); }
      const token = String((body && body.token) || "").trim();
      let g = null;
      if (google) {
        const s = await anySessionFrom(req);
        if (!s || !s.gs) return json({ ok: false, code: "google_required", message: "Sign in with Google first." }, 401);
        g = { gs: s.gs, ge: s.ge, gn: s.gn, gp: s.gp || null };
      }
      const pd = await checkPipedrive(token);
      if (pd.error) return pd.error;
      let exp, maxAge;
      if (g) {
        const store = await kv();
        const prev = (await store.get(userKey(g.gs), { type: "json" })) || {};
        await store.setJSON(userKey(g.gs), {
          ...prev, email: g.ge, name: g.gn, token: await seal({ t: token, exp: Date.now() + 3650 * DAY }),
          pipedrive: { id: pd.user.id, name: pd.user.name, email: pd.user.email }, connectedAt: new Date().toISOString(), lastSignIn: new Date().toISOString(),
        });
        exp = Date.now() + sessionDays() * DAY; maxAge = sessionDays() * 86400;
      } else {
        const remember = !!(body && body.remember);
        exp = Date.now() + (remember ? 30 * DAY : 12 * HOUR); maxAge = remember ? 30 * 86400 : null;
      }
      const s = fullSession(pd, token, g, exp);
      return json({ ok: true, user: publicUser(s) }, 200, { "set-cookie": sessionCookie(await seal(s), { maxAgeSec: maxAge, secure }) });
    }

    if (path === "pipedrive/forget") {
      if (req.method !== "POST") return json({ ok: false, message: "POST only" }, 405);
      const s = await anySessionFrom(req);
      if (!s) return json({ ok: false, code: "needs_reauth" }, 401);
      if (!s.gs) return json({ ok: true }, 200, { "set-cookie": clearCookie(secure) }); // token-only mode: nothing stored
      const store = await kv();
      const rec = await store.get(userKey(s.gs), { type: "json" });
      if (rec) { delete rec.token; rec.disconnectedAt = new Date().toISOString(); await store.setJSON(userKey(s.gs), rec); }
      const pending = await seal({ pending: true, gs: s.gs, ge: s.ge, gn: s.gn, gp: s.gp || null, exp: Date.now() + 30 * 60 * 1000 });
      return json({ ok: true }, 200, { "set-cookie": sessionCookie(pending, { maxAgeSec: 1800, secure }) });
    }

    return json({ ok: false, message: "Unknown action" }, 404);
  } catch (e) {
    if (e && e.code === "not_configured") return json({ ok: false, code: "not_configured", message: e.message }, 503);
    return json({ ok: false, code: "error", message: String(e && e.message || e) }, 500);
  }
};

function callbackUrl(url) {
  const base = envGet("NUCLEUS_PUBLIC_URL") || url.origin;
  return base.replace(/\/$/, "") + "/api/nucleus/google/callback";
}

export const config = { path: ["/api/nucleus/login", "/api/nucleus/me", "/api/nucleus/logout", "/api/nucleus/config", "/api/nucleus/google/start", "/api/nucleus/google/callback", "/api/nucleus/pipedrive/forget"] };
