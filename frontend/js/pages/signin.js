/* Sign in / create account with Supabase (email and password).
 * A new account gets its profile and settings rows from a database trigger; this page
 * then gives it a handle and sends it to the genre picker. ?mode=reset is where the
 * password reset email lands: the link signs the user in to choose a new password.
 */
(function () {
  "use strict";
  var U = NEKAI.ui, db = NEKAI.db, auth = NEKAI.db.client.auth;
  U.applySettings();
  var q = new URLSearchParams(location.search);
  var mode = q.get("mode") === "register" ? "register" : q.get("mode") === "reset" && db.user ? "reset" : "signin";
  var EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var nm = U.$("#nm"), em = U.$("#em"), pw = U.$("#pw"), tried = false;

  if (q.get("deleted")) U.$("#deleted").hidden = false;

  function valid() {
    return {
      name: mode !== "register" || !!nm.value.trim(),
      email: mode === "reset" || EMAIL.test(em.value.trim()),
      pw: mode === "signin" ? pw.value.length > 0 : pw.value.length >= 8
    };
  }
  function paint() {
    var reg = mode === "register", reset = mode === "reset", v = valid();
    U.$("#auth-h").textContent = reset ? "Choose a new password" : reg ? "Create your account" : "Welcome back";
    U.$("#auth-sub").textContent = reset ? "You’ll use it the next time you sign in." : reg ? "Start tracking in under a minute." : "Sign in to pick up where you left off.";
    U.$("#tab-in").setAttribute("aria-selected", !reg); U.$("#tab-up").setAttribute("aria-selected", reg);
    U.$("#tab-in").tabIndex = reg ? -1 : 0; U.$("#tab-up").tabIndex = reg ? 0 : -1;
    U.$(".auth-tabs").hidden = reset;
    U.$("#name-field").hidden = !reg;
    em.closest("div").hidden = reset;
    U.$("#forgot").hidden = reg || reset;
    U.$("#or-row").hidden = reset; U.$("#google").hidden = reset;
    U.$("#pw-help").hidden = mode === "signin";
    pw.autocomplete = mode === "signin" ? "current-password" : "new-password";
    U.$("#submit").textContent = reset ? "Save new password" : reg ? "Create account" : "Sign in";
    [[nm, "#nm-err", v.name], [em, "#em-err", v.email], [pw, "#pw-err", v.pw]].forEach(function (f) {
      var bad = tried && !f[2];
      f[0].setAttribute("aria-invalid", bad); U.$(f[1]).hidden = !bad;
    });
    U.$("#pw-err span").textContent = mode === "signin" ? "Enter your password." : "Use at least 8 characters.";
  }
  function setMode(m) { mode = m; tried = false; say(""); paint(); }
  function say(text) {
    U.$("#status").hidden = !text; U.$("#status-text").textContent = text;
  }
  // Supabase's messages, in NEKAI's words where we know them
  function friendly(err) {
    var m = String((err && err.message) || "");
    if (/invalid login credentials/i.test(m)) return "That email and password don’t match an account.";
    if (/already registered|already exists/i.test(m)) return "There’s already an account with that email. Sign in instead.";
    if (/rate limit|too many/i.test(m)) return "Too many tries. Wait a minute, then try again.";
    if (/failed to fetch|network/i.test(m)) return "Can’t reach NEKAI’s account service. Check your connection and try again.";
    return m || "Something went wrong. Please try again.";
  }

  U.$("#tab-in").addEventListener("click", function () { setMode("signin"); });
  U.$("#tab-up").addEventListener("click", function () { setMode("register"); });
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
    auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/signin.html?mode=reset" }).then(function (r) {
      say(r.error ? friendly(r.error) : "If there’s an account for " + email + ", a password reset link is on its way.");
    });
  });
  U.$("#google").addEventListener("click", function () {
    say("Google sign-in isn’t available yet. Use your email and password.");
  });

  function busy(on, label) {
    var btn = U.$("#submit");
    btn.disabled = on;
    if (on) { btn.setAttribute("aria-busy", "true"); btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>' + label; }
    else { btn.removeAttribute("aria-busy"); paint(); }
  }

  U.$("#auth-form").addEventListener("submit", function (e) {
    e.preventDefault();
    tried = true; say(""); paint();
    var v = valid();
    if (!v.name) { nm.focus(); return; } if (!v.email) { em.focus(); return; } if (!v.pw) { pw.focus(); return; }
    var email = em.value.trim(), name = nm.value.trim();

    if (mode === "reset") {
      busy(true, "Saving…");
      auth.updateUser({ password: pw.value }).then(function (r) {
        if (r.error) throw r.error;
        location.href = "index.html";
      }).catch(function (err) { busy(false); say(friendly(err)); });
      return;
    }

    if (mode === "register") {
      busy(true, "Creating account…");
      auth.signUp({ email: email, password: pw.value, options: { data: { display_name: name } } }).then(function (r) {
        if (r.error) throw r.error;
        // With email confirmation on, Supabase returns no session until the link is clicked
        if (!r.data.session) { busy(false); setMode("signin"); em.value = email; say("Check your inbox: we’ve sent a link to confirm " + email + "."); return; }
        return db.session().then(function () { return db.claimHandle(name); }).catch(function (err) {
          console.warn("Couldn’t set a handle:", err); // the account still works without one
        }).then(function () { location.href = "welcome.html"; });
      }).catch(function (err) { busy(false); say(friendly(err)); });
      return;
    }

    busy(true, "Signing in…");
    auth.signInWithPassword({ email: email, password: pw.value }).then(function (r) {
      if (r.error) throw r.error;
      location.href = "index.html"; // Home sends a new account to the genre picker first
    }).catch(function (err) { busy(false); say(friendly(err)); });
  });

  paint();
})();
