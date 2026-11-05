/*! © 2026 Ashley Keeler. All rights reserved. Unauthorised copying, redistribution or reuse of this code is prohibited. */
/* Atomic Orbital skin, theme sync (v1.0.0)
   Keeps a tool on the same light/dark choice as the Nucleus (localStorage "theme"), live.
   Options on the script tag:
     data-keys="t3d-theme"      the tool's own storage key(s), kept in step both ways
     data-attr="data-ui-theme"  another <html> attribute the tool reads
     data-body-dark="dark-theme" a <body> class the tool uses for dark mode
     data-on-change="fnName"    a global function to call after a change */
(function () {
  var s = document.currentScript, d = document.documentElement, o = (s && s.dataset) || {};
  var keys = (o.keys || "").split(",").map(function (k) { return k.trim(); }).filter(Boolean);
  var real = Storage.prototype.setItem, busy = false;
  function read() { try { return localStorage.getItem("theme"); } catch (e) { return null; } }
  function pick(t) { return t === "dark" || t === "light" ? t : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); }
  function apply(t) {
    t = pick(t); busy = true;
    d.setAttribute("data-theme", t);
    if (o.attr) d.setAttribute(o.attr, t);
    keys.forEach(function (k) { try { real.call(localStorage, k, t); } catch (e) {} });
    var body = function () { if (o.bodyDark && document.body) document.body.classList.toggle(o.bodyDark, t === "dark"); if (o.onChange && typeof window[o.onChange] === "function") try { window[o.onChange](t); } catch (e) {} };
    if (document.body) body(); else document.addEventListener("DOMContentLoaded", body);
    busy = false;
  }
  // The tool's own theme switch: mirror it into the Nucleus choice
  Storage.prototype.setItem = function (k, v) {
    real.apply(this, arguments);
    if (!busy && this === localStorage && keys.indexOf(k) >= 0 && (v === "light" || v === "dark")) { try { real.call(localStorage, "theme", v); } catch (e) {} d.setAttribute("data-theme", v); if (o.attr) d.setAttribute(o.attr, v); }
  };
  if (o.bodyDark) document.addEventListener("click", function () {
    setTimeout(function () { if (!document.body) return; var t = document.body.classList.contains(o.bodyDark) ? "dark" : "light"; if (d.getAttribute("data-theme") !== t) { d.setAttribute("data-theme", t); try { real.call(localStorage, "theme", t); } catch (e) {} } }, 0);
  }, true);
  apply(read());
  window.addEventListener("storage", function (e) { if (e.key === "theme") apply(e.newValue); });
})();
