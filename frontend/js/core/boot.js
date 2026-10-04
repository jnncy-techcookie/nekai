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
  if (!s) return;
  if (s.navOpen === false) h.classList.add("nav-collapsed");
  if (s.motion) h.classList.add("opt-reduce-motion");
  if (s.dark) h.classList.add("theme-dark");
})();
