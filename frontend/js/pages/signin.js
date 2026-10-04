/* Sign in / create account.
 * There is no backend: this validates the form and stores the profile
 * locally so the rest of the app is personalised. Swap submit() for a
 * real auth call when you add a server.
 */
(function () {
  "use strict";
  var S = NEKAI.store, U = NEKAI.ui;
  U.applySettings();
  var mode = new URLSearchParams(location.search).get("mode") === "register" ? "register" : "signin";
  var EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var nm = U.$("#nm"), em = U.$("#em"), pw = U.$("#pw"), tried = false;

  if (new URLSearchParams(location.search).get("deleted")) U.$("#deleted").hidden = false;

  // Which fields are valid in this mode: sign in needs no name, sign up needs an 8+ character password
  function valid() {
    return {
      name: mode === "signin" || !!nm.value.trim(),
      email: EMAIL.test(em.value.trim()),
      pw: mode === "register" ? pw.value.length >= 8 : pw.value.length > 0
    };
  }
  // Updates the form for the mode (sign in / sign up), and shows errors once a submit was tried
  function paint() {
    var reg = mode === "register", v = valid();
    U.$("#auth-h").textContent = reg ? "Create your account" : "Welcome back";
    U.$("#auth-sub").textContent = reg ? "Start tracking in under a minute." : "Sign in to pick up where you left off.";
    U.$("#tab-in").setAttribute("aria-selected", !reg); U.$("#tab-up").setAttribute("aria-selected", reg);
    U.$("#tab-in").tabIndex = reg ? -1 : 0; U.$("#tab-up").tabIndex = reg ? 0 : -1;
    U.$(".auth-tabs").dataset.mode = mode; // slides the segmented control's thumb
    U.$("#name-field").hidden = !reg;
    U.$("#forgot").hidden = reg;
    U.$("#switch-hint").hidden = reg;
    U.$("#pw-help").hidden = !reg;
    pw.autocomplete = reg ? "new-password" : "current-password";
    U.$("#submit-label").textContent = reg ? "Create account" : "Sign in";
    [[nm, "#nm-err", v.name], [em, "#em-err", v.email], [pw, "#pw-err", v.pw]].forEach(function (f) {
      var bad = tried && !f[2];
      f[0].setAttribute("aria-invalid", bad); U.$(f[1]).hidden = !bad;
    });
    U.$("#pw-err span").textContent = reg ? "Use at least 8 characters." : "Enter your password.";
  }
  // Switches mode; the card fits its content, so its height glides from the old size to the new one
  // instead of snapping (skipped when reduce motion is on)
  var card = U.$(".auth-card");
  function setMode(m) {
    if (m === mode) return;
    var from = card.offsetHeight;
    mode = m; tried = false; paint();
    var still = document.documentElement.classList.contains("opt-reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still || getComputedStyle(card).maxHeight === "none") return; // phones: the page scrolls, no need
    var to = card.offsetHeight;
    card.style.height = from + "px"; card.style.overflow = "hidden";
    card.offsetHeight; // apply the start height before animating
    card.style.transition = "height .28s cubic-bezier(.2,.8,.2,1)";
    card.style.height = to + "px";
    card.addEventListener("transitionend", function done(e) {
      if (e.target !== card) return;
      card.removeEventListener("transitionend", done);
      card.style.height = card.style.overflow = card.style.transition = "";
    });
  }

  U.$("#tab-in").addEventListener("click", function () { setMode("signin"); });
  U.$("#tab-up").addEventListener("click", function () { setMode("register"); });
  U.$("#to-register").addEventListener("click", function () { setMode("register"); nm.focus(); });
  U.$(".auth-tabs").addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") { setMode(mode === "signin" ? "register" : "signin"); U.$(mode === "signin" ? "#tab-in" : "#tab-up").focus(); }
  });
  [nm, em, pw].forEach(function (i) { i.addEventListener("input", function () { if (tried) paint(); }); });
  U.$("#show-pw").addEventListener("click", function () {
    var show = pw.type === "password"; pw.type = show ? "text" : "password";
    this.setAttribute("aria-pressed", show); this.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });
  U.$("#forgot").addEventListener("click", function (e) {
    e.preventDefault();
    if (!EMAIL.test(em.value.trim())) { tried = true; paint(); em.focus(); return; }
    U.$("#status").hidden = false; U.$("#status-text").textContent = "Password reset link sent to " + em.value.trim() + ".";
  });
  U.$("#google").addEventListener("click", function () {
    U.$("#status").hidden = false; U.$("#status-text").textContent = "Google sign-in needs a server. See the README to wire it up.";
  });

  U.$("#auth-form").addEventListener("submit", function (e) {
    e.preventDefault();
    tried = true; paint();
    var v = valid();
    if (!v.name) { nm.focus(); return; } if (!v.email) { em.focus(); return; } if (!v.pw) { pw.focus(); return; }
    var btn = U.$("#submit"); btn.disabled = true; btn.setAttribute("aria-busy", "true");
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>' + (mode === "register" ? "Creating account…" : "Signing in…");
    setTimeout(function () {
      var patch = { email: em.value.trim() };
      if (mode === "register") { patch.name = nm.value.trim(); patch.handle = nm.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ""); patch.since = new Date().getFullYear(); }
      if (mode === "register") { S.startFresh(patch); location.href = "welcome.html"; return; }
      S.setProfile(patch); S.setSignedIn(true);
      location.href = S.state.onboarding ? "welcome.html" : "index.html";
    }, 600);
  });

  paint();
})();
