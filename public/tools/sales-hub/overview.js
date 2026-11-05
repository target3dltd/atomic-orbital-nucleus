/*! © 2026 Ashley Keeler. All rights reserved. Unauthorised copying, redistribution or reuse of this code is prohibited. */
/* Sales Hub overview v1.0.0. Same scope and targets as the Revenue Scoreboard, so the two always agree:
   pipelines 1, 24, 11 (UK Tech Sales SI and PS, Studio Sales), GBP, FY from 1 April 2026,
   £3.8m minimum and £4.56m stretch over 252 working days (England and Wales bank holidays excluded). */
(function () {
  "use strict";
  var PD = "/api/sales-hub/pipedrive";
  var FY_START = new Date("2026-04-01T00:00:00"), FY_END = new Date("2027-03-31T23:59:59");
  var SCOPE = { 1: true, 24: true, 11: true };
  var ANNUAL_MIN = 3800000, ANNUAL_STRETCH = 4560000, WORKING_DAYS = 252;
  var DAILY_MIN = ANNUAL_MIN / WORKING_DAYS;
  var BANK = ["2026-04-03","2026-04-06","2026-05-04","2026-05-25","2026-08-31","2026-12-25","2026-12-28","2027-01-01"].reduce(function (o, d) { o[d] = 1; return o; }, {});
  var GP_LABELS = ["expected gp value", "expected gp", "gp value"], COST_LABELS = ["cost price", "supplier cost", "cost"];
  var DEAL_URL = "https://target3d2.pipedrive.com/deal/";

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var gbp = function (v) { return "£" + Math.round(v || 0).toLocaleString("en-GB"); };
  var gbpK = function (v) { var a = Math.abs(v || 0); return a >= 1e6 ? "£" + (v / 1e6).toFixed(2) + "m" : a >= 1e4 ? "£" + Math.round(v / 1e3) + "k" : gbp(v); };
  var pct = function (v) { return isFinite(v) ? Math.round(v) + "%" : "—"; };
  var isoDay = function (d) { var z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
  var pdDate = function (s) { if (!s) return null; var d = new Date(String(s).replace(" ", "T") + (/[Z+]/.test(s) || s.length <= 10 ? "" : "Z")); return isNaN(d) ? null : d; };
  var day0 = function (d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  var daysFrom = function (a, b) { return Math.round((day0(b) - day0(a)) / 864e5); };
  function workingDays(a, b) {
    var n = 0, cur = day0(a), stop = day0(b);
    while (cur <= stop) { var w = cur.getDay(); if (w && w !== 6 && !BANK[isoDay(cur)]) n++; cur.setDate(cur.getDate() + 1); }
    return n;
  }
  function monday(d) { var x = day0(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }

  function api(path, params) {
    var q = new URLSearchParams(Object.assign({ path: path }, params || {}));
    return fetch(PD + "?" + q, { credentials: "same-origin" }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || j.success === false) throw new Error(j.error || ("Pipedrive " + r.status));
        return j;
      });
    });
  }
  function all(path, params) {
    var out = [];
    function page(start) {
      return api(path, Object.assign({}, params, { limit: 500, start: start })).then(function (j) {
        out = out.concat(j.data || []);
        var p = j.additional_data && j.additional_data.pagination;
        if (p && p.more_items_in_collection && (j.data || []).length && out.length < 20000) return page(p.next_start || out.length);
        return out;
      });
    }
    return page(0);
  }

  var state = { view: "soon" };

  function load() {
    $("dot").className = "sync-dot loading"; $("syncLabel").textContent = "Loading from Pipedrive…"; $("err").hidden = true;
    return Promise.all([api("/dealFields"), api("/stages"), all("/deals", { status: "won" }), all("/deals", { status: "open" })]).then(function (r) {
      var fields = r[0].data || [], stages = {};
      (r[1].data || []).forEach(function (s) { stages[s.id] = s.name; });
      var find = function (labels) {
        var f = fields.find(function (x) { return labels.indexOf((x.name || "").toLowerCase()) >= 0; });
        return f ? f.key : null;
      };
      var gpKey = find(GP_LABELS), costKey = find(COST_LABELS);
      var gpOf = function (d) {
        var g = gpKey ? parseFloat(d[gpKey]) : NaN; if (!isNaN(g) && g) return g;
        var c = costKey ? parseFloat(d[costKey]) : NaN; if (!isNaN(c) && c) return (d.value || 0) - c;
        return null;
      };
      var inScope = function (d) { return SCOPE[d.pipeline_id] && (d.currency || "GBP") === "GBP"; };
      var shape = function (d) {
        return { id: d.id, title: d.title, value: Number(d.value) || 0, owner: (d.user_id && d.user_id.name) || d.owner_name || "Unassigned",
          status: d.status, won: pdDate(d.won_time), added: pdDate(d.add_time), close: d.expected_close_date ? pdDate(d.expected_close_date) : null,
          lastAct: d.last_activity_date ? pdDate(d.last_activity_date) : null, prob: d.probability, stage: stages[d.stage_id] || "—", gp: gpOf(d) };
      };
      state.won = r[2].filter(function (d) { return d.status === "won" && inScope(d); }).map(shape).filter(function (d) { return d.won && d.won >= FY_START; });
      state.open = r[3].filter(function (d) { return d.status === "open" && inScope(d); }).map(shape);
      state.addedThisWeek = r[2].concat(r[3]).filter(function (d) { return inScope(d); }).map(shape).filter(function (d) { return d.added && d.added >= monday(new Date()); });
      state.loaded = new Date();
      render();
      $("dot").className = "sync-dot live";
      $("syncLabel").textContent = "Live · " + state.won.length + " won this FY · " + state.open.length + " open · updated " + state.loaded.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    }).catch(function (e) {
      $("dot").className = "sync-dot error"; $("syncLabel").textContent = "Couldn't load";
      $("err").textContent = "Couldn't load from Pipedrive: " + e.message; $("err").hidden = false;
    });
  }

  function render() {
    var now = new Date(), sum = function (a, k) { return a.reduce(function (t, d) { return t + (d[k] || 0); }, 0); };
    var ytd = sum(state.won, "value");
    var wdSoFar = workingDays(FY_START, now), wdLeft = Math.max(0, workingDays(new Date(day0(now).getTime() + 864e5), FY_END));
    var pace = wdSoFar * DAILY_MIN, diff = ytd - pace;
    var toFind = Math.max(0, ANNUAL_MIN - ytd), toStretch = Math.max(0, ANNUAL_STRETCH - ytd);
    var withGp = state.won.filter(function (d) { return d.gp != null; }), gp = sum(withGp, "gp"), gpBase = sum(withGp, "value");
    var wk = monday(now), lwk = new Date(wk.getTime() - 7 * 864e5);
    var wonW = state.won.filter(function (d) { return d.won >= wk; }), wonL = state.won.filter(function (d) { return d.won >= lwk && d.won < wk; });
    var wv = sum(wonW, "value"), lv = sum(wonL, "value");
    var soon = state.open.filter(function (d) { var n = d.close && daysFrom(now, d.close); return d.close && n >= 0 && n <= 30; }).sort(function (a, b) { return a.close - b.close; });
    var late = state.open.filter(function (d) { return d.close && daysFrom(now, d.close) < 0; }).sort(function (a, b) { return b.value - a.value; });
    state.soon = soon; state.late = late;
    var cls = ytd >= pace ? "ok" : ytd >= pace * 0.85 ? "warn" : "bad";
    var tile = function (c, l, v, n, meter) { return '<div class="tile ' + c + '"><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="n">' + n + "</div>" + (meter || "") + "</div>"; };
    var arrow = function (d) { return d >= 0 ? '<span class="up">▲ ' + gbpK(d) + "</span>" : '<span class="down">▼ ' + gbpK(-d) + "</span>"; };
    $("tiles").innerHTML = [
      tile(cls, "FY to date", gbpK(ytd), arrow(diff) + " " + (diff >= 0 ? "ahead of" : "behind") + " minimum pace (" + gbpK(pace) + ")",
        '<div class="meter" title="' + pct(ytd / ANNUAL_MIN * 100) + ' of £3.8m"><i class="' + cls + '" style="width:' + Math.min(100, ytd / ANNUAL_MIN * 100) + '%"></i></div>'),
      tile("info", "Still to find", gbpK(toFind), "to £3.8m · <b>" + gbpK(wdLeft ? toFind / wdLeft : toFind) + "</b> per working day for the " + wdLeft + " left · " + gbpK(toStretch) + " to stretch"),
      tile(withGp.length ? "info" : "", "Gross profit FY", withGp.length ? gbpK(gp) : "—", withGp.length ? "<b>" + pct(gpBase ? gp / gpBase * 100 : NaN) + "</b> blended · GP recorded on " + withGp.length + " of " + state.won.length + " won deals" : "No GP recorded on won deals yet"),
      tile(wv >= lv ? "ok" : "warn", "Won this week", gbpK(wv), wonW.length + " deal" + (wonW.length === 1 ? "" : "s") + " · vs last week " + arrow(wv - lv)),
      tile("", "New this week", String(state.addedThisWeek.length), gbpK(sum(state.addedThisWeek, "value")) + " of new deals since Monday"),
      tile(late.length ? "warn" : "ok", "Closing in 30 days", String(soon.length), gbpK(sum(soon, "value")) + " expected · <b>" + late.length + "</b> past their close date")
    ].join("");

    // by owner
    var owners = {};
    state.won.forEach(function (d) { var o = owners[d.owner] = owners[d.owner] || { n: 0, rev: 0, gp: 0, gpBase: 0, open: 0, pipe: 0 }; o.n++; o.rev += d.value; if (d.gp != null) { o.gp += d.gp; o.gpBase += d.value; } });
    state.open.forEach(function (d) { var o = owners[d.owner] = owners[d.owner] || { n: 0, rev: 0, gp: 0, gpBase: 0, open: 0, pipe: 0 }; o.open++; o.pipe += d.value; });
    var rows = Object.keys(owners).map(function (k) { return Object.assign({ name: k }, owners[k]); }).sort(function (a, b) { return b.rev - a.rev || b.pipe - a.pipe; });
    var T = rows.reduce(function (t, o) { ["n", "rev", "gp", "gpBase", "open", "pipe"].forEach(function (k) { t[k] += o[k]; }); return t; }, { n: 0, rev: 0, gp: 0, gpBase: 0, open: 0, pipe: 0 });
    var orow = function (o, tag) { return "<tr><" + tag + ">" + esc(o.name) + "</" + tag + '><td class="num">' + o.n + '</td><td class="num">' + gbp(o.rev) + '</td><td class="num">' + (o.gpBase ? gbp(o.gp) : "—") + '</td><td class="num">' + (o.gpBase ? pct(o.gp / o.gpBase * 100) : "—") + '</td><td class="num">' + o.open + '</td><td class="num">' + gbp(o.pipe) + "</td></tr>"; };
    $("owners").innerHTML = rows.length ? rows.map(function (o) { return orow(o, "td"); }).join("") : '<tr><td colspan="7" class="empty">No deals yet</td></tr>';
    $("ownersFoot").innerHTML = rows.length > 1 ? orow(Object.assign({ name: "Total" }, T), "td") : "";
    renderClosing();
  }

  function renderClosing() {
    var now = new Date(), list = state.view === "soon" ? state.soon : state.late;
    var total = list.reduce(function (t, d) { return t + d.value; }, 0);
    $("closeSub").textContent = list.length + " deal" + (list.length === 1 ? "" : "s") + " · " + gbpK(total) + (state.view === "late" ? " · largest first" : " · soonest first");
    $("closing").innerHTML = list.length ? list.slice(0, 40).map(function (d) {
      var idle = d.lastAct ? daysFrom(d.lastAct, now) : null;
      var chip = idle == null ? '<span class="chip bad">none</span>' : '<span class="chip ' + (idle > 21 ? "bad" : idle > 10 ? "warn" : "ok") + '">' + idle + "d ago</span>";
      var due = daysFrom(now, d.close);
      return '<tr><td><a href="' + DEAL_URL + d.id + '" target="_blank" rel="noopener">' + esc(d.title) + "</a></td><td>" + esc(d.owner) + '</td><td><span class="chip grey">' + esc(d.stage) + '</span></td><td class="num">' + gbp(d.value) +
        '</td><td class="num">' + (d.prob == null ? "—" : d.prob + "%") + '</td><td class="num">' + d.close.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) +
        (due < 0 ? ' <span class="chip bad">' + (-due) + "d late</span>" : "") + '</td><td class="num">' + chip + "</td></tr>";
    }).join("") + (list.length > 40 ? '<tr><td colspan="7" class="empty">and ' + (list.length - 40) + " more: see Pipeline Triage</td></tr>" : "")
      : '<tr><td colspan="7" class="empty">' + (state.view === "soon" ? "Nothing expected to close in the next 30 days" : "No open deals are past their close date") + "</td></tr>";
  }

  document.querySelectorAll(".seg button").forEach(function (b) {
    b.addEventListener("click", function () {
      state.view = b.dataset.v;
      document.querySelectorAll(".seg button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      if (state.loaded) renderClosing();
    });
  });
  $("refresh").addEventListener("click", load);
  load();
})();
