// Nucleus gate: every tool and project page needs a signed-in session.
// Without one, the visitor is sent to the sign-in page and brought back afterwards.
// Some pages are for administrators only (NUCLEUS_ADMINS).
import { sessionFrom, isAdmin, canUseSalesHub } from "../lib/session.mjs";

export const ADMIN_ONLY = ["/tools/team-dashboards/performance-hub.html"];
// The Sales Hub is open to its own list of people (NUCLEUS_SALES_HUB_USERS) and to administrators.
export const SALES_HUB = "/tools/sales-hub/";

const deny = (title = "Administrators only", text = "This page is only open to Nucleus administrators. If you need it, ask an administrator to add your email to the admin list.", back = ["/tools/team-dashboards/", "Back to the team dashboards"]) => new Response(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<link rel="stylesheet" href="/brand/css/plex.css"><link rel="stylesheet" href="/brand/css/atomic-orbital.css"><script src="/nucleus/ao-skin/theme-sync.js"></script></head>
<body><main class="ao-container" style="padding:64px 16px;max-width:640px"><h1 style="font-size:32px">${title}</h1>
<p class="ao-muted" style="margin-top:12px">${text}</p>
<p style="margin-top:20px"><a class="ao-btn ao-btn--secondary" href="${back[0]}">${back[1]}</a></p></main></body></html>`,
  { status: 403, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

export default async (request, context) => {
  let s = null;
  try { s = await sessionFrom(request); } catch (e) { s = null; }
  const url = new URL(request.url);
  if (s) {
    if (ADMIN_ONLY.includes(url.pathname) && !isAdmin(s)) return deny();
    if ((url.pathname + "/").startsWith(SALES_HUB) && !canUseSalesHub(s)) return deny("Sales Hub", "The Sales Hub is open to the sales team and administrators. If you need it, ask an administrator to add your email to the Sales Hub list.", ["/", "Back to the Nucleus"]);
    return context.next();
  }
  const next = url.pathname + url.search + url.hash;
  return new Response(null, { status: 302, headers: { location: "/?next=" + encodeURIComponent(next), "cache-control": "no-store" } });
};

export const config = {
  path: ["/tools/*", "/projects/*", "/launch", "/launch.html"],
  // The 3D model viewer is meant for sharing with clients, so it stays public.
  excludedPath: ["/tools/system-designer/viewer.html"],
};
