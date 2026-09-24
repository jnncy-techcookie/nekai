/* NEKAI boot: runs in <head>, before the first paint.
 * Applies saved layout and display settings to <html> straight away, so a page
 * never flashes the wrong sidebar width or text size while the rest loads.
 * The full app (store, ui, page scripts) still applies them again later.
 */
(function () {
  var h = document.documentElement, s = null;
  try { s = JSON.parse(localStorage.getItem("nekai:v1")); } catch (e) { /* storage unavailable */ }
  if (!s) return;
  var ui = s.ui || {}, st = s.settings || {};
  if (ui.navOpen === false) h.classList.add("nav-collapsed");
  if (st.text) h.classList.add("opt-large-text");
  if (st.contrast) h.classList.add("opt-strong");
  if (st.motion) h.classList.add("opt-reduce-motion");
})();
