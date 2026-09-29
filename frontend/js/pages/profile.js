/* Profile: a banner header (avatar, name, headline numbers), your five top rated posters,
   achievements, and a sidebar with level, favorite genres and library counts */
(function () {
  "use strict";
  var S = NEKAI.store, U = NEKAI.ui, esc = U.esc, icon = U.icon;
  if (!S.state.signedIn) { location.replace("signin.html"); return; }

  var st = S.streak(), weekStreak = S.state.earned["Week Streak"] != null;
  U.shell({ page: "profile.html", lolli: !S.state.settings.streak ? "Every episode, rating and finished show earns XP toward your next level."
    : weekStreak ? "Week Streak earned! Keep the run going." : "Only " + (7 - st.current) + " more day" + (7 - st.current === 1 ? "" : "s") + " of watching to earn your Week Streak sticker!" });

  var GCOL = ["#1F3FA6", "#F25C05", "#6F8FE8", "#FFA25C", "#FFD3B3", "#F7823A", "#B3B6C6"];
  var FACE = '<svg width="96" height="96" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="17" r="10.5" fill="#FFFBF2" stroke="#0F1F5C" stroke-width="1"></circle><path d="M4.6 14.5c1.6-8 17.4-10 20.8-1.4c-5-1-8-3.8-9-5c-2.2 3.2-6.4 5.4-11.8 6.4z" fill="#0F1F5C"></path><circle cx="11.6" cy="18" r="1.1" fill="#0F1F5C"></circle><circle cx="18.4" cy="18" r="1.1" fill="#0F1F5C"></circle><path d="M13 22q2 1.6 4 0" stroke="#0F1F5C" stroke-width="1.1" fill="none" stroke-linecap="round"></path><circle cx="9.6" cy="20.6" r="1.3" fill="#FFD3B3"></circle><circle cx="20.4" cy="20.6" r="1.3" fill="#FFD3B3"></circle></svg>';

  // a row of posters (title under each), linking to the details panel
  function posters(list, extra, empty) {
    if (!list.length) return '<p class="body muted">' + empty + "</p>";
    return list.map(function (e) {
      return '<a class="pf-poster" href="' + U.detailsHref(e) + '">' +
        '<span class="pf-poster-art">' + U.art(e) + (extra ? extra(e) : "") + "</span>" +
        '<span class="pf-poster-t">' + esc(e.title) + "</span></a>";
    }).join("");
  }

  function render() {
    var p = S.state.profile, c = S.counts(), t = S.totals(), lv = S.xp(), mix = S.genreMix(), ach = S.achievements();
    var earned = ach.filter(function (a) { return a.earned; }).length;
    var top = mix.filter(function (g) { return g.name !== "Other"; }).slice(0, 3);
    var tagCols = [["#1F3FA6", "#FFFBF2"], ["#FFA25C", "#0F1F5C"], ["#FFD3B3", "#0F1F5C"]];
    var entries = S.ids().map(S.entry);

    // header: banner, avatar with level, name, bio, genres, the headline numbers, actions
    var nums = [
      [c.watching + c.completed + c.dropped, "Watched"],
      [c.completed, "Completed"],
      [t.episodes.toLocaleString("en-US"), "Episodes"],
      [t.mean || "–", "Avg rating"],
      [S.longestStreak(), "Best streak"],
    ];
    U.$("#me").innerHTML =
      '<div class="pf-banner" aria-hidden="true"></div>' +
      '<div class="pf-id">' +
        '<div class="pf-avatar">' + FACE + '<span class="pf-lv">LV ' + lv.level + "</span></div>" +
        '<div class="pf-who">' +
          '<h2 id="me-h" class="pf-name">' + esc(p.name) + "</h2>" +
          '<p class="pf-handle">@' + esc(p.handle) + " · Member since " + p.since + "</p>" +
          (p.bio ? '<p class="pf-bio">' + esc(p.bio) + "</p>" : "") +
        "</div>" +
        '<div class="pf-actions"><a class="btn btn-soft" href="settings.html">' + icon("edit", 18) + "Edit profile</a>" +
        '<button type="button" id="share" class="btn btn-soft">' + icon("share", 18) + "Share list</button></div>" +
      "</div>" +
      '<dl class="pf-nums">' + nums.map(function (n) { return "<div><dd>" + n[0] + "</dd><dt>" + n[1] + "</dt></div>"; }).join("") +
        // top genres fill the rest of the strip, right after Best streak
        (top.length ? '<div class="pf-nums-genres"><dd>' + top.map(function (g, i) { return '<span class="tag" style="background:' + tagCols[i][0] + ";color:" + tagCols[i][1] + '">' + esc(g.name) + "</span>"; }).join("") + "</dd><dt>Top genres</dt></div>" : "") +
      "</dl>";

    // your five top rated
    var rated = entries.filter(function (e) { return e.rating > 0; })
      .sort(function (a, b) { return b.rating - a.rating || b.updatedAt - a.updatedAt; }).slice(0, 5);
    U.$("#top").innerHTML = posters(rated, function (e) {
      return '<span class="pf-rate">' + U.star(12, "#F25C05") + U.fmtRating(e.rating) + "</span>";
    }, "Rate a show and your favorites will show up here.");

    // sidebar: level, genre mix, library counts
    var R = S.xpRules, n = function (x) { return x.toLocaleString("en-US"); };
    // where the XP came from: [label, XP, how it's earned]
    var from = [
      ["Episodes", lv.from.episodes, R.episode + " each"],
      ["Completed", lv.from.completed, R.completed + " each"],
      ["Ratings", lv.from.ratings, R.rating + " each"],
      ["Reviews", lv.from.reviews, R.review + " each"],
      ["Badges", lv.from.badges, R.badge + " each"],
      ["Streak days", lv.from.streaks, R.streakDay + "–" + R.streakDay * R.streakCap + " a day"],
    ];
    U.$("#level").innerHTML = '<span class="pf-side-h" id="lv-h">Level ' + lv.level + " · " + esc(lv.title) + "</span>" +
      '<div class="pf-xp" role="progressbar" aria-label="Level progress" aria-valuemin="0" aria-valuemax="' + lv.need + '" aria-valuenow="' + lv.into + '"><span style="width:' + Math.round(lv.into / lv.need * 100) + '%"></span></div>' +
      '<p class="pf-xp-cap"><strong>' + n(lv.into) + " / " + n(lv.need) + " XP</strong><span>" + n(lv.need - lv.into) + " to Level " + (lv.level + 1) + "</span></p>" +
      (lv.nextTitle ? '<p class="caption muted">Next title: <strong>' + esc(lv.nextTitle.title) + "</strong> at Level " + lv.nextTitle.level + "</p>" : "") +
      '<ul class="pf-xp-from" aria-label="Where your ' + n(lv.xp) + ' XP came from">' + from.map(function (r) {
        return "<li><span>" + r[0] + ' <span class="muted">· ' + r[2] + "</span></span><strong>" + n(r[1]) + "</strong></li>";
      }).join("") + '<li class="pf-xp-total"><span>Total</span><strong>' + n(lv.xp) + " XP</strong></li></ul>" +
      '<p class="caption muted">Streak days earn ' + R.streakDay + " XP × the day of the streak, up to day " + R.streakCap + ". Each level costs 100 XP more than the last.</p>";

    U.$("#mix").innerHTML = '<div class="genre-bar" role="img" aria-label="' + esc(mix.map(function (g) { return g.name + " " + g.pct + "%"; }).join(", ")) + '">' +
      mix.map(function (g, i) { return '<span style="width:' + g.pct + "%;background:" + GCOL[i % GCOL.length] + '"></span>'; }).join("") + "</div>" +
      '<ul class="legend">' + mix.map(function (g, i) { return '<li><i aria-hidden="true" style="background:' + GCOL[i % GCOL.length] + '"></i>' + esc(g.name) + " <strong>" + g.pct + "%</strong></li>"; }).join("") + "</ul>";

    U.$("#lib").innerHTML = [["watching", "Watching", c.watching], ["plan", "Plan to Watch", c.plan], ["completed", "Completed", c.completed], ["dropped", "Dropped", c.dropped]]
      .map(function (r) { return '<li><a href="library.html?tab=' + r[0] + '"><span>' + r[1] + "</span><strong>" + r[2] + "</strong>" + icon("arrow", 14, 2.4) + "</a></li>"; }).join("");

    U.$("#ach-count").textContent = earned + " of " + ach.length + " earned";
    U.$("#ach").innerHTML = ach.map(function (a) {
      return '<li class="' + (a.earned ? "" : "locked") + '"><span class="ach-badge" aria-hidden="true" style="' + (a.earned ? "background:" + a.bg + ";color:" + (a.bg === "#1F3FA6" ? "#FFFBF2" : "#0F1F5C") : "") + '">' + esc(a.glyph) +
        (a.earned ? "" : '<span class="ach-lock">' + icon("lock", 12, 2.6) + "</span>") + "</span>" +
        '<span class="small bold">' + esc(a.name) + '</span><span class="caption muted" style="font-weight:500">' + esc(a.desc) + "</span>" +
        (a.earned ? '<span class="pf-earned">' + icon("check", 12, 3) + "Earned</span>" : '<span class="caption bold" style="color:var(--blue-text)">' + esc(a.progress) + "</span>") + "</li>";
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
  // real posters for the top rated row
  var pending; NEKAI.tenrai.hydrate(S.ids(), function () { clearTimeout(pending); pending = setTimeout(render, 250); });
})();
