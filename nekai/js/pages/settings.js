/* Settings: profile form with validation, experience + accessibility switches, data export, sign out, delete */
(function () {
  "use strict";
  var S = NEKAI.store, U = NEKAI.ui, D = NEKAI.data, icon = U.icon;
  if (!S.state.signedIn) { location.replace("signin.html"); return; }

  U.shell({ page: "settings.html", lolli: "Turn me off here any time. I won’t take it personally… much." });

  var SWITCHES = {
    experience: [["sound", "Sound effects", "Subtle sounds when you log an episode or finish a show."], ["confetti", "Completion confetti", "Celebrate the first time you mark an anime completed."],
      ["lolli", "Lolli supporter", "Reminders, recommendations and encouragement in the sidebar."], ["streak", "Streak reminders", "A nudge from Lolli when your watch streak is about to end."]],
    access: [["motion", "Reduce motion", "Turns off confetti, tilts, fades and other animation."], ["text", "Larger text", "Increases body text from 18 to 20 pixels."],
      ["contrast", "Stronger outlines", "Draws 2px outlines on every card and control."]]
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
    if (k === "lolli") U.toast(patch[k] ? "Lolli is back in the sidebar" : "Lolli is off. Reload any page to hide the sidebar card.");
  });

  /* ---------- profile form ---------- */
  var p = S.state.profile;
  var nm = U.$("#dn"), em = U.$("#em"), bio = U.$("#bio");
  nm.value = p.name; em.value = p.email; bio.value = p.bio || "";
  function count() { U.$("#bio-help").textContent = bio.value.length + " of 160 characters"; }
  function showErr(input, errEl, bad) { input.setAttribute("aria-invalid", bad); errEl.hidden = !bad; }
  bio.addEventListener("input", count); count();
  // Errors clear as soon as the field becomes valid
  nm.addEventListener("input", function () { if (nm.getAttribute("aria-invalid") === "true") showErr(nm, U.$("#dn-err"), !nm.value.trim()); });
  em.addEventListener("input", function () { if (em.getAttribute("aria-invalid") === "true") showErr(em, U.$("#em-err"), !EMAIL.test(em.value.trim())); });

  U.$("#profile-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var nameBad = !nm.value.trim(), emailBad = !EMAIL.test(em.value.trim());
    showErr(nm, U.$("#dn-err"), nameBad); showErr(em, U.$("#em-err"), emailBad);
    if (nameBad) { nm.focus(); return; }
    if (emailBad) { em.focus(); return; }
    var btn = U.$("#save"); btn.disabled = true; btn.setAttribute("aria-busy", "true");
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>Saving…';
    setTimeout(function () {
      S.setProfile({ name: nm.value.trim(), email: em.value.trim(), bio: bio.value.slice(0, 160) });
      btn.disabled = false; btn.removeAttribute("aria-busy"); btn.textContent = "Save changes";
      U.toast("Settings saved");
      var who = U.$(".side-me .side-label span"); if (who) who.textContent = nm.value.trim();
    }, 500);
  });
  U.$("#pw-change").addEventListener("click", function () { U.toast("We’ve emailed a password reset link to " + S.state.profile.email); });

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
  U.$("#signout").addEventListener("click", function () { S.setSignedIn(false); location.href = "signin.html"; });
  var dlg = U.$("#confirm");
  U.$("#ask-delete").addEventListener("click", function () { dlg.hidden = false; U.$("#keep").focus(); });
  U.$("#keep").addEventListener("click", function () { dlg.hidden = true; U.$("#ask-delete").focus(); });
  dlg.addEventListener("keydown", function (e) { if (e.key === "Escape") { dlg.hidden = true; U.$("#ask-delete").focus(); } });
  U.$("#delete").addEventListener("click", function () { S.reset(); location.href = "signin.html?deleted=1"; });

  renderSwitches();
})();
