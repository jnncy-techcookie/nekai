/* NEKAI boot: runs in <head>, before the first paint.
 * Applies this device's layout and display settings to <html> straight away, so a page
 * never flashes the wrong sidebar width or theme while the account data loads.
 * The full app (store, ui, page scripts) applies the saved settings again later.
 */
(function () {
  var h = document.documentElement, s = null;
  try { s = JSON.parse(localStorage.getItem("nekai:display")); } catch (e) { /* storage unavailable */ }
  // Data saved by versions before accounts: it isn't used any more
  try { localStorage.removeItem("nekai:v1"); localStorage.removeItem("nekai:v1:backup"); } catch (e) { /* storage unavailable */ }
  showBuild();
  if (!s) return;
  if (s.navOpen === false) h.classList.add("nav-collapsed");
  if (s.motion) h.classList.add("opt-reduce-motion");
  if (s.dark) h.classList.add("theme-dark");

  // A small "Build 15" tag in the corner of every page, so you can see which version is deployed.
  // /build.json is written when the frontend image is built (the pipeline passes the build number);
  // when it isn't there (running without Docker) nothing is shown.
  function showBuild() {
    fetch("/build.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (b) {
        if (!b || !b.build) return;
        var tag = document.createElement("div");
        tag.id = "build-label";
        tag.textContent = "Build " + b.build;
        tag.style.cssText = "position:fixed;left:8px;bottom:6px;z-index:2147483000;font:11px/1 system-ui,sans-serif;" +
          "padding:3px 6px;border-radius:6px;background:rgba(0,0,0,.55);color:#fff;pointer-events:none;opacity:.8";
        (document.body || document.documentElement).appendChild(tag);
      })
      .catch(function () { /* no build info: no label */ });
  }
})();
