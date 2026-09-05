/* Run: node net-checkin/tests/connection-recovery.cjs */
async function runTests(apiSource, appSource) {
  const assert = (v, m) => { if (!v) throw Error(m); };
  const results = [];
  async function test(name, fn) { await fn(); results.push(name); }
  const network = () => Object.assign(Error("Network unavailable"), {type: "network", isConnectionError: true});
  const missing = () => Object.assign(Error("Net not found."), {type: "api"});
  const payload = id => ({net: {id, net_control_callsign: "W8FY", net_type: "two_meter_ncs"}, checkIns: []});
  function apiHarness(fetch) {
    const timers = new Map(); let next = 0, calls = 0, aborted = false;
    const window = {W8FY_GOOGLE_APPS_SCRIPT_CONFIG: {url: "https://script.google.com/macros/s/test/exec"},
      fetch: (...args) => {calls++; return fetch(...args);},
      AbortController: class {constructor(){this.signal = {};} abort(){aborted = true;}},
      setTimeout: (fn, ms) => {assert(ms === 20000, "deadline"); timers.set(++next, fn); return next;},
      clearTimeout: id => timers.delete(id)};
    new Function("window", "URL", apiSource)(window, URL);
    return {api: window.W8FYGoogleAppsScript, fire: () => [...timers.values()].forEach(fn => fn()),
      timers, calls: () => calls, aborted: () => aborted};
  }
  const response = data => ({ok: true, status: 200, text: async () => JSON.stringify({success: true, data})});
  for (const body of [false, true]) await test(body ? "stalled body" : "stalled fetch", async () => {
    const h = apiHarness(() => body ? Promise.resolve({text: () => new Promise(() => {})}) : new Promise(() => {}));
    const p = h.api.health().catch(e => e); await Promise.resolve(); h.fire();
    const e = await p;
    assert(e.type === "timeout" && e.isConnectionError && h.aborted(), "timeout and abort");
    assert(h.calls() === 1 && !h.timers.size, "no retry, timer cleanup");
  });
  await test("write timeout is uncertain and never repeated", async () => {
    const h = apiHarness(() => new Promise(() => {}));
    const p = h.api.createNet({}).catch(e => e); h.fire();
    assert((await p).message.includes("may already have succeeded") && h.calls() === 1, "uncertain single write");
  });
  await test("late response and explicit retry recovery", async () => {
    let release; const h = apiHarness(() => new Promise(r => {release = r;}));
    const p = h.api.health().catch(e => e); h.fire(); assert((await p).type === "timeout", "deadline");
    release(response({status: "ok"})); await Promise.resolve();
    const retry = h.api.health(); release(response({status: "ok"}));
    assert((await retry).status === "ok" && h.calls() === 2 && !h.timers.size, "retry succeeds");
  });
  await test("HTTP and HTML response errors", async () => {
    for (const [ok, status, type] of [[false, 403, "http"], [true, 200, "invalid-response"]]) {
      const h = apiHarness(async () => ({ok, status, text: async () => "<html>Sign in</html>"}));
      assert((await h.api.health().catch(e => e)).type === type && !h.timers.size, type);
    }
  });
  function appHarness(overrides = {}, saved = "saved") {
    const storage = new Map(saved ? [["w8fy.netCheckin.lastNetId", saved], ["w8fy.netCheckin.ownerToken." + saved, "secret"]] : []);
    const nodes = {};
    function node(id) {return nodes[id] || (nodes[id] = {value: "", hidden: false, disabled: false, textContent: "",
      lastElementChild: {}, classList: {add(){}, remove(){}, toggle(){}}, listeners: {},
      addEventListener(k, fn){this.listeners[k] = fn;}, querySelectorAll(){return [];}, setAttribute(){}, focus(){}});}
    const calls = [];
    const defaults = {health: async () => ({status: "ok"}), getNet: async () => payload("saved"),
      getActiveNet: async () => payload("active"), validateNetControlOwnership: async () => ({valid: true}),
      createNet: async () => {throw Error("Unexpected write");}};
    const api = {isConfigured: () => true};
    Object.keys(defaults).forEach(k => {api[k] = async (...args) => {calls.push(k); return (overrides[k] || defaults[k])(...args);};});
    const window = {W8FYGoogleAppsScript: api, clearTimeout(){}, setTimeout(){return 1;},
      localStorage: {getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k)}};
    const document = {addEventListener(){}, getElementById: node, querySelectorAll: () => [],
      querySelector: s => ({value: s.includes("Station") ? "Home" : "No"})};
    // Keep actual connection, restoration, storage, event binding, state mapping and locking.
    // Stub visual rendering and background polling, which are outside these unit tests.
    const source = appSource.replace(/\}\(\)\);\s*$/, "cacheElements(); renderApplication = function(){setInterfaceLocking();}; renderNetControlAccess = function(){}; updatePollingTimers = function(){}; bindFinalizedActivityListeners = function(){}; bindEvents(); window.test = {connectAndRestore, startNet, canEditNet}; }());");
    new Function("window", "document", source)(window, document);
    node("net-date").value = "2026-09-05"; node("net-control-callsign").value = "W8FY";
    return {window, storage, node, calls, api, ...window.test};
  }
  const pointer = "w8fy.netCheckin.lastNetId", token = "w8fy.netCheckin.ownerToken.saved";
  for (const body of [false, true]) await test("startup timeout exits Checking: " + (body ? "body" : "fetch"), async () => {
    const transport = apiHarness(() => body ? Promise.resolve({text: () => new Promise(() => {})}) : new Promise(() => {}));
    const h = appHarness({health: () => transport.api.health()});
    const startup = h.connectAndRestore(); await Promise.resolve(); transport.fire(); await startup;
    assert(h.node("database-status").lastElementChild.textContent === "Google Database: Offline", "checking ended");
    assert(!h.node("retry-connection-button").hidden && !h.canEditNet(), "retry available and editing locked");
    assert(h.storage.get(pointer) === "saved" && h.storage.get(token) === "secret", "credentials retained");
  });
  await test("missing saved net recovers active net read-only", async () => {
    const h = appHarness({getNet: async () => {throw missing();}}); await h.connectAndRestore();
    assert(h.storage.get(pointer) === "active" && h.storage.get(token) === "secret", "saved state");
    assert(h.window.W8FYNetCheckin.isDatabaseReady() && !h.canEditNet(), "read-only");
    assert(h.calls.join() === "health,getNet,getActiveNet", "discovery reads only");
  });
  await test("null saved net fallback", async () => {
    const h = appHarness({getNet: async () => null}); await h.connectAndRestore();
    assert(h.storage.get(pointer) === "active", "fallback");
  });
  await test("transient saved lookup retains credentials; Retry Connection restores owner", async () => {
    const h = appHarness({getNet: async () => {throw network();}}); await h.connectAndRestore();
    assert(h.storage.get(pointer) === "saved" && h.storage.get(token) === "secret", "credentials retained");
    assert(!h.node("retry-connection-button").hidden && !h.canEditNet() && !h.calls.includes("getActiveNet"), "locked with retry");
    h.api.getNet = async () => payload("saved"); h.node("retry-connection-button").listeners.click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert(h.window.W8FYNetCheckin.isDatabaseReady() && h.canEditNet(), "retry restores owner");
  });
  await test("health failure and recovery", async () => {
    const h = appHarness({health: async () => {throw network();}}); await h.connectAndRestore();
    assert(h.calls.join() === "health" && h.storage.get(pointer) === "saved", "no restoration after failure");
    assert(h.node("database-message").textContent.includes("Network unavailable"), "specific error");
    h.api.health = async () => ({status: "ok"}); await h.connectAndRestore();
    assert(h.canEditNet() && h.node("retry-connection-button").hidden, "recovered");
  });
  await test("failed active fallback retains saved pointer", async () => {
    const h = appHarness({getNet: async () => {throw missing();}, getActiveNet: async () => {throw network();}});
    await h.connectAndRestore(); assert(h.storage.get(pointer) === "saved", "retained");
  });
  await test("ownership network or malformed response retains token", async () => {
    for (const validate of [async () => {throw network();}, async () => ({})]) {
      const h = appHarness({validateNetControlOwnership: validate}); await h.connectAndRestore();
      assert(h.storage.get(token) === "secret" && h.storage.get(pointer) === "saved", "credentials");
      assert(!h.canEditNet() && !h.node("retry-connection-button").hidden, "locked with retry");
    }
  });
  await test("explicit invalid ownership remains read-only", async () => {
    const h = appHarness({validateNetControlOwnership: async () => ({valid: false})}); await h.connectAndRestore();
    assert(!h.canEditNet() && !h.storage.has(token) && h.window.W8FYNetCheckin.isDatabaseReady(), "read-only");
  });
  await test("confirmed absent nets allow Start Net", async () => {
    const h = appHarness({getNet: async () => {throw missing();}, getActiveNet: async () => null}); await h.connectAndRestore();
    assert(!h.storage.has(pointer) && h.storage.get(token) === "secret", "only stale pointer cleared");
    assert(h.window.W8FYNetCheckin.isDatabaseReady() && !h.window.W8FYNetCheckin.getState().active, "start allowed");
  });
  await test("existing-active-net offer and load without replacement write", async () => {
    let discover = 0;
    const h = appHarness({getActiveNet: async () => ++discover === 1 ? null : payload("active"),
      createNet: async () => {throw Object.assign(Error("An active net already exists. Finalize it before starting another net."), {type: "api"});}}, "");
    await h.connectAndRestore(); await h.startNet({preventDefault(){}});
    assert(!h.node("load-active-net-button").hidden && discover === 1, "offer before load");
    h.node("load-active-net-button").listeners.click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert(h.window.W8FYNetCheckin.getState().id === "active" && !h.canEditNet(), "read-only load");
    assert(h.calls.filter(c => c === "createNet").length === 1, "no repeated write");
  });
  await test("concurrent connection attempts are guarded", async () => {
    let release; const h = appHarness({health: () => new Promise(r => {release = r;})});
    const first = h.connectAndRestore(); await h.connectAndRestore();
    assert(h.calls.length === 1, "single request"); release({status: "ok"}); await first;
  });
  return results;
}
if (typeof module !== "undefined" && require.main === module) {
  const fs = require("node:fs"), path = require("node:path");
  runTests(fs.readFileSync(path.join(__dirname, "../js/google-apps-script.js"), "utf8"),
    fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8"))
    .then(results => {results.forEach(n => console.log("PASS " + n)); console.log(results.length + " tests passed");})
    .catch(e => {console.error(e); process.exitCode = 1;});
}
