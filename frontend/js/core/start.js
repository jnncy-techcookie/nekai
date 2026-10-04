/* NEKAI start: checks the Supabase session, loads the user's data, then runs the page.
 * Every page needs an account: without one it goes to the sign-in page, and a
 * signed-in visitor to the sign-in page goes Home. The page's own scripts are listed
 * in this tag's data-app attribute and run in order once the data is ready, so they
 * can keep reading NEKAI.store synchronously.
 */
(function () {
  "use strict";
  var me = document.currentScript;
  var scripts = (me.getAttribute("data-app") || "").split(/\s+/).filter(Boolean);
  var page = location.pathname.split("/").pop() || "index.html";
  var authPage = page === "signin.html";
  var resetting = new URLSearchParams(location.search).get("mode") === "reset";

  function run(list) {
    return list.reduce(function (p, src) {
      return p.then(function () {
        return new Promise(function (resolve, reject) {
          var s = document.createElement("script");
          s.src = src;
          s.async = false;
          s.onload = resolve;
          s.onerror = function () { reject(new Error("Couldn’t load " + src)); };
          document.body.appendChild(s);
        });
      });
    }, Promise.resolve());
  }

  function fail(err) {
    console.error(err);
    var box = document.createElement("div");
    box.setAttribute("role", "alert");
    box.style.cssText = "position:fixed;inset:auto 16px 16px 16px;z-index:9999;padding:14px 16px;border-radius:12px;" +
      "background:#0F1F5C;color:#FFFBF2;font:15px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)";
    box.textContent = "NEKAI couldn’t load your data. Check your connection and reload the page.";
    document.body.appendChild(box);
  }

  NEKAI.db.session().then(function (user) {
    if (!user && !authPage) { location.replace("signin.html"); return; }
    if (user && authPage && !resetting) { location.replace("index.html"); return; }
    return (user && !authPage ? NEKAI.db.load() : Promise.resolve(null)).then(function (state) {
      NEKAI.startState = state;
      return run(scripts);
    });
  }).catch(fail);
})();
