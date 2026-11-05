/*! © 2026 Ashley Keeler. All rights reserved. Unauthorised copying, redistribution or reuse of this code is prohibited. */
/* Nucleus dash-runtime v1.0.0
   Runs a page written for the claude.ai Dashboard type inside the Nucleus. It provides the same `dash`
   object (data, loader, calc, onData, colors, refresh, setLink, params) and fetches each dataset through
   Nucleus server functions, as the signed-in person:
     connector "Pipedrive" → /api/nucleus/pd     (any tool nucleus-pd.mjs offers)
     connector "Gmail"     → /api/nucleus/gmail  (the support@ mailbox, set up by an admin)
   Usage: define window.DASH_DATASETS = { id: { title, description, source: { connector, tool, args } } }
   before this script, then put the dashboard's own HTML inside <div id="dash-root">. */
(function () {
  var sets = window.DASH_DATASETS || {};
  var loaders = {}, calcs = {}, state = {}, listeners = [], params = {}, defaults = {};
  var root = null, pending = false;

  function now() { return new Date().toISOString(); }
  function toRows(x) {
    if (Array.isArray(x)) return x;
    if (x && typeof x === "object") { if (Array.isArray(x.rows)) return x.rows; if (Array.isArray(x.data)) return x.data; if (Array.isArray(x.results)) return x.results; }
    return x;
  }
  function colsOf(rows) { return Array.isArray(rows) && rows.length && typeof rows[0] === "object" ? Object.keys(rows[0]) : []; }
  function notify() {
    if (pending) return; pending = true;
    Promise.resolve().then(function () { pending = false; listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error("[dash] redraw failed", e); } }); renderSources(); });
  }

  function endpoint(src) {
    var c = String(src.connector || "").toLowerCase();
    if (c === "pipedrive") return ["/api/nucleus/pd", { tool: src.tool, input: src.args || {} }];
    if (c === "gmail") return ["/api/nucleus/gmail", { tool: src.tool, input: src.args || {} }];
    return null;
  }

  function load(id) {
    var ds = sets[id], s = state[id] || (state[id] = { status: "loading", data: [], columns: [], meta: [], message: "", refreshing: false });
    var ep = endpoint(ds.source || {});
    if (!ep) { s.status = "error"; s.message = "The Nucleus can't reach the “" + (ds.source && ds.source.connector) + "” connector."; notify(); return; }
    s.started = true;
    fetch(ep[0], { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(ep[1]) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; }); })
      .then(function (x) {
        if (x.r.status === 401 && x.j.code === "needs_reauth") { try { window.top.postMessage({ nucleus: "signed-out" }, location.origin); } catch (e) {} }
        if (!x.r.ok) { s.status = x.j.code === "not_configured" ? "connect" : "error"; s.message = x.j.message || ("HTTP " + x.r.status); s.refreshing = false; return; }
        var answer = x.j.payload, out;
        if (loaders[id]) {
          out = loaders[id]({ answer: typeof answer === "string" ? answer : JSON.stringify(answer), args: ds.source.args || {} });
          s.data = toRows(out); s.columns = (out && out.columns) || colsOf(s.data); s.meta = (out && out.meta) || [];
        } else { s.data = toRows(answer); s.columns = colsOf(s.data); s.meta = []; }
        s.status = "ok"; s.message = ""; s.refreshing = false; s.at = now();
      })
      .catch(function (e) { s.status = "error"; s.message = String(e && e.message || e); s.refreshing = false; })
      .then(notify);
  }

  function calcState(id) {
    var c = calcs[id], ins = c.inputs.map(function (i) { return dash.data(i); });
    var bad = ins.filter(function (r) { return r.status === "error"; })[0];
    if (bad) return { status: "error", data: [], columns: [], meta: [], message: bad.message };
    var con = ins.filter(function (r) { return r.status === "connect"; })[0];
    if (con) return { status: "connect", data: [], columns: [], meta: [], message: con.message };
    if (ins.some(function (r) { return r.status !== "ok"; })) return { status: "loading", data: [], columns: [], meta: [], message: "" };
    var key = ins.map(function (r) { return r.version || 0; }).join(",");
    if (c.cacheKey === key) return c.cached;
    var res;
    try { var d = c.fn.apply(null, ins.map(function (r) { return r.data; })); res = { status: "ok", data: d, columns: colsOf(d), meta: [], message: "" }; }
    catch (e) { res = { status: "error", data: [], columns: [], meta: [], message: "Calculation “" + (c.title || id) + "” didn't run: " + (e && e.message || e) }; }
    res.refreshing = ins.some(function (r) { return r.refreshing; });
    c.v = (c.v || 0) + 1; res.version = c.v;
    c.cacheKey = key; c.cached = res; return res;
  }

  var versions = {};
  var dash = window.dash = {
    data: function (id) {
      var r;
      if (calcs[id]) r = calcState(id);
      else if (sets[id]) { if (!state[id] || !state[id].started) load(id); r = state[id]; }
      else r = { status: "missing", data: [], columns: [], meta: [], message: "No source called " + id };
      if (r === state[id] && r.status === "ok" && r.vAt !== r.at) { r.vAt = r.at; versions[id] = (versions[id] || 0) + 1; r.version = versions[id]; }
      return { status: r.status, data: r.data, rows: r.data, columns: r.columns, value: r.data, meta: r.meta, message: r.message, refreshing: !!r.refreshing, version: r.version };
    },
    loader: function (id, o) { loaders[id] = o.fn; },
    calc: function (id, o) { calcs[id] = { inputs: o.inputs || [], fn: o.fn, title: o.title, description: o.description }; },
    onData: function (fn) { listeners.push(fn); try { fn(); } catch (e) { console.error(e); } },
    colors: ["var(--dash-c1)", "var(--dash-c2)", "var(--dash-c3)", "var(--dash-c4)", "var(--dash-c5)", "var(--dash-c6)", "var(--dash-c7)", "var(--dash-c8)"],
    refresh: function (id) { var s = state[id]; if (!s) return dash.data(id); s.refreshing = true; notify(); load(id); },
    setLink: function (name) { try { history.replaceState(null, "", "#" + encodeURIComponent(name)); } catch (e) {} },
    params: function () { return Object.assign({}, defaults, params); },
    setParams: function (p) { Object.assign(params, p || {}); notify(); },
    resetParams: function () { params = {}; notify(); }
  };

  // Redraw when the page's width changes
  var lastW = 0;
  function watchWidth() {
    root = document.getElementById("dash-root"); if (!root || !window.ResizeObserver) return;
    new ResizeObserver(function () { var w = root.clientWidth; if (Math.abs(w - lastW) > 4) { lastW = w; notify(); } }).observe(root);
  }

  // Sources strip: where each number comes from, its state, refresh and CSV download
  var srcEl = null;
  function renderSources() {
    if (!srcEl) return;
    var ids = Object.keys(sets);
    var ok = ids.filter(function (i) { return state[i] && state[i].status === "ok"; }).length;
    var probs = ids.filter(function (i) { return state[i] && (state[i].status === "error" || state[i].status === "connect"); });
    var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
    var open = srcEl.open;
    srcEl.innerHTML = "<summary><span><b>Sources</b> · " + ok + " of " + ids.length + " loaded" + (probs.length ? " · " + probs.length + " need attention" : "") + "</span><span class=\"dash-chev\">Details</span></summary><ul>" +
      ids.map(function (i) {
        var d = sets[i], s = state[i] || { status: "loading" };
        var when = s.at ? new Date(s.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
        return "<li><span class=\"t\"><i class=\"dash-dot " + s.status + "\"></i>" + esc(d.title || i) + "</span><span>" + esc(d.source.connector) + " · " + esc(d.source.tool) + "</span>" +
          (s.status === "ok" ? "<span>" + (Array.isArray(s.data) ? s.data.length + " rows · " : "") + "loaded " + esc(when) + "</span>" : "<span>" + esc(s.status === "loading" ? "Loading…" : s.message) + "</span>") +
          "<span style=\"margin-left:auto\"><button type=\"button\" data-refresh=\"" + esc(i) + "\">Refresh</button> " + (s.status === "ok" && Array.isArray(s.data) ? "<button type=\"button\" data-csv=\"" + esc(i) + "\">CSV</button>" : "") + "</span>" +
          (d.description ? "<span class=\"d\">" + esc(d.description) + "</span>" : "") + "</li>";
      }).join("") + "</ul>";
    srcEl.open = open;
  }
  function csv(id) {
    var s = state[id], cols = s.columns.length ? s.columns : colsOf(s.data);
    var q = function (v) { v = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n]/.test(v) ? "\"" + v.replace(/"/g, "\"\"") + "\"" : v; };
    var text = [cols.join(",")].concat(s.data.map(function (r) { return cols.map(function (c) { return q(r[c]); }).join(","); })).join("\n");
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" })); a.download = id + ".csv"; document.body.append(a); a.click(); a.remove();
  }
  function mountSources() {
    root = document.getElementById("dash-root"); if (!root) return;
    srcEl = document.createElement("details"); srcEl.className = "dash-src";
    root.parentNode.insertBefore(srcEl, root);
    srcEl.style.maxWidth = "1248px"; srcEl.style.margin = "16px auto 0"; srcEl.style.width = "calc(100% - 32px)";
    srcEl.addEventListener("click", function (e) {
      var r = e.target.closest("[data-refresh]"), c = e.target.closest("[data-csv]");
      if (r) { e.preventDefault(); dash.refresh(r.dataset.refresh); }
      if (c) { e.preventDefault(); csv(c.dataset.csv); }
    });
    renderSources();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { mountSources(); watchWidth(); notify(); });
  else { mountSources(); watchWidth(); }
})();
