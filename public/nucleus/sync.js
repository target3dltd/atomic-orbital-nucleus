/*! © 2026 Ashley Keeler. All rights reserved. Unauthorised copying, redistribution or reuse of this code is prohibited. */
/* Nucleus sync v1.0.0: keeps the work and settings tools save in the browser with your account, so they follow you
   to any device. Loaded first on every tool page. Only the keys listed below are synced; the newest change wins.
   Server side: /api/nucleus/prefs (one record per person per tool, readable only by that person). */
(function () {
  "use strict";
  if (window.NucleusSync) return;
  var LS; try { LS = window.localStorage; } catch (e) { return; }
  if (!LS) return;

  // tool → keys it keeps in the browser that are worth keeping with your account
  var SPEC = {
    "nucleus":          [/^theme$/, /^nucleus:recent$/],
    "sow-builder":      [/^sowDrafts$/, /^sowBuilderSettings$/],
    "system-designer":  [/^t3d_quote_/, /^t3d-sd-site-visits$/, /^mocap_presets$/, /^target3d_hotkeys_v2$/, /^target3d_custom_actions_v1$/, /^t3d-pd-sku-map$/, /^t3d_lang$/, /^t3d_show_hints$/],
    "mocap-toolkit":    [/^biomechanics_layout_slot_/, /^biomechanics_session_history_v1$/, /^biomechanics_theme$/],
    "motive":           [/^mup\.(me|mine|gbp|sort)$/],
    "duplicate-eraser": [/^md\.(sub|scope)$/],
    "team-performance": [/^t3d_me$/],
    "optitrack-docs":   [/^ot-(pins|open|ver)$/],   // Clays and Drift share these in the browser
    "lle":              [/^ll-(pins|open|ver)$/]
  };
  var BY_PATH = [[/^\/tools\/team-dashboards\//, "team-performance"], [/^\/projects\/(clays|drift)\//, "optitrack-docs"], [/^\/tools\/([a-z0-9-]+)\//, null], [/^\/projects\/([a-z0-9-]+)\//, null], [/^\/(index\.html)?$/, "nucleus"]];
  function toolFor(path) {
    for (var i = 0; i < BY_PATH.length; i++) { var m = path.match(BY_PATH[i][0]); if (m) { var t = BY_PATH[i][1] || m[1]; return SPEC[t] ? t : null; } }
    return null;
  }
  function matches(tool, key) { var l = SPEC[tool] || []; for (var i = 0; i < l.length; i++) if (l[i].test(key)) return true; return false; }
  function toolOfKey(key) { for (var t in SPEC) if (matches(t, key)) return t; return null; }

  var STAMP = "nucleus:at:", raw = { set: Storage.prototype.setItem, get: Storage.prototype.getItem, del: Storage.prototype.removeItem };
  var stamp = function (k) { return Number(raw.get.call(LS, STAMP + k)) || 0; };
  var setStamp = function (k, at) { try { raw.set.call(LS, STAMP + k, String(at)); } catch (e) {} };
  var localKeys = function (tool) { var out = []; for (var i = 0; i < LS.length; i++) { var k = LS.key(i); if (k && k.indexOf(STAMP) !== 0 && matches(tool, k)) out.push(k); } return out; };

  // ---- push local changes (debounced; large values go by normal request, small ones survive leaving the page) ----
  var queue = {}, timer = 0;
  function enqueue(tool, key, entry) { (queue[tool] = queue[tool] || {})[key] = entry; clearTimeout(timer); timer = setTimeout(flush, 1000); }
  function flush(leaving) {
    clearTimeout(timer);
    Object.keys(queue).forEach(function (tool) {
      var body = JSON.stringify({ tool: tool, keys: queue[tool] }); delete queue[tool];
      try { fetch("/api/nucleus/prefs", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: body, keepalive: !!leaving && body.length < 60000 }); } catch (e) {}
    });
  }
  window.addEventListener("pagehide", function () { flush(true); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(true); });

  Storage.prototype.setItem = function (k, v) {
    raw.set.call(this, k, v);
    if (this === LS && k.indexOf(STAMP) !== 0) { var t = toolOfKey(k); if (t) { var at = Date.now(); setStamp(k, at); enqueue(t, k, { v: String(v), at: at }); } }
  };
  Storage.prototype.removeItem = function (k) {
    raw.del.call(this, k);
    if (this === LS && k.indexOf(STAMP) !== 0) { var t = toolOfKey(k); if (t) { var at = Date.now(); setStamp(k, at); enqueue(t, k, { del: true, at: at }); } }
  };

  // ---- bring the account's copy into this browser; returns true if anything here changed ----
  function apply(tool, keys) {
    var changed = false, push = {};
    Object.keys(keys || {}).forEach(function (k) {
      if (!matches(tool, k)) return;
      var s = keys[k], mine = stamp(k);
      if (s.at > mine) {
        var cur = raw.get.call(LS, k);
        if (s.del) { if (cur != null) { raw.del.call(LS, k); changed = true; } }
        else if (cur !== s.v) { try { raw.set.call(LS, k, s.v); changed = true; } catch (e) {} }
        setStamp(k, s.at);
      } else if (mine > s.at) {
        var v = raw.get.call(LS, k); push[k] = v == null ? { del: true, at: mine } : { v: v, at: mine };
      }
    });
    // things saved in this browser before syncing existed (or never sent) go up to the account
    localKeys(tool).forEach(function (k) {
      if (!keys || !keys[k]) { var at = stamp(k) || Date.now(); setStamp(k, at); push[k] = { v: raw.get.call(LS, k), at: at }; }
    });
    if (Object.keys(push).length) { Object.keys(push).forEach(function (k) { enqueue(tool, k, push[k]); }); }
    return changed;
  }
  function pull(tool) {
    return fetch("/api/nucleus/prefs?tool=" + encodeURIComponent(tool), { credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { return j && j.ok ? apply(tool, j.keys) : false; }).catch(function () { return false; });
  }

  var tool = toolFor(location.pathname);
  window.NucleusSync = {
    version: "1.0.0", tool: tool,
    // the hub calls this so every tool's saved work is already in the browser before you open it
    warmAll: function () {
      return fetch("/api/nucleus/prefs?tool=*", { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (!j || !j.ok) return; Object.keys(SPEC).forEach(function (t) { if (t !== "nucleus" || !tool) apply(t, (j.tools || {})[t] || {}); }); }).catch(function () {});
    }
  };
  if (tool) {
    pull(tool).then(function (changed) {
      // the page has already read the old values, so show the newer ones (once; never in a loop)
      if (!changed || tool === "nucleus") return;
      var flag = "nucleus:synced:" + tool, last = 0;
      try { last = Number(sessionStorage.getItem(flag)) || 0; sessionStorage.setItem(flag, String(Date.now())); } catch (e) { return; }
      if (Date.now() - last > 15000) location.reload();
    });
  }
})();
