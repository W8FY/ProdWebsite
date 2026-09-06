(function () {
  "use strict";
  var api = window.W8FYGoogleAppsScript;
  var session = null, state = null, review = null, busy = false, expiryTimer;
  var LOGIN_KEY = "w8fy.admin.login", PENDING_KEY = "w8fy.admin.pending";
  var pending = window.localStorage.getItem(PENDING_KEY) || ""; // operation UUID only, never credentials
  var el = function (id) { return document.getElementById(id); };
  function status(message) { el("status").textContent = message; }
  function hide(id, value) { el(id).hidden = value; }
  function proof() {
    var bytes = new Uint8Array(32); window.crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function call(action, data) {
    return api.adminRequest(action, Object.assign({}, data || {}, session ? {session: session.session, csrf: session.csrf} : {}));
  }
  async function work(fn) {
    if (busy) return;
    busy = true;
    document.querySelectorAll("button").forEach(function (b) { b.disabled = true; });
    try { await fn(); } catch (error) { status(error.message || "The request could not complete."); }
    finally {
      busy = false;
      document.querySelectorAll("button").forEach(function (b) { b.disabled = false; });
      el("commit").disabled = !el("confirm").checked || !review || !!pending;
      hide("uncertain", !session || !pending);
      hide("actions", !session || !state || !state.net || !!pending || !!review);
    }
  }
  function option(select, value, label) {
    var node = document.createElement("option"); node.value = value; node.textContent = label; select.appendChild(node);
  }
  function paint(next) {
    state = next; review = null; hide("review", true); el("confirm").checked = false;
    hide("net-panel", !state.net); hide("actions", !state.net || !!pending);
    if (!state.net) { hide("completed", false); el("next-action").textContent = state.nextAction; return; }
    el("net-details").replaceChildren();
    [["Net date", state.net.net_date], ["Net type", {current:"Current Net",two_meter_ncs:"2 Meter NCS Net",weather_special:"Weather/Special Net"}[state.net.net_type] || state.net.net_type],
      ["Net Control", state.net.net_control_callsign], ["Net ID", state.net.id]].forEach(function (pair) {
      var dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = pair[0]; dd.textContent = pair[1]; el("net-details").append(dt, dd);
    });
    el("checkins").replaceChildren(); el("operator").replaceChildren();
    option(el("operator"), "", "Select a checked-in operator");
    state.checkIns.forEach(function (c) {
      var li = document.createElement("li"); li.textContent = c.callsign + (c.name ? " · " + c.name : "") + " · " + c.station_type + (c.traffic ? " · Traffic" : ""); el("checkins").appendChild(li);
      if (c.callsign !== state.net.net_control_callsign) option(el("operator"), c.callsign, c.callsign + (state.pending.some(function (r) {return r.callsign === c.callsign;}) ? " — request ready" : " — request needed"));
    });
    el("recovery-record").replaceChildren(); option(el("recovery-record"), "", "No administrative recovery (ordinary service history)");
    state.recoveries.forEach(function (r) { option(el("recovery-record"), r.id, r.label); });
  }
  async function reload() { paint(await call("adminState")); status(state.net ? "Authoritative net state loaded. Choose the next action." : "No unfinished net. Return to the roster to start a new net."); }
  function clearPending() { pending = ""; window.localStorage.removeItem(PENDING_KEY); hide("uncertain", true); }
  function result(data) {
    if (data.status === "applied") {
      clearPending(); paint(data.state); hide("completed", false);
      el("next-action").textContent = data.result.net.finalized ? "Historical net finalized. No email sent. Return to the roster to view the report or start a new net." : "Ownership recovered. The selected operator can resume their pending request. Next: finalize this historical net using its actual service end.";
      el("report").textContent = data.result.report ? data.result.report.text : "";
      status("Recovery completed and authoritative state reloaded. No email sent.");
    } else if (data.status === "prepared" || data.status === "cancelled") {
      clearPending(); paint(data.state); status("The previous action was not applied. Review the current net again before confirming a new action.");
    } else { status("The previous write has an unresolved result. Further recovery is blocked. Ask the backend owner to inspect AdminOperations; do not repeat the action."); }
  }
  function signedOut(message) {
    session = null; state = null; review = null; window.clearTimeout(expiryTimer);
    ["session-bar","net-panel","actions","review","completed","uncertain"].forEach(function (id) {hide(id, true);});
    hide("login", false); status(message);
  }
  el("sign-in").addEventListener("click", function () { work(async function () {
    var challenge = proof();
    var login = await call("adminBeginLogin", {proof: challenge});
    window.sessionStorage.setItem(LOGIN_KEY, JSON.stringify({proof: challenge, state: login.state, expires: Date.now() + 5 * 60000}));
    window.location.assign(login.url);
  }); });
  el("sign-out").addEventListener("click", function () { work(async function () {
    await call("adminSignOut"); signedOut("Signed out. Administrator access has been revoked.");
  }); });
  el("reload").addEventListener("click", function () { work(reload); });
  el("reconcile").addEventListener("click", function () { work(async function () { result(await call("adminStatus", {operationId: pending})); }); });
  el("kind").addEventListener("change", function () { hide("ownership-fields", el("kind").value !== "recovery"); hide("end-fields", el("kind").value === "recovery"); });
  el("prepare").addEventListener("click", function () { work(async function () {
    var data = {netId: state.net.id, revision: state.revision, kind: el("kind").value, callsign: el("operator").value, reason: el("reason").value};
    if (data.kind === "historical_finalization") {
      if (!el("end-date").value || !el("end-time").value || !/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(el("end-zone").value)) throw Error("Enter the actual ending date, time and UTC offset explicitly.");
      data.endAt = el("end-date").value + "T" + el("end-time").value + ":00" + el("end-zone").value;
      data.recoveryId = el("recovery-record").value;
    }
    review = await call("adminPrepare", data);
    el("review-text").replaceChildren();
    ["Net: " + state.net.net_date + " · " + state.net.net_type + " · " + review.netId, review.changes,
      review.actualEnd ? "Actual service end: " + review.actualEnd : "", review.recoveryId ? "Excluded administrative recovery: " + review.recoveryId : "",
      "Administrator: " + session.email, "Reason: " + review.reason, review.preserved, "Review expires: " + review.expires].filter(Boolean).forEach(function (text) {
      var p = document.createElement("p"); p.textContent = text; el("review-text").appendChild(p);
    });
    el("confirm").checked = false; hide("actions", true); hide("review", false); el("review").focus(); status("Review the exact changes before confirming.");
  }); });
  el("confirm").addEventListener("change", function () {el("commit").disabled = busy || !el("confirm").checked || !!pending;});
  el("cancel").addEventListener("click", function () {review = null; hide("review", true); hide("actions", false);});
  el("commit").addEventListener("click", function () { work(async function () {
    if (!review || !el("confirm").checked || pending) return;
    pending = review.id; window.localStorage.setItem(PENDING_KEY, pending);
    hide("review", true); review = null;
    status("Applying the reviewed change. If the connection times out, reconcile the result before continuing.");
    result(await call("adminCommit", {operationId: pending, confirm: true}));
  }); });
  work(async function () {
    var callback = window.W8FY_ADMIN_CALLBACK || {}; delete window.W8FY_ADMIN_CALLBACK;
    if (!callback.code && !callback.error) return;
    var raw = window.sessionStorage.getItem(LOGIN_KEY); window.sessionStorage.removeItem(LOGIN_KEY);
    if (callback.error) throw Error("Google sign-in was cancelled or denied. You can sign in again.");
    var login = raw ? JSON.parse(raw) : null;
    if (!login || login.expires <= Date.now() || login.state !== callback.state) throw Error("Sign-in did not start in this browser or expired. Sign in again.");
    session = await call("adminCompleteLogin", {code: callback.code, state: callback.state, proof: login.proof});
    callback.code = null; login.proof = null;
    hide("login", true); hide("session-bar", false);
    el("identity").textContent = session.email + " · Session ends " + new Date(session.expires).toLocaleTimeString();
    expiryTimer = window.setTimeout(function () { signedOut("Administrator session expired. Sign in again to continue or reconcile a pending action."); }, Math.max(0, session.expires - Date.now()));
    if (pending) result(await call("adminStatus", {operationId: pending})); else await reload();
  });
}());
