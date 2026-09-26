/* Profile: identity, level, stats dashboard, favorite genres, achievements */
(function () {
  "use strict";
  var S = NEKAI.store, U = NEKAI.ui, esc = U.esc, icon = U.icon;
  if (!S.state.signedIn) { location.replace("signin.html"); return; }

  var st = S.streak();
  U.shell({ page: "profile.html", lolli: !S.state.settings.streak ? "Every episode, rating and finished show earns XP toward your next level."
    : st.current >= 7 ? "Week Streak earned! Keep the run going." : "Only " + (7 - st.current) + " more day" + (7 - st.current === 1 ? "" : "s") + " of watching to earn your Week Streak sticker!" });

  var GCOL = ["#1F3FA6", "#F25C05", "#6F8FE8", "#FFA25C", "#FFD3B3", "#F7823A", "#B3B6C6"];
  var FACE = '<svg width="144" height="144" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="17" r="10.5" fill="#FFFBF2" stroke="#0F1F5C" stroke-width="1"></circle><path d="M4.6 14.5c1.6-8 17.4-10 20.8-1.4c-5-1-8-3.8-9-5c-2.2 3.2-6.4 5.4-11.8 6.4z" fill="#0F1F5C"></path><circle cx="11.6" cy="18" r="1.1" fill="#0F1F5C"></circle><circle cx="18.4" cy="18" r="1.1" fill="#0F1F5C"></circle><path d="M13 22q2 1.6 4 0" stroke="#0F1F5C" stroke-width="1.1" fill="none" stroke-linecap="round"></path><circle cx="9.6" cy="20.6" r="1.3" fill="#FFD3B3"></circle><circle cx="20.4" cy="20.6" r="1.3" fill="#FFD3B3"></circle></svg>';
  var TITLES = ["Newcomer", "Casual Viewer", "Regular", "Weekend Binger", "Enthusiast", "Seasoned Viewer", "Otaku in Training", "Veteran", "Sensei", "Legend"];

  function render() {
    var p = S.state.profile, c = S.counts(), t = S.totals(), lv = S.xp(), mix = S.genreMix(), ach = S.achievements();
    var earned = ach.filter(function (a) { return a.earned; }).length;
    var top = mix.filter(function (g) { return g.name !== "Other"; }).slice(0, 3);
    var tagCols = [["#1F3FA6", "#FFFBF2"], ["#FFA25C", "#0F1F5C"], ["#FFD3B3", "#0F1F5C"]];

    U.$("#me").innerHTML =
      '<div class="me-banner"><div class="me-house">' + FACE + '</div><span class="pill pill-yellow" style="position:absolute;left:16px;top:16px;transform:rotate(-6deg)">LV. ' + lv.level + "</span></div>" +
      '<div class="stack gap-16" style="padding:24px 32px 32px">' +
        '<div><h2 id="me-h" class="title">' + esc(p.name) + '</h2><p class="small muted semibold">@' + esc(p.handle) + " · Member since " + p.since + "</p></div>" +
        (p.bio ? '<p class="body">' + esc(p.bio) + "</p>" : "") +
        '<div class="row gap-8">' + top.map(function (g, i) { return '<span class="tag" style="background:' + tagCols[i][0] + ";color:" + tagCols[i][1] + '">' + esc(g.name) + "</span>"; }).join("") + "</div>" +
        '<div class="grid-2" style="gap:16px"><a class="btn btn-accent" href="settings.html" style="padding:0 16px">' + icon("edit", 20) + 'Edit profile</a>' +
        '<button type="button" id="share" class="btn btn-secondary" style="padding:0 16px">' + icon("share", 20) + "Share list</button></div>" +
      "</div>";

    U.$("#level").innerHTML = '<span class="eyebrow">PERSONAL LEVEL</span><h2 id="lv-h" class="title">Level ' + lv.level + " · " + TITLES[Math.min(lv.level, TITLES.length) - 1] + "</h2>" +
      '<div class="progress" role="progressbar" aria-label="Level progress" aria-valuemin="0" aria-valuemax="' + lv.need + '" aria-valuenow="' + lv.into + '" style="height:16px"><span style="width:' + Math.round(lv.into / lv.need * 100) + '%"></span></div>' +
      '<p class="small bold">' + lv.into + " / " + lv.need + " XP · " + (lv.need - lv.into) + " XP to Level " + (lv.level + 1) + "</p>" +
      '<p class="small muted">Earn 2 XP per episode, 50 per completed anime and 5 per rating.</p>';

    var stats = [
      ["Anime watched", c.watching + c.completed + c.dropped, "Started or completed", "yellow"], ["Completed", c.completed, "Finished anime", "teal"],
      ["Watching", c.watching, "Ongoing now", "pink"], ["Plan to Watch", c.plan, "In your queue", ""],
      ["Dropped", c.dropped, "Stopped watching", ""], ["Episodes watched", t.episodes.toLocaleString("en-US"), "All time", ""],
      ["Average rating", t.mean || "–", "Out of 10", ""], ["Longest streak", S.longestStreak(), "Days · current " + S.streak().current, ""]
    ];
    U.$("#stats").innerHTML = stats.map(function (s) {
      return '<div class="card-sm stat ' + s[3] + '"><dt>' + s[0] + '<span' + (s[3] ? "" : ' class="muted"') + ">" + s[2] + '</span></dt><dd class="title">' + s[1] + "</dd></div>";
    }).join("");

    U.$("#mix").innerHTML = '<div class="genre-bar" role="img" aria-label="' + esc(mix.map(function (g) { return g.name + " " + g.pct + "%"; }).join(", ")) + '">' +
      mix.map(function (g, i) { return '<span style="width:' + g.pct + "%;background:" + GCOL[i % GCOL.length] + '"></span>'; }).join("") + "</div>" +
      '<ul class="legend">' + mix.map(function (g, i) { return '<li><i aria-hidden="true" style="background:' + GCOL[i % GCOL.length] + '"></i>' + esc(g.name) + " <strong>" + g.pct + "%</strong></li>"; }).join("") + "</ul>";

    U.$("#ach-count").textContent = earned + " of " + ach.length + " earned";
    U.$("#ach").innerHTML = ach.map(function (a) {
      return '<li class="' + (a.earned ? "" : "locked") + '"><span class="ach-badge" aria-hidden="true" style="' + (a.earned ? "background:" + a.bg + ";color:" + (a.bg === "#1F3FA6" ? "#FFFBF2" : "#0F1F5C") : "") + '">' + esc(a.glyph) +
        (a.earned ? "" : '<span class="ach-lock">' + icon("lock", 12, 2.6) + "</span>") + "</span>" +
        '<span class="small bold">' + esc(a.name) + '</span><span class="caption muted" style="font-weight:500">' + esc(a.desc) + "</span>" +
        (a.earned ? '<span class="caption bold" style="color:#1F3FA6">✓ Earned</span>' : '<span class="caption bold" style="color:var(--blue-text)">' + esc(a.progress) + "</span>") + "</li>";
    }).join("");
  }

  U.$("#me").addEventListener("click", function (e) {
    if (!e.target.closest("#share")) return;
    var url = location.href.replace(/profile\.html.*$/, "library.html?tab=all");
    var done = function () { U.toast("Link to your list copied"); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(done, function () { U.toast("Couldn’t copy. Your list link: " + url); });
    else U.toast("Your list link: " + url);
  });

  S.subscribe(render);
  render();
})();
