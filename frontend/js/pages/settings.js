/* Settings: profile form with validation, experience + accessibility switches, data export, sign out, delete */
(function () {
  "use strict";
  var S = NEKAI.store, U = NEKAI.ui, D = NEKAI.data, icon = U.icon;
  if (!S.state.signedIn) { location.replace("signin.html"); return; }

  U.shell({ page: "settings.html", lolli: "Turn me off here any time. I won’t take it personally… much." });

  var SWITCHES = {
    experience: [["sound", "Sound effects", "Subtle sounds when you log an episode or finish a show."], ["confetti", "Completion confetti", "Celebrate the first time you mark an anime completed."],
      ["lolli", "Lolli supporter", "A floating chat button in the corner, with reminders, recommendations and encouragement."], ["streak", "Streak reminders", "A nudge from Lolli when your watch streak is about to end."]],
    access: [["dark", "Dark mode", "Deep navy background with light text. Also in the sidebar."], ["motion", "Reduce motion", "Turns off confetti, tilts, fades and other animation."]]
  };
  var EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  function switchRow(s) {
    var on = !!S.state.settings[s[0]];
    return '<div class="divider switch-row"><div class="grow"><p id="' + s[0] + '-l" class="h3">' + s[1] + '</p><p id="' + s[0] + '-d" class="small muted">' + s[2] + "</p></div>" +
      '<span class="switch-state" aria-hidden="true">' + (on ? "On" : "Off") + "</span>" +
      '<button type="button" role="switch" class="switch" data-sw="' + s[0] + '" aria-checked="' + on + '" aria-labelledby="' + s[0] + '-l" aria-describedby="' + s[0] + '-d"><span class="knob"></span></button></div>';
  }
  function renderSwitches() {
    U.render(U.$("#sw-exp"), SWITCHES.experience.map(switchRow).join(""));
    U.render(U.$("#sw-acc"), SWITCHES.access.map(switchRow).join(""));
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-sw]"); if (!b) return;
    var k = b.dataset.sw, patch = {}; patch[k] = !S.state.settings[k];
    S.setSettings(patch); U.applySettings(); renderSwitches();
    if (k === "lolli") U.toast(patch[k] ? "Lolli is back. Reload any page to see the chat button." : "Lolli is off. Reload any page to hide the chat button.");
  });

  /* ---------- back: to wherever Settings was opened from (not shown when opened from the sidebar) ---------- */
  (function () {
    var fromNav = false;
    try { fromNav = sessionStorage.getItem("nekai:settingsFromNav") === "1"; sessionStorage.removeItem("nekai:settingsFromNav"); } catch (err) { /* storage unavailable */ }
    var ref = null;
    try { ref = document.referrer ? new URL(document.referrer) : null; } catch (err) { ref = null; }
    if (fromNav || !ref || ref.origin !== location.origin || /settings\.html$/.test(ref.pathname)) return;
    var PAGES = { "index.html": "Home", "": "Home", "library.html": "Library", "discover.html": "Discover", "profile.html": "Profile" };
    var file = ref.pathname.split("/").pop();
    var name = PAGES[file];
    if (!name) return;
    var back = U.$("#set-back");
    back.href = (file || "index.html") + ref.search + ref.hash;
    back.innerHTML = icon("back", 18, 2.4) + "<span>Back to " + name + "</span>";
    back.hidden = false;
    back.addEventListener("click", function (e) {
      // going back in history keeps that page's scroll position
      if (history.length > 1) { e.preventDefault(); history.back(); }
    });
  })();

  /* ---------- profile form ---------- */
  var p = S.state.profile;
  var nm = U.$("#dn"), em = U.$("#em"), bio = U.$("#bio");
  nm.value = p.name; em.value = p.email; bio.value = p.bio || "";
  function count() { U.$("#bio-help").textContent = bio.value.length + " of 160 characters"; }
  function showErr(input, errEl, bad) { input.setAttribute("aria-invalid", bad); errEl.hidden = !bad; }
  bio.addEventListener("input", count); count();
  // Save changes is only clickable once a field differs from what's saved
  var saveBtn = U.$("#save"), saving = false;
  function dirty() {
    var cur = S.state.profile;
    return nm.value.trim() !== cur.name || em.value.trim() !== cur.email || bio.value.slice(0, 160) !== (cur.bio || "");
  }
  function syncSave() { if (!saving) saveBtn.disabled = !dirty(); }
  [nm, em, bio].forEach(function (f) { f.addEventListener("input", syncSave); });
  syncSave();
  // Errors clear as soon as the field becomes valid
  nm.addEventListener("input", function () { if (nm.getAttribute("aria-invalid") === "true") showErr(nm, U.$("#dn-err"), !nm.value.trim()); });
  em.addEventListener("input", function () { if (em.getAttribute("aria-invalid") === "true") showErr(em, U.$("#em-err"), !EMAIL.test(em.value.trim())); });

  U.$("#profile-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var nameBad = !nm.value.trim(), emailBad = !EMAIL.test(em.value.trim());
    showErr(nm, U.$("#dn-err"), nameBad); showErr(em, U.$("#em-err"), emailBad);
    if (nameBad) { nm.focus(); return; }
    if (emailBad) { em.focus(); return; }
    if (!dirty()) return;
    var btn = saveBtn; saving = true; btn.disabled = true; btn.setAttribute("aria-busy", "true");
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>Saving…';
    // The email belongs to the Supabase account: changing it sends a confirmation link to the new address
    var newEmail = em.value.trim(), emailChanged = newEmail !== S.state.profile.email;
    var account = emailChanged ? NEKAI.db.client.auth.updateUser({ email: newEmail }) : Promise.resolve({});
    account.then(function (r) {
      if (r.error) throw r.error;
      S.setProfile({ name: nm.value.trim(), bio: bio.value.slice(0, 160) });
      return NEKAI.db.flush();
    }).then(function () {
      U.toast(emailChanged ? "Saved. Confirm your new email from the link we sent to " + newEmail + "." : "Settings saved");
      var who = U.$(".side-me .side-label span"); if (who) who.textContent = nm.value.trim();
    }).catch(function (err) {
      U.toast((err && err.message) || "Your changes couldn’t be saved. Please try again.");
    }).then(function () {
      if (emailChanged) em.value = S.state.profile.email; // the old email stays until the new one is confirmed
      saving = false; btn.removeAttribute("aria-busy"); btn.textContent = "Save changes"; syncSave();
    });
  });
  U.$("#pw-change").addEventListener("click", function () {
    var email = S.state.profile.email;
    NEKAI.db.client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/signin.html?mode=reset" }).then(function (r) {
      U.toast(r.error ? r.error.message : "We’ve emailed a password reset link to " + email);
    });
  });

  /* ---------- data ---------- */
  U.$("#export").addEventListener("click", function () {
    var rows = [["mal_id", "title", "status", "episodes_watched", "total_episodes", "your_rating", "community_score"]];
    S.ids().map(S.entry).forEach(function (e) {
      rows.push([e.id, e.title, D.statuses[e.status].label, e.watched, e.episodes || "", e.rating || "", e.score || ""]);
    });
    var csv = rows.map(function (r) { return r.map(function (v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\n");
    var url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    var a = document.createElement("a"); a.href = url; a.download = "nekai-list.csv"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    U.toast("Your list is downloading as nekai-list.csv");
  });
  // Sign out and Delete account both ask first, in the shared confirmation pop-up
  U.$("#signout").addEventListener("click", function () { U.logOut(); });
  U.$("#ask-delete").addEventListener("click", function () {
    U.confirm({
      title: "Delete your account?",
      body: "This permanently removes your account with its watchlist, ratings, streaks, achievements and Lolli chats. It can’t be undone.",
      confirm: "Delete permanently",
      cancel: "Keep my account",
      danger: true,
      icon: "trash",
    }).then(function (ok) {
      if (!ok) return;
      NEKAI.db.flush().then(NEKAI.db.token).then(function (token) {
        return fetch("/api/account", { method: "DELETE", headers: { Authorization: "Bearer " + token } });
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (!res.ok) throw new Error(body.error || "Your account couldn’t be deleted just now. Please try again.");
        });
      }).then(function () {
        // the account is gone; clear this browser's session too
        return NEKAI.db.client.auth.signOut({ scope: "local" }).catch(function () {});
      }).then(function () {
        location.href = "signin.html?deleted=1";
      }).catch(function (err) {
        U.toast(err && err.name !== "TypeError" ? err.message : "Can’t reach the NEKAI server. Please try again.");
      });
    });
  });

  renderSwitches();
  // the sidebar Dark mode toggle changes a setting too: keep these switches in step
  var swState = JSON.stringify(S.state.settings);
  S.subscribe(function () { var now = JSON.stringify(S.state.settings); if (now !== swState) { swState = now; renderSwitches(); } });
})();
