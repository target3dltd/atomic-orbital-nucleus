/*! © 2026 Ashley Keeler. All rights reserved. Unauthorised copying, redistribution or reuse of this code is prohibited. */
/* Sales Hub shell for the Nucleus. Replaces the original Firebase sign-in (auth-guard.js, firebase-config.js):
   the Nucleus gate has already checked who you are before any page here loads.
   - Atomic Orbital brand in each page's top bar, plus "Nucleus", Help and Sign out
   - window.SalesHubStore: shared settings (Pipeline Triage's bucket overrides) in the Nucleus store
   - a signed-out session sends you back to sign in, and you return to the same page afterwards */
(function () {
  "use strict";
  var VERSION = "1.1.0";
  var CHANGELOG = [
    ["1.1.0", "One sales tool: the team Sales dashboard is merged in. New Overview page (FY position against minimum pace, what is still to find per working day, gross profit, this week, owners league table, deals closing in 30 days and deals past their close date) using the same deals and targets as the Revenue Scoreboard. Overview link on every report. Deal links fixed to target3d2.pipedrive.com."],
    ["1.0.0", "Brought into the Nucleus from Allan's Target3D Sales Hub. Sign-in is now the Nucleus Google sign-in (Firebase removed); Pipedrive reads go through the Nucleus with the shared read-only token; probability edits in Pipeline Triage are made with your own Pipedrive token; bucket overrides are kept in the Nucleus store; Atomic Orbital styling; SheetJS served from the Nucleus."]
  ];
  var PAGES = [
    ["./", "Overview", "The headline: FY to date against the minimum pace, what is still to find (and what that means per working day), gross profit, this week's wins and new deals, a league table by owner, and the deals closing in the next 30 days or already past their close date. Deal names open in Pipedrive."],
    ["revenue-scoreboard.html", "Revenue Scoreboard", "Won revenue today, this week, month, quarter and year against the minimum and stretch targets. Export downloads the figures as Excel."],
    ["pipeline-triage.html", "Pipeline Triage", "Every open deal in the four sales pipelines, sorted into Hot, Warm, Stale and Dead with the next action. You can move a deal to another bucket (shared with everyone using the Sales Hub) or change its probability, which updates Pipedrive as you."],
    ["sales-report.html", "Sales Report", "Won deals by pipeline for a period you choose, GBP and EUR kept separate, against the period targets."],
    ["weekly-pulse.html", "Weekly Pulse", "New, won and lost deals this week, deal by deal."],
    ["weekly-deals-report.html", "Weekly Deals Report", "The weekly numbers across eight metrics, including demos and projects."],
    ["supplier-forecast.html", "Supplier Forecast", "What we expect to order from each supplier, from the open pipeline."]
  ];

  // ── session expiry: any 401 from the Nucleus means "sign in again" ──
  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    return origFetch(input, init).then(function (r) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      if (r.status === 401 && url.indexOf("/api/") !== -1) {
        location.href = "/?next=" + encodeURIComponent(location.pathname + location.search);
      }
      return r;
    });
  };

  // ── shared settings ──
  window.SalesHubStore = {
    get: function (doc) {
      return origFetch("/api/nucleus/store?ns=sales-hub&doc=" + encodeURIComponent(doc), { credentials: "same-origin" })
        .then(function (r) { return r.json(); }).then(function (j) { return j && j.exists ? j.data : null; });
    },
    set: function (doc, data) {
      return origFetch("/api/nucleus/store", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ ns: "sales-hub", doc: doc, op: "set", data: data }) })
        .then(function (r) { if (!r.ok) throw new Error("Couldn't save (" + r.status + ")"); return r.json(); });
    }
  };

  function signOut() {
    origFetch("/api/nucleus/logout", { method: "POST", credentials: "same-origin" }).finally(function () { location.href = "/"; });
  }
  window.ccAuth = { signOut: signOut, isAllowed: function () { return true; } };

  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  function helpHTML() {
    return '<div class="sh-help-head"><h2>Sales Hub help</h2><span class="sh-ver">v' + VERSION + '</span>' +
      '<button type="button" class="sh-x" data-close aria-label="Close">×</button></div>' +
      '<div class="sh-help-body">' +
      '<p>Live sales reporting from Pipedrive, open to the sales team and Nucleus administrators. Figures refresh when a page opens; use <b>↻ Refresh</b> for the latest.</p>' +
      '<h3>The reports</h3><dl>' + PAGES.map(function (p) { return '<dt><a href="' + p[0] + '">' + esc(p[1]) + '</a></dt><dd>' + esc(p[2]) + '</dd>'; }).join("") + '</dl>' +
      '<h3>Where the numbers come from</h3><ul>' +
      '<li>Reading uses the Nucleus\'s shared read-only Pipedrive token, so everyone sees the same company-wide figures.</li>' +
      '<li>Changing a probability in Pipeline Triage uses <b>your own</b> Pipedrive token, so Pipedrive records the change against you. Nothing else here writes to Pipedrive.</li>' +
      '<li>Bucket overrides in Pipeline Triage are saved in the Nucleus and shared with everyone using the Sales Hub.</li>' +
      '<li>The Overview and the Revenue Scoreboard count the same deals: won in UK Tech Sales (SI, PS) and Studio Sales, GBP, from 1 April 2026, against £3.8m minimum and £4.56m stretch over 252 working days. Iberia (EUR) is in the Sales Report.</li>' +
      '<li>Gross profit uses each deal\'s Expected GP Value, or value minus Cost Price; the Overview says how many won deals have it.</li>' +
      '<li>Targets and pipeline names are set in each report\'s own code; ask whoever maintains the Nucleus to change them.</li></ul>' +
      '<h3>Who can open it</h3><p>The people on the Sales Hub list (the Netlify setting <code>NUCLEUS_SALES_HUB_USERS</code>) and every Nucleus administrator.</p>' +
      '<h3>Version history</h3><ul>' + CHANGELOG.map(function (c) { return '<li><b>v' + c[0] + '</b>: ' + esc(c[1]) + '</li>'; }).join("") + '</ul>' +
      '</div>';
  }

  function openHelp() {
    var d = document.getElementById("shHelp");
    if (!d) {
      d = document.createElement("dialog"); d.id = "shHelp"; d.className = "sh-help"; d.innerHTML = helpHTML();
      d.addEventListener("click", function (e) { if (e.target === d || e.target.hasAttribute("data-close")) d.close(); });
      document.body.appendChild(d);
    }
    d.showModal();
  }
  window.SalesHub = { version: VERSION, openHelp: openHelp };

  function decorate() {
    var brand = document.querySelector(".topnav-brand");
    if (brand) {
      brand.innerHTML = '<a class="sh-brand" href="/tools/sales-hub/" aria-label="Sales Hub home">' +
        '<img class="ao-logo-on-light" src="/brand/logos/svg/atomic-orbital-logo-for-light-backgrounds.svg" alt="Atomic Orbital">' +
        '<img class="ao-logo-on-dark" src="/brand/logos/svg/atomic-orbital-logo-for-dark-backgrounds.svg" alt="Atomic Orbital">' +
        '<span>Sales Hub</span></a>';
    }
    var host = document.querySelector(".topnav-inner") || document.querySelector("[data-sh-tools]");
    if (host && !host.querySelector(".sh-tools")) {
      var t = document.createElement("div"); t.className = "sh-tools";
      t.innerHTML = '<a href="/" class="sh-tool">Nucleus</a><button type="button" class="sh-tool" data-sh-help>Help</button><button type="button" class="sh-tool" data-sh-out>Sign out</button>';
      host.appendChild(t);
      t.querySelector("[data-sh-help]").addEventListener("click", openHelp);
      t.querySelector("[data-sh-out]").addEventListener("click", signOut);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", decorate); else decorate();
})();
