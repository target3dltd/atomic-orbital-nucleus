/*! © 2026 Ashley Keeler. All rights reserved. Unauthorised copying, redistribution or reuse of this code is prohibited. */
/* Nucleus dock v1.0.0: a small button in the bottom corner of every tool and project page.
   It gets you home, switches tool, and has "Ask Claude": suggested questions for Claude in Chrome about the page you're on.
   Tools now open as their own pages (not inside a frame) so Claude in Chrome can read and use them. */
(function () {
  "use strict";
  if (window.__nucleusDock || window.top !== window) return; // once, and never inside a frame
  window.__nucleusDock = true;
  var VERSION = "1.0.0";
  var STORE_URL = "https://chromewebstore.google.com/publisher/anthropic/u308d63ea0533efcf7ba778ad42da7390";

  function ready(fn) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn); else fn(); }
  function needRegistry(cb) {
    if (window.NUCLEUS_REGISTRY) return cb();
    var s = document.createElement("script"); s.src = "/nucleus/registry.js"; s.onload = cb; s.onerror = cb; document.head.appendChild(s);
  }
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  var CSS = [
    ".nd{--nd-bg:#fff;--nd-fg:#0E1620;--nd-mut:#4A5A6B;--nd-line:#D5DCE4;--nd-teal:#04959B;--nd-tealtx:#047A80;--nd-sunk:#F1F4F7;--nd-or:#F2531A;position:fixed;right:16px;bottom:16px;z-index:2147483000;font:14px/1.45 'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--nd-fg)}",
    "@media (prefers-color-scheme:dark){html:not([data-theme=light]) .nd{--nd-bg:#121A24;--nd-fg:#E8EEF4;--nd-mut:#9AA9B8;--nd-line:#26323F;--nd-sunk:#0C121A;--nd-tealtx:#3CC8CE}}",
    "html[data-theme=dark] .nd{--nd-bg:#121A24;--nd-fg:#E8EEF4;--nd-mut:#9AA9B8;--nd-line:#26323F;--nd-sunk:#0C121A;--nd-tealtx:#3CC8CE}",
    ".nd *{box-sizing:border-box}",
    ".nd-btn{display:flex;align-items:center;gap:8px;height:42px;padding:0 14px 0 6px;border-radius:999px;border:1px solid var(--nd-line);background:var(--nd-bg);color:var(--nd-fg);box-shadow:0 6px 22px rgb(0 0 0/.18);cursor:pointer;font:600 13.5px inherit;font-family:inherit}",
    ".nd-btn:hover{border-color:var(--nd-teal)} .nd-btn:focus-visible,.nd a:focus-visible,.nd button:focus-visible,.nd select:focus-visible{outline:3px solid var(--nd-tealtx);outline-offset:2px}",
    ".nd-btn img{width:30px;height:30px} .nd-d{display:none}",
    "@media (prefers-color-scheme:dark){html:not([data-theme=light]) .nd .nd-l{display:none}html:not([data-theme=light]) .nd .nd-d{display:block}}",
    "html[data-theme=dark] .nd .nd-l{display:none} html[data-theme=dark] .nd .nd-d{display:block}",
    ".nd.is-min .nd-btn span{display:none} .nd.is-min .nd-btn{padding:0 6px}",
    ".nd-panel{position:absolute;right:0;bottom:52px;width:min(380px,calc(100vw - 32px));max-height:min(620px,calc(100vh - 90px));overflow:auto;background:var(--nd-bg);border:1px solid var(--nd-line);border-radius:14px;box-shadow:0 18px 50px rgb(0 0 0/.28);padding:14px 16px 16px}",
    ".nd-panel[hidden]{display:none}",
    ".nd-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}",
    ".nd-head b{font-size:15px;flex:1;min-width:0}",
    ".nd-head small{display:block;font-weight:400;color:var(--nd-mut);font-size:12.5px}",
    ".nd-x{border:0;background:none;color:var(--nd-mut);font-size:22px;line-height:1;cursor:pointer;padding:2px 6px}",
    ".nd-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}",
    ".nd-a{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--nd-line);border-radius:8px;padding:6px 10px;color:var(--nd-fg);text-decoration:none;font-weight:600;font-size:13px;background:var(--nd-bg);cursor:pointer;font-family:inherit}",
    ".nd-a:hover{border-color:var(--nd-teal);color:var(--nd-tealtx)}",
    ".nd select{width:100%;padding:7px 8px;border:1px solid var(--nd-line);border-radius:8px;background:var(--nd-bg);color:var(--nd-fg);font:inherit;margin-bottom:14px}",
    ".nd h4{margin:4px 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--nd-mut)}",
    ".nd-claude{background:var(--nd-sunk);border-radius:10px;padding:12px}",
    ".nd-claude p{margin:0 0 8px;font-size:13px}",
    ".nd-q{list-style:none;margin:0 0 10px;padding:0;display:grid;gap:6px}",
    ".nd-q li{display:flex;gap:8px;align-items:flex-start;background:var(--nd-bg);border:1px solid var(--nd-line);border-radius:8px;padding:8px 8px 8px 10px;font-size:13px}",
    ".nd-q li span{flex:1}",
    ".nd-copy{border:1px solid var(--nd-line);background:none;border-radius:6px;font:600 12px inherit;font-family:inherit;color:var(--nd-tealtx);padding:3px 8px;cursor:pointer;white-space:nowrap}",
    ".nd-copy.ok{color:#1F8A4C;border-color:#1F8A4C}",
    ".nd-fine{font-size:12px;color:var(--nd-mut);margin:8px 0 0}",
    ".nd details{margin-top:12px;font-size:13px} .nd summary{cursor:pointer;color:var(--nd-tealtx);font-weight:600}",
    ".nd details ul{padding-left:18px;margin:6px 0}",
    "@media print{.nd{display:none}}"
  ].join("\n");

  function currentItem(R) {
    var path = location.pathname, best = null;
    (R.items || []).forEach(function (it) {
      if (it.status === "external" || !it.href || it.href.charAt(0) !== "/") return;
      var base = it.href.replace(/index\.html$/, "");
      if (path.indexOf(base) === 0 && (!best || base.length > best.base.length)) best = { it: it, base: base };
    });
    if (best) return best.it;
    if (path === "/" || path === "/index.html") return { id: "hub", name: "Nucleus home" };
    return null;
  }

  function build() {
    var R = window.NUCLEUS_REGISTRY || { items: [], orbits: [] }, ASK = window.NUCLEUS_ASK || {};
    var it = currentItem(R), isHub = it && it.id === "hub";
    var asks = (it && ASK[it.id]) || ["Summarise what's on this page in five bullet points.", "What needs my attention on this page?", "Explain how to use this page."];
    var live = (R.items || []).filter(function (x) { return x.status === "live"; });

    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    var root = document.createElement("div"); root.className = "nd"; root.setAttribute("data-nucleus-dock", VERSION);
    var min = false; try { min = sessionStorage.getItem("nucleus:dockmin") === "1"; } catch (e) {}
    if (min) root.classList.add("is-min");
    root.innerHTML =
      '<div class="nd-panel" id="ndPanel" role="dialog" aria-label="Nucleus and Ask Claude" hidden>' +
        '<div class="nd-head"><b>' + esc(it ? it.name : document.title) + '<small>Nucleus · dock v' + VERSION + "</small></b>" +
        '<button type="button" class="nd-x" data-nd-close aria-label="Close">×</button></div>' +
        (isHub ? "" : '<div class="nd-row"><a class="nd-a" href="/">← Nucleus home</a><button type="button" class="nd-a" data-nd-min>' + (min ? "Show label" : "Make smaller") + "</button></div>" +
          '<label><span class="nd-sr" style="position:absolute;left:-9999px">Go to another tool</span><select data-nd-jump><option value="">Go to another tool…</option>' +
          live.map(function (x) { return '<option value="' + esc(x.href) + '"' + (it && x.id === it.id ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + "</select></label>") +
        '<div class="nd-claude"><h4>Ask Claude about this page</h4>' +
          "<p>Open <b>Claude in Chrome</b> (the Claude icon in Chrome's toolbar; pin it from the puzzle-piece menu) and ask it about what's on screen. Copy one of these to start:</p>" +
          '<ul class="nd-q">' + asks.map(function (q) { return "<li><span>" + esc(q) + '</span><button type="button" class="nd-copy" data-nd-copy="' + esc(q) + '">Copy</button></li>'; }).join("") + "</ul>" +
          '<p class="nd-fine">Claude uses your Atomic Orbital Claude Team seat, not Nucleus. It sees this page as you do, and asks before it clicks or types. Don\'t let it send, delete or pay for anything without checking.</p>' +
          '<details><summary>Don\'t have Claude in Chrome yet?</summary><ul>' +
            '<li>Install <a href="' + STORE_URL + '" target="_blank" rel="noopener">Claude in Chrome</a> from the Chrome Web Store (Anthropic).</li>' +
            "<li>Sign in with your work account on the Atomic Orbital Claude Team plan.</li>" +
            "<li>Pin the Claude icon, open the side panel on any Nucleus page, and paste a question.</li></ul></details>" +
          "<details><summary>Help · v" + VERSION + "</summary><ul>" +
            "<li>This dock appears on every tool and project page. <b>Nucleus home</b> goes back to the hub; the menu jumps to another tool.</li>" +
            "<li><b>Ask Claude</b> lists questions that suit this page. Claude in Chrome reads the page you're looking at, so it's best for questions about what's on screen; open a tool before asking about it.</li>" +
            "<li><b>Make smaller</b> shrinks the dock to just the logo for this browser tab.</li>" +
            "<li>v1.0.0 (6 Nov 2026): first release, with suggested questions for every tool and project site.</li></ul></details>" +
        "</div>" +
      "</div>" +
      '<button type="button" class="nd-btn" data-nd-toggle aria-expanded="false" aria-controls="ndPanel" title="Nucleus and Ask Claude">' +
        '<img class="nd-l" src="/brand/logos/svg/atomic-orbital-mark-small-size-for-light-backgrounds.svg" alt=""><img class="nd-d" src="/brand/logos/svg/atomic-orbital-mark-small-size-for-dark-backgrounds.svg" alt=""><span>' + (isHub ? "Ask Claude" : "Nucleus · Ask Claude") + "</span></button>";
    document.body.appendChild(root);

    var panel = root.querySelector("#ndPanel"), btn = root.querySelector("[data-nd-toggle]");
    function setOpen(o) { panel.hidden = !o; btn.setAttribute("aria-expanded", String(o)); if (o) { var f = panel.querySelector("select, .nd-copy"); if (f) f.focus(); } }
    window.NucleusDock = { open: function () { setOpen(true); }, version: VERSION };
    btn.addEventListener("click", function () { setOpen(panel.hidden); });
    root.addEventListener("click", function (e) {
      if (e.target.closest("[data-nd-close]")) { setOpen(false); btn.focus(); }
      var mb = e.target.closest("[data-nd-min]");
      if (mb) { min = !min; root.classList.toggle("is-min", min); mb.textContent = min ? "Show label" : "Make smaller"; try { sessionStorage.setItem("nucleus:dockmin", min ? "1" : "0"); } catch (er) {} }
      var cp = e.target.closest("[data-nd-copy]");
      if (cp) {
        var done = function () { cp.textContent = "Copied"; cp.classList.add("ok"); setTimeout(function () { cp.textContent = "Copy"; cp.classList.remove("ok"); }, 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(cp.dataset.ndCopy).then(done, function () {}); else done();
      }
    });
    var jump = root.querySelector("[data-nd-jump]");
    if (jump) jump.addEventListener("change", function () { if (jump.value) location.href = jump.value; });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden) { setOpen(false); btn.focus(); } });
    document.addEventListener("click", function (e) { if (!panel.hidden && !root.contains(e.target)) setOpen(false); });
  }

  ready(function () { needRegistry(build); });
})();
