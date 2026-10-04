/* NEKAI start: checks the Supabase session, loads the user's data, then runs the page.
 * Every page needs an account: without one it goes to the sign-in page, and a
 * signed-in visitor to the sign-in page goes Home. The page's own scripts are listed
 * in this tag's data-app attribute and run in order once the data is ready, so they
 * can keep reading NEKAI.store synchronously.
 *
 * Moving between pages is quick:
 * - The sidebar and phone top bar appear at once, from the snapshot ui.js keeps of them,
 *   so only the section itself waits (it shows a spinner if the wait is noticeable).
 * - The data comes from this tab's copy (core/supabase.js) when there is one, so the page
 *   draws straight away; Supabase is asked for anything newer in the background.
 */
(function () {
  "use strict";
  var me = document.currentScript;
  var scripts = (me.getAttribute("data-app") || "").split(/\s+/).filter(Boolean);
  var page = location.pathname.split("/").pop() || "index.html";
  var authPage = page === "signin.html";
  var resetting = new URLSearchParams(location.search).get("mode") === "reset";
  var root = document.documentElement;

  // Requests every script at once; they still run in order (async = false)
  function run(list) {
    return Promise.all(list.map(function (src) {
      return new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = src;
        s.async = false;
        s.onload = resolve;
        s.onerror = function () { reject(new Error("Couldn’t load " + src)); };
        document.body.appendChild(s);
      });
    }));
  }

  function fail(err) {
    console.error(err);
    root.classList.remove("app-loading");
    var box = document.createElement("div");
    box.setAttribute("role", "alert");
    box.style.cssText = "position:fixed;inset:auto 16px 16px 16px;z-index:9999;padding:14px 16px;border-radius:12px;" +
      "background:#0F1F5C;color:#FFFBF2;font:15px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)";
    box.textContent = "NEKAI couldn’t load your data. Check your connection and reload the page.";
    document.body.appendChild(box);
  }

  // The sidebar and top bar from the last page (ui.js saves them), shown until the real ones are built.
  // Links work straight away; the current page is marked as current.
  function showShellSnapshot() {
    var app = document.querySelector(".app"), main = app && app.querySelector(".main");
    if (!main) return;
    var snap = null;
    try { snap = JSON.parse(localStorage.getItem("nekai:shell")); } catch (e) { /* none */ }
    if (!snap || !snap.side) return;
    var box = document.createElement("div");
    box.innerHTML = snap.side + (snap.top || "");
    var side = box.querySelector(".side"), top = box.querySelector(".mtop");
    [side, top].forEach(function (el) {
      if (!el) return;
      el.setAttribute("data-shell-snapshot", "");
      el.removeAttribute("inert");
      Array.prototype.forEach.call(el.querySelectorAll("[aria-current]"), function (a) { a.removeAttribute("aria-current"); });
      Array.prototype.forEach.call(el.querySelectorAll('a[href="' + page + '"]'), function (a) {
        if (a.closest(".side-nav, .side-foot")) a.setAttribute("aria-current", "page");
      });
    });
    if (side) app.insertBefore(side, app.firstChild);
    if (top) app.insertBefore(top, main);
  }

  // Asks Supabase for anything newer than this tab's copy (changes from another device or tab)
  // and redraws if there is. Skipped if you've already changed something here: those changes
  // were saved, and the next page loads fresh.
  function refreshInBackground(fromCache) {
    var startVersion = NEKAI.store.version;
    NEKAI.db.refresh().then(function (fresh) {
      if (NEKAI.store.version !== startVersion) return;
      var same = JSON.stringify(Object.assign({}, fresh, { anime: null })) === JSON.stringify(Object.assign({}, fromCache.saved, { anime: null }));
      NEKAI.db.adopt(fresh);
      if (!same) NEKAI.store.replace(fresh);
    }).catch(function (err) {
      console.warn("Background refresh failed; showing this tab's copy:", err);
    });
  }

  // A page loaded ahead of time (ui.js asks the browser to, when you point at a link) can be opened a
  // while later: catch up with anything that changed meanwhile, in this tab's data or the theme
  var startedAt = 0; // when this page took its data
  function catchUp() {
    try {
      var d = JSON.parse(localStorage.getItem("nekai:display")) || {};
      root.classList.toggle("theme-dark", !!d.dark);
      root.classList.toggle("opt-reduce-motion", !!d.motion);
    } catch (e) { /* storage unavailable */ }
    if (!NEKAI.store || !startedAt) return; // still starting up: it reads the latest data itself
    var copy = NEKAI.db.cached();
    if (copy && copy.at > startedAt) {
      startedAt = copy.at;
      NEKAI.db.useCache(copy);
      NEKAI.store.replace(copy.state);
    }
    if (NEKAI.ui && NEKAI.ui.applySettings) NEKAI.ui.applySettings();
  }
  if (document.prerendering) document.addEventListener("prerenderingchange", catchUp, { once: true });

  if (!authPage) {
    root.classList.add("app-loading"); // the section shows a spinner if loading takes a moment (shell.css)
    showShellSnapshot();
  }

  NEKAI.db.session().then(function (user) {
    if (!user && !authPage) { location.replace("signin.html"); return; }
    if (user && authPage && !resetting) { location.replace("index.html"); return; }
    if (!user || authPage) {
      NEKAI.startState = null;
      return run(scripts);
    }
    var copy = NEKAI.db.cached();
    if (copy) {
      NEKAI.startState = NEKAI.db.useCache(copy);
      startedAt = copy.at;
      return run(scripts).then(function () {
        root.classList.remove("app-loading");
        refreshInBackground(copy);
      });
    }
    return NEKAI.db.load().then(function (state) {
      NEKAI.startState = state;
      startedAt = Date.now();
      return run(scripts);
    }).then(function () {
      root.classList.remove("app-loading");
    });
  }).catch(fail);
})();
