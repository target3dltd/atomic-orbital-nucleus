/*! © 2026 Ashley Keeler. All rights reserved. Unauthorised copying, redistribution or reuse of this code is prohibited. */
/* Nucleus claude-shim v1.0.0
   Lets a page that was built as a claude.ai artifact run inside the Nucleus.
   It provides window.claude.use("mcp" | "db" | "user") backed by Nucleus server functions:
     mcp  → /api/nucleus/pd     (Pipedrive, as the signed-in person)
     db   → /api/nucleus/store  (shared Netlify Blobs storage, one namespace per tool)
     user → the signed-in Pipedrive user
   Usage: <script src="/nucleus/claude-shim.js" data-ns="my-tool"></script> before the page's own script. */
(function () {
  if (window.claude && window.claude.__nucleus !== true && window.claude.use) return; // real claude.ai runtime wins
  var me = document.currentScript;
  var NS = (me && me.getAttribute("data-ns")) || "default";

  function err(code, message, extra) { var e = new Error(message || code); e.code = code; if (extra) for (var k in extra) e[k] = extra[k]; return e; }
  function api(path, opts) {
    return fetch(path, Object.assign({ credentials: "same-origin", cache: "no-store" }, opts || {})).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) { notifySignedOut(); throw err("needs_reauth", j.message || "Sign in to the Nucleus again."); }
        if (!r.ok) throw err(j.code || "tool_error", j.message || ("HTTP " + r.status), { retryable: !!j.retryable, retryAfterMs: j.retryAfterMs });
        return j;
      });
    });
  }
  function notifySignedOut() { try { window.top.postMessage({ nucleus: "signed-out" }, location.origin); } catch (e) {} }

  var sessionP = null;
  function session() {
    if (!sessionP) sessionP = api("/api/nucleus/me").then(function (j) { return j.user; });
    return sessionP;
  }

  var mcp = {
    callTool: function (server, tool, input) {
      if (!/pipedrive/i.test(String(server))) return Promise.reject(err("server_not_connected", "Only Pipedrive is available in the Nucleus."));
      return api("/api/nucleus/pd", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tool: tool, input: input || {} }) })
        .then(function (j) { return { payload: j.payload }; });
    }
  };

  function snap(id, data) { return { id: id, exists: data != null, data: function () { return data; } }; }
  function docRef(path) {
    var q = "/api/nucleus/store";
    var write = function (op, data) { return api(q, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ns: NS, doc: path, op: op, data: data }) }); };
    return {
      get: function () { return api(q + "?ns=" + encodeURIComponent(NS) + "&doc=" + encodeURIComponent(path)).then(function (j) { return snap(path.split("/").pop(), j.exists ? j.data : null); }); },
      set: function (d) { return write("set", d); },
      update: function (d) { return write("update", d); },
      delete: function () { return write("delete"); }
    };
  }
  var db = {
    doc: docRef,
    collection: function (name) {
      return {
        get: function () {
          return api("/api/nucleus/store?ns=" + encodeURIComponent(NS) + "&collection=" + encodeURIComponent(name)).then(function (j) {
            var docs = (j.docs || []).map(function (d) { return snap(d.id, d.data); });
            return { docs: docs, size: docs.length, empty: !docs.length };
          });
        },
        doc: function (id) { return docRef(name + "/" + id); }
      };
    }
  };

  var user = {
    id: function () { return session().then(function (u) { return u ? u.id : null; }); },
    profile: function () { return session(); },
    profiles: function (ids) {
      return session().then(function (u) {
        var out = {}, need = [];
        (ids || []).forEach(function (id) { if (u && id === u.id) out[id] = { name: u.name }; else need.push(id); });
        if (!need.length) return out;
        return api("/api/nucleus/users?ids=" + need.join(",")).then(function (j) { for (var k in j.profiles) out[k] = j.profiles[k]; return out; });
      });
    }
  };

  var ns = { mcp: mcp, db: db, user: user };
  window.claude = { __nucleus: true, use: function (name) { return Promise.resolve(ns[name] || null); } };
})();
