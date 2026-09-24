/* Home: greeting, stats, continue watching, streak, latest achievement, picks */
(function () {
  "use strict";
  var S = NEKAI.store, U = NEKAI.ui, esc = U.esc, icon = U.icon;
  if (!S.state.signedIn) { location.replace("signin.html"); return; }

  var streak = S.streak();
  U.shell({
    page: "index.html",
    lolli: streak.loggedToday ? "Nice! Today counts toward your " + streak.current + "-day streak."
      : streak.current ? (streak.current === 1 ? "One day down!" : streak.current + " days in a row!") + " Log one episode today and your streak reaches " + (streak.current + 1) + "."
      : "Log an episode today to start a new streak."
  });

  var DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  function watchingByRecent() {
    return S.ids(function (e) { return e.status === "watching"; }).map(S.entry)
      .sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  }

  function renderIntro() {
    var c = S.counts(), st = S.streak();
    U.$("#who").textContent = S.state.profile.name;
    U.$("#intro-sub").textContent = c.watching + " anime in progress" + (st.current ? " and a " + st.current + "-day watch streak. Keep it going!" : ". Log an episode to start a streak.");
    U.$("#stat-watched").textContent = c.watching + c.completed + c.dropped;
    U.$("#stat-completed").textContent = c.completed;
    U.$("#stat-watching").textContent = c.watching;
    U.$("#stat-plan").textContent = c.plan;
  }

  function renderHero(e) {
    var host = U.$("#hero");
    if (!e) {
      U.render(host, U.emptyState("NOTHING PLAYING", "You’re not watching anything yet", "Start something from your Plan to Watch list or find a new favorite in Discover.",
        '<a class="btn btn-secondary" href="discover.html">Browse Discover</a>'));
      return;
    }
    U.render(host,
      '<section aria-labelledby="cw-h" class="cart hero"><div class="cart-label">' + U.art(e, { lg: true }) +
      '<div class="hero-body">' +
        '<div class="row gap-16">' + (e.isDone ? '<span class="pill pill-teal">COMPLETED</span>' : '<span class="pill pill-red">CONTINUE WATCHING</span>') +
          '<span class="small muted semibold">' + esc([e.type, e.episodes ? e.episodes + " eps" : "", e.studio, e.season].filter(Boolean).join(" · ")) + "</span></div>" +
        '<h2 id="cw-h" class="title"><a class="title-link" href="' + U.detailsHref(e) + '">' + esc(e.title) + "</a></h2>" +
        '<div class="row gap-16">' + U.scoreBadge(e) + '<span class="small bold">Your rating: ' + (e.rating ? e.rating + " / 10" : "Not rated") + "</span></div>" +
        '<div class="stack gap-8"><span class="small bold">' + esc(e.progText) + "</span>" +
          (e.known ? '<div class="progress" role="progressbar" aria-label="' + esc(e.title) + ' progress" aria-valuemin="0" aria-valuemax="' + e.episodes + '" aria-valuenow="' + e.watched + '"><span style="width:' + e.pct + '%"></span></div>' : "") + "</div>" +
        '<div class="row gap-16">' + U.stepper(e) + '<a class="btn btn-ghost" href="my-anime.html">Open in My Anime</a></div>' +
        (e.askComplete ? '<div class="prompt" role="status"><span class="grow">All ' + e.episodes + " episodes watched. Mark " + esc(e.title) + ' as completed?</span><button type="button" class="btn btn-accent" data-act="complete" data-id="' + e.id + '">Mark completed</button></div>' : "") +
      "</div></div></section>");
  }

  function renderSide() {
    var st = S.streak(), today = new Date(), dow = (today.getDay() + 6) % 7; // Monday = 0
    var week = DAYS.map(function (name, i) {
      var d = new Date(today); d.setDate(today.getDate() - dow + i);
      var on = !!S.state.log[S.dayKey(d)] && d <= today;
      return '<li><span class="caption muted" aria-hidden="true">' + name[0] + '</span><span class="day' + (on ? " on" : "") + '">' + (on ? icon("check", 16, 3) : "") +
        '</span><span class="sr">' + name + ": " + (on ? "watched" : "not yet") + "</span></li>";
    }).join("");
    U.$("#streak").innerHTML =
      '<div class="row gap-16" style="flex-wrap:nowrap"><span class="icon-tile" style="background:var(--orange)" aria-hidden="true">' + icon("flame", 24) + "</span>" +
      '<div><h2 id="st-h" class="title">' + st.current + "-day streak</h2>" + '<p class="small muted semibold">Longest: ' + S.longestStreak() + " days</p></div></div>" +
      '<ul class="week" aria-label="This week">' + week + "</ul>" +
      '<p class="small muted">' + (st.loggedToday ? "Today’s episode is logged. See you tomorrow!" : "Log one episode today to reach " + (st.current + 1) + " days.") + "</p>";

    var earned = S.achievements().filter(function (a) { return a.earned; });
    var last = earned[earned.length - 1];
    U.$("#achievement").innerHTML = '<span class="eyebrow">LATEST ACHIEVEMENT</span>' +
      (last ? '<div class="row gap-16" style="flex-wrap:nowrap"><span class="badge-round" aria-hidden="true" style="background:' + last.bg + ";color:" + (last.bg === "#1F3FA6" ? "#FFFBF2" : "#0F1F5C") + '">' + esc(last.glyph) + "</span>" +
        '<div><h2 id="ach-h" class="h3">' + esc(last.name) + '</h2><p class="small muted">' + esc(last.desc) + " · " + earned.length + " of 8 earned</p></div></div>"
        : '<h2 id="ach-h" class="h3">No stickers yet</h2><p class="small muted">Add your first anime to earn First Steps.</p>') +
      '<a class="btn btn-secondary self-start" href="profile.html">' + icon("trophy", 20) + "All achievements</a>";
  }

  function contCard(e) {
    return '<article class="cart">' + U.art(e, { ep: "EP " + (e.known && e.watched >= e.episodes ? e.watched : e.watched + 1) }) +
      '<div class="cart-label"><h3 class="h3 clamp2"><a class="title-link" href="' + U.detailsHref(e) + '">' + esc(e.title) + "</a></h3>" +
      '<p class="small muted semibold">' + esc(e.progText) + "</p>" +
      (e.known ? '<div class="progress" role="progressbar" aria-label="' + esc(e.title) + ' progress" aria-valuemin="0" aria-valuemax="' + e.episodes + '" aria-valuenow="' + e.watched + '"><span style="width:' + e.pct + '%"></span></div>' : "") +
      '<div style="margin-top:8px">' + U.stepper(e) + "</div>" +
      (e.askComplete ? '<button type="button" class="btn btn-accent w-full" data-act="complete" data-id="' + e.id + '" style="padding:0 16px">' + icon("check", 20) + "Mark completed</button>" : "") +
      "</div></article>";
  }

  var heroId = null;
  function render() {
    renderIntro();
    var list = watchingByRecent();
    // Keep the same hero while the user works on it, even after it's completed
    if (!heroId || !S.state.list[heroId]) heroId = list[0] ? String(list[0].id) : null;
    var hero = heroId ? S.entry(heroId) : null;
    renderHero(hero);
    renderSide();
    var rest = list.filter(function (e) { return String(e.id) !== heroId; }).slice(0, 4);
    U.$("#cont-count").textContent = "View all " + S.counts().watching;
    U.render(U.$("#continue"), rest.length ? '<div class="grid-auto">' + rest.map(contCard).join("") + "</div>"
      : '<p class="body muted">Nothing else in progress. Pick something from <a href="my-anime.html">Plan to Watch</a>.</p>');
    U.pickRow(U.$("#picks"), U.picks(), "Picked for you, scroll sideways");
  }

  S.subscribe(render);
  render();

  // Swap placeholder art for real posters from Tenrai, a few at a time
  var pending;
  NEKAI.tenrai.hydrate(S.ids().concat(NEKAI.data.picks.map(function (p) { return String(p.id); })), function () {
    clearTimeout(pending); pending = setTimeout(render, 250);
  });
})();
