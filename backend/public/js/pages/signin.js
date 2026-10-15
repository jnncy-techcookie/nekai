/* Sign in / create account (email and password, checked by the NEKAI server).
 * A new account gets its profile and settings rows when it's created, then continues
 * to the genre picker. ?mode=reset&token=… is where the password reset email lands:
 * the token lets the user choose a new password, which also signs them in.
 */
(function () {
  "use strict";
  var U = NEKAI.ui, auth = NEKAI.db.auth;
  U.applySettings();
  var q = new URLSearchParams(location.search);
  var resetToken = q.get("mode") === "reset" ? q.get("token") || "" : "";
  var mode = q.get("mode") === "register" ? "register" : resetToken ? "reset" : "signin";
  var EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var nm = U.$("#nm"), em = U.$("#em"), pw = U.$("#pw"), tried = false;

  if (q.get("deleted")) U.$("#deleted").hidden = false;

  // Which fields are valid in this mode: only sign up needs a name, reset needs no email,
  // and sign up and reset need a new password of 8+ characters
  function valid() {
    return {
      name: mode !== "register" || !!nm.value.trim(),
      email: mode === "reset" || EMAIL.test(em.value.trim()),
      pw: mode === "signin" ? pw.value.length > 0 : pw.value.length >= 8
    };
  }
  // Updates the form for the mode (sign in / sign up / reset password), and shows errors once a submit was tried
  function paint() {
    var reg = mode === "register", reset = mode === "reset", v = valid();
    U.$("#auth-h").textContent = reset ? "Choose a new password" : reg ? "Create your account" : "Welcome back";
    U.$("#auth-sub").textContent = reset ? "You’ll use it the next time you sign in." : reg ? "Start tracking in under a minute." : "Sign in to pick up where you left off.";
    U.$("#tab-in").setAttribute("aria-selected", !reg); U.$("#tab-up").setAttribute("aria-selected", reg);
    U.$("#tab-in").tabIndex = reg ? -1 : 0; U.$("#tab-up").tabIndex = reg ? 0 : -1;
    U.$(".auth-tabs").dataset.mode = mode; // slides the segmented control's thumb
    U.$(".auth-tabs").hidden = reset;
    U.$("#name-field").hidden = !reg;
    em.closest("div").hidden = reset;
    U.$("#forgot").hidden = reg || reset;
    U.$("#switch-hint").hidden = reg || reset;
    U.$(".auth-or").hidden = reset; U.$("#google").hidden = reset;
    U.$("#pw-help").hidden = mode === "signin";
    pw.autocomplete = mode === "signin" ? "current-password" : "new-password";
    U.$("#submit-label").textContent = reset ? "Save new password" : reg ? "Create account" : "Sign in";
    [[nm, "#nm-err", v.name], [em, "#em-err", v.email], [pw, "#pw-err", v.pw]].forEach(function (f) {
      var bad = tried && !f[2];
      f[0].setAttribute("aria-invalid", bad); U.$(f[1]).hidden = !bad;
    });
    U.$("#pw-err span").textContent = mode === "signin" ? "Enter your password." : "Use at least 8 characters.";
  }
  function say(text) {
    U.$("#status").hidden = !text; U.$("#status-text").textContent = text;
  }
  // The server's answers are already in NEKAI's words; a request that never arrived is not
  function friendly(err) {
    if (err && err.status) return err.message;
    return "Can’t reach NEKAI’s account service. Check your connection and try again.";
  }
  // Switches mode; the card fits its content, so its height glides from the old size to the new one
  // instead of snapping (skipped when reduce motion is on)
  var card = U.$(".auth-card");
  function setMode(m) {
    say("");
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
    var email = em.value.trim();
    if (!EMAIL.test(email)) { tried = true; paint(); em.focus(); return; }
    auth.forgot(email).then(function () {
      say("If there’s an account for " + email + ", a password reset link is on its way.");
    }, function (err) { say(friendly(err)); });
  });
  U.$("#google").addEventListener("click", function () {
    say("Google sign-in isn’t available yet. Use your email and password.");
  });

  // The spinner replaces the button's contents, so keep them (label and arrow) to put back afterwards
  var submitBtn = U.$("#submit"), submitHtml = submitBtn.innerHTML;
  function busy(on, label) {
    submitBtn.disabled = on;
    if (on) { submitBtn.setAttribute("aria-busy", "true"); submitBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span>' + label; }
    else { submitBtn.removeAttribute("aria-busy"); submitBtn.innerHTML = submitHtml; paint(); }
  }

  U.$("#auth-form").addEventListener("submit", function (e) {
    e.preventDefault();
    tried = true; say(""); paint();
    var v = valid();
    if (!v.name) { nm.focus(); return; } if (!v.email) { em.focus(); return; } if (!v.pw) { pw.focus(); return; }
    var email = em.value.trim(), name = nm.value.trim();

    if (mode === "reset") {
      busy(true, "Saving…");
      auth.reset(resetToken, pw.value).then(function () {
        location.href = "index.html";
      }).catch(function (err) { busy(false); say(friendly(err)); });
      return;
    }

    if (mode === "register") {
      busy(true, "Creating account…");
      auth.register(name, email, pw.value).then(function () {
        location.href = "welcome.html";
      }).catch(function (err) { busy(false); say(friendly(err)); });
      return;
    }

    busy(true, "Signing in…");
    auth.login(email, pw.value).then(function () {
      location.href = "index.html"; // Home sends a new account to the genre picker first
    }).catch(function (err) { busy(false); say(friendly(err)); });
  });

  paint();
})();
