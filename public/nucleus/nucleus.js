/*! © 2026 Ashley Keeler. All rights reserved. Unauthorised copying, redistribution or reuse of this code is prohibited. */
/* Nucleus shared helpers: version, icons, the themable mark, theme switch, session. */
(function () {
  var N = window.Nucleus = window.Nucleus || {};
  N.VERSION = "1.8.0";
  N.CHANGELOG = [
    ["v1.8.0", "2026-11-05", "One Sales tool: the team Sales dashboard and the Sales Hub are merged. A new Sales overview opens first, showing FY to date against the minimum pace, what is still to find per working day, gross profit, this week, a league table by owner, and deals closing in 30 days or past their close date, using the same deals and targets as the Revenue Scoreboard so the figures agree. The six reports are one click away, and the Sales tab in Team performance now goes there."],
    ["v1.7.0", "2026-11-05", "Sales Hub added under Tools: Allan's six live reports (Revenue Scoreboard, Pipeline Triage, Sales Report, Weekly Pulse, Weekly Deals Report, Supplier Forecast), now on the Nucleus sign-in instead of Firebase, in Atomic Orbital style, with its own Help. Open to the sales team and administrators only; it doesn't appear in the hub for anyone else."],
    ["v1.6.0", "2026-11-05", "Sign in with Google: the first time you connect your Pipedrive token, then Google is all you need (token stored encrypted against your Google account; change it from Your account). Administrators set by email. Team dashboards added: Sales dashboard and Team performance (overview, company, Performance Hub for administrators, My dashboard, plan milestones) with KPI entries, notes and progress shared across the team. Checklists & templates: 19 operations documents rebranded to Atomic Orbital."],
    ["v1.5.0", "2026-11-05", "New Marketing section with Assets & Press Kit: logos, colour palette, fonts, UK letterheads (print and digital), the Brand Style Guide 2026 with slide viewer, press boilerplate, key facts and company details, all downloadable."],
    ["v1.4.0", "2026-11-05", "Every tool and project site now wears the Atomic Orbital style: Space Grotesk and IBM Plex type (self-hosted, no Google Fonts), teal and orange accents, rounded surfaces, and the Atomic Orbital logo in place of the Target3D logo in each tool's own header. Light and dark follow the Nucleus everywhere, both ways. Drift project site added. Client-facing documents (quotes, proposals, SOWs, 3D floor logos) are unchanged."],
    ["v1.3.0", "2026-11-05", "Little Lion (LLE) project site v1.0.0 added to the Project sites orbit."],
    ["v1.2.0", "2026-11-05", "Mocap Toolkit v6.14.0 added to the Tools orbit."],
    ["v1.1.0", "2026-11-05", "Support dashboard v1.2.0 moved in and live. New: a dashboard runtime so Claude Dashboard pages run in the Nucleus, a server-side reader for the support@ inbox (Apps Script or Google service account), and d3 bundled with the site."],
    ["v1.0.0", "2026-11-05", "First release. Sign in with your own Pipedrive API token (sealed in a secure cookie, never stored in the page). The atom hub with Tools, Project sites and Connected systems orbits, a searchable directory, live Pipedrive pulse, light and dark themes. Moved in: Operations processes, System Designer v2.104.2, SOW Builder v4, Pipedrive Duplicate Eraser (Account Merge Desk v1.3.0), Motive licence renewals and the Clays project site. Sales dashboard, Support dashboard, Drift and LLE reserved, awaiting their code."]
  ];

  var P = 'viewBox="0 0 24 24" aria-hidden="true"';
  N.ICONS = {
    flow:    '<svg ' + P + '><rect x="3" y="3" width="7" height="5" rx="1.2"/><rect x="14" y="16" width="7" height="5" rx="1.2"/><rect x="14" y="3" width="7" height="5" rx="1.2"/><path d="M10 5.5h4M17.5 8v8M6.5 8v5.5a2.5 2.5 0 0 0 2.5 2.5h5"/></svg>',
    cube:    '<svg ' + P + '><path d="M12 2.8 20.5 7.5v9L12 21.2 3.5 16.5v-9z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9.2"/></svg>',
    doc:     '<svg ' + P + '><path d="M6 2.8h8l4.5 4.5v13.9H6z"/><path d="M14 2.8v4.5h4.5M9 12h7M9 15.5h7M9 19h4"/></svg>',
    merge:   '<svg ' + P + '><circle cx="6" cy="5" r="2.2"/><circle cx="18" cy="5" r="2.2"/><circle cx="12" cy="19" r="2.2"/><path d="M6 7.2c0 5 6 5.5 6 9.6M18 7.2c0 5-6 5.5-6 9.6"/></svg>',
    key:     '<svg ' + P + '><circle cx="8" cy="15" r="4.5"/><path d="m11.2 11.8 8.8-8.8M16.5 6.5l2.5 2.5M14 9l2 2"/></svg>',
    chart:   '<svg ' + P + '><path d="M3.5 20.5h17M6.5 17v-5M11 17V7M15.5 17v-8M20 17V4"/></svg>',
    support: '<svg ' + P + '><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="m6 6 3.5 3.5M18 6l-3.5 3.5M6 18l3.5-3.5M18 18l-3.5-3.5"/></svg>',
    motion:  '<svg ' + P + '><circle cx="12" cy="4.5" r="2"/><path d="M12 6.5v7M12 13.5l-4 7.5M12 13.5l4 7.5M6 10l6-1.5 6 1.5"/><circle cx="6" cy="10" r=".6"/><circle cx="18" cy="10" r=".6"/></svg>',
    megaphone: '<svg ' + P + '><path d="M3.5 10v4h3l7 4.5v-13l-7 4.5z"/><path d="M6.5 14l1.5 5.5h2.5L9.3 15M17 9.5a3.5 3.5 0 0 1 0 5"/></svg>',
    gauge:   '<svg ' + P + '><path d="M4.2 17.5a9 9 0 1 1 15.6 0"/><path d="M12 13.5l4-5"/><circle cx="12" cy="14" r="1.6"/></svg>',
    check:   '<svg ' + P + '><rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M8 9l1.8 1.8L13 7.6M8 15l1.8 1.8L13 13.6M15.5 9.5H17M15.5 15.5H17"/></svg>',
    pin:     '<svg ' + P + '><path d="M12 21.5s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10.5" r="2.4"/></svg>',
    funnel:  '<svg ' + P + '><path d="M3.5 4h17l-6.5 8v7l-4 2v-9z"/></svg>',
    ledger:  '<svg ' + P + '><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v18M11.5 8h5M11.5 12h5M11.5 16h3"/></svg>',
    folder:  '<svg ' + P + '><path d="M3 6.5a1.5 1.5 0 0 1 1.5-1.5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/></svg>',
    mail:    '<svg ' + P + '><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/></svg>',
    globe:   '<svg ' + P + '><circle cx="12" cy="12" r="8.8"/><path d="M3.2 12h17.6M12 3.2c2.6 2.6 3.8 5.5 3.8 8.8s-1.2 6.2-3.8 8.8c-2.6-2.6-3.8-5.5-3.8-8.8S9.4 5.8 12 3.2z"/></svg>',
    cloud:   '<svg ' + P + '><path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.1 4.75 4.75 0 0 0 7 18.5z"/></svg>',
    spark:   '<svg ' + P + '><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>',
    sun:     '<svg ' + P + ' fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>',
    moon:    '<svg ' + P + ' fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
    help:    '<svg ' + P + ' fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7M12 17.2v.1"/></svg>',
    out:     '<svg ' + P + ' fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 16.5 14.5 12 10 7.5M14.5 12H4"/></svg>',
    close:   '<svg ' + P + ' fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    ext:     '<svg ' + P + ' fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    back:    '<svg ' + P + ' fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>'
  };

  // Themable copy of the Atomic Orbital mark (Globe A). animated=true for the hub's nucleus only.
  N.mark = function (size, animated, label) {
    return '<svg class="n-mark" width="' + size + '" height="' + size + '" viewBox="2.5 2.5 75 75" role="img" aria-label="' + (label || "Atomic Orbital") + '"><g fill="none" stroke-linecap="round" stroke-linejoin="round">'
      + '<ellipse class="w' + (animated ? ' eq' : '') + '" pathLength="200" cx="40" cy="40" rx="33" ry="9" stroke-width="2.6"' + (animated ? ' stroke-dasharray="2 6"' : '') + '/>'
      + '<ellipse class="m' + (animated ? ' mer' : '') + '" cx="40" cy="40" rx="13" ry="33" stroke-width="1.6"/>'
      + '<path class="a" d="M26 62 40 18 54 62" stroke-width="2.8"/>'
      + '<circle class="wf" cx="40" cy="40" r="4.9" stroke="none"/>'
      + '<circle class="r" cx="40" cy="40" r="33" stroke-width="2.8"/></g></svg>';
  };

  // Theme: light / dark, saved per browser (the brand head snippet reads the same key).
  N.theme = function () { return document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light"); };
  N.setTheme = function (t) { document.documentElement.dataset.theme = t; try { localStorage.setItem("theme", t); } catch (e) {} document.dispatchEvent(new CustomEvent("nucleus:theme", { detail: t })); };
  N.bindThemeButton = function (btn) {
    var paint = function () { var dark = N.theme() === "dark"; btn.innerHTML = (dark ? N.ICONS.sun : N.ICONS.moon) + '<span class="n-sr">' + (dark ? "Switch to light theme" : "Switch to dark theme") + '</span>'; btn.title = dark ? "Light theme" : "Dark theme"; };
    btn.addEventListener("click", function () { N.setTheme(N.theme() === "dark" ? "light" : "dark"); paint(); });
    // a tool's own theme switch (inside the frame) updates the Nucleus too
    window.addEventListener("storage", function (e) { if (e.key === "theme" && (e.newValue === "light" || e.newValue === "dark")) { document.documentElement.dataset.theme = e.newValue; paint(); document.dispatchEvent(new CustomEvent("nucleus:theme", { detail: e.newValue })); } });
    paint();
  };

  N.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  N.initials = function (name) { return String(name || "?").trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase(); };

  N.api = function (path, opts) {
    return fetch(path, Object.assign({ credentials: "same-origin", cache: "no-store" }, opts || {})).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { j.__status = r.status; return j; });
    });
  };
  N.me = function () { return N.api("/api/nucleus/me").then(function (j) { return j.signedIn ? j.user : null; }).catch(function () { return null; }); };
  N.signOut = function () { return N.api("/api/nucleus/logout", { method: "POST" }).then(function () { location.href = "/"; }); };
  N.item = function (id) { return (window.NUCLEUS_REGISTRY.items || []).filter(function (i) { return i.id === id; })[0] || null; };
})();
