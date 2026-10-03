/* Home: greeting, latest achievement and streak; pick up where you left off and status; continue watching; picks */
(function () {
  "use strict";
  var S = NEKAI.store, U = NEKAI.ui, esc = U.esc, icon = U.icon;
  if (!S.state.signedIn) { location.replace("signin.html"); return; }

  var streak = S.streak();
  U.shell({
    page: "index.html",
    // Streak nudges only when Settings → Streak reminders is on
    lolli: !S.state.settings.streak ? "Welcome back! Pick up where you left off, or find something new in Discover."
      : streak.loggedToday ? "Nice! Today counts toward your " + streak.current + "-day streak."
      : streak.current ? (streak.current === 1 ? "One day down!" : streak.current + " days in a row!") + " Log one episode today and your streak reaches " + (streak.current + 1) + "."
      : "Log an episode today to start a new streak."
  });

  var DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  // Titles you're watching, most recently updated first
  function watchingByRecent() {
    return S.ids(function (e) { return e.status === "watching"; }).map(S.entry)
      .sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  }

  // A brand-new account's first visit: "Welcome," instead of "Welcome back,"
  var firstVisit = !!S.state.firstHome;
  U.$(".greet-hello").textContent = firstVisit ? "Welcome," : "Welcome back,";
  S.seenHome();
  // The first name, the line under the greeting, and the Status card
  function renderIntro() {
    var c = S.counts(), st = S.streak();
    U.$("#who").textContent = String(S.state.profile.name || "").trim().split(/\s+/)[0]; // first name only
    U.$("#intro-sub").textContent = c.watching + " anime in progress" + (st.current ? " and a " + st.current + "-day watch streak. Keep it going!" : ". Log an episode to start a streak.");
    renderStatus(c);
  }

  // Status: how the Library splits by status. One bar shows the proportions; each row
  // (dot = its color in the bar) opens that tab in Library.
  var STATUS_ROWS = [
    ["completed", "Completed"],
    ["watching", "Currently watching"],
    ["plan", "Plan to Watch"],
    ["dropped", "Dropped"],
  ];
  function renderStatus(c) {
    var total = c.watching + c.completed + c.dropped + c.plan,
      watched = c.watching + c.completed + c.dropped;
    var bar = STATUS_ROWS.filter(function (r) { return c[r[0]]; }).map(function (r) {
      return '<span class="st-seg st-' + r[0] + '" style="flex-grow:' + c[r[0]] + '" title="' + r[1] + ": " + c[r[0]] + '"></span>';
    }).join("");
    U.render(U.$("#status"),
      '<div class="st-head"><span class="st-big">' + watched + "</span>" +
        '<span class="st-label">anime watched<small>' + (total ? "of " + total + " in your Library" : "Add a show to get started") + "</small></span></div>" +
      '<div class="st-bar" role="img" aria-label="Your Library: ' + STATUS_ROWS.map(function (r) { return c[r[0]] + " " + r[1].toLowerCase(); }).join(", ") + '">' +
        (bar || '<span class="st-seg st-empty" style="flex-grow:1"></span>') + "</div>" +
      '<ul class="st-list">' + STATUS_ROWS.map(function (r) {
        return '<li><a class="st-row" href="library.html?tab=' + r[0] + '"><i class="st-dot st-' + r[0] + '" aria-hidden="true"></i>' +
          '<span class="st-name">' + r[1] + '</span><b class="st-num">' + c[r[0]] + "</b>" + icon("arrow", 16, 2.4) + "</a></li>";
      }).join("") + "</ul>");
  }

  /* ---------- "Pick up where you left off" ---------- */
  var TRACK_MAX = 52; // up to this many episodes, the progress is a strip of one cell per episode

  // The small label over the next episode: Up next, All caught up, Completed…
  function nextLabel(e) {
    if (e.isDone) return "Completed";
    if (e.known && e.watched >= e.episodes) return "All caught up";
    if (e.ongoing && e.aired && e.watched >= e.aired) return "Caught up · airing";
    return "Up next";
  }
  // The big line: the next episode to watch, or how far you've got
  function nextEpisode(e) {
    if (e.isDone || (e.known && e.watched >= e.episodes)) return e.episodes + " of " + e.episodes + " watched";
    if (e.ongoing && e.aired && e.watched >= e.aired) return "Episode " + (e.aired + 1).toLocaleString("en-US") + " soon";
    return "Episode " + (e.watched + 1).toLocaleString("en-US");
  }
  // Episode track: one cell per episode (watched = orange, next = cobalt outline) for a normal
  // season; long or ongoing shows get a continuous bar, since hundreds of cells would be noise.
  function episodeTrack(e) {
    var total = e.episodes || e.aired;
    if (!total) return '<div class="cw-track-cap"><span>' + esc(e.progText) + "</span></div>";
    var left = Math.max(0, total - e.watched);
    var aria = ' role="progressbar" aria-label="' + esc(e.title) + ' progress" aria-valuemin="0" aria-valuemax="' + total +
      '" aria-valuenow="' + Math.min(e.watched, total) + '" aria-valuetext="' + esc(e.progText) + '"';
    var bar;
    if (e.known && total <= TRACK_MAX) {
      var cells = "";
      for (var i = 1; i <= total; i++)
        cells += '<i class="' + (i <= e.watched ? "on" : i === e.watched + 1 ? "next" : "") + '"></i>';
      bar = '<div class="cw-track"' + aria + ' style="--n:' + total + '">' + cells + "</div>";
    } else {
      bar = '<div class="cw-track is-bar"' + aria + '><span style="width:' + e.pct + '%"></span></div>';
    }
    return '<div class="cw-progress">' + bar +
      '<div class="cw-track-cap"><span>' + e.watched.toLocaleString("en-US") + " of " + total.toLocaleString("en-US") + (e.ongoing ? " aired" : "") + " watched</span>" +
      "<span>" + (left ? left.toLocaleString("en-US") + (left === 1 ? " episode" : " episodes") + " left" : "Done") + "</span></div></div>";
  }

  // Poster (title on its fade, your rating on it) on the left; what's next and your progress on the right
  function renderHero(e) {
    var host = U.$("#hero");
    if (!e) {
      U.render(host, U.emptyState("NOTHING PLAYING", "You’re not watching anything yet", "Start something from your Plan to Watch list or find a new favorite in Discover.",
        '<a class="btn btn-secondary" href="discover.html">Browse Discover</a>'));
      return;
    }
    U.render(host,
      '<article class="cw library-list" aria-labelledby="cw-h">' +
      '<div class="cw-media">' +
        '<a class="cw-poster" href="' + U.detailsHref(e) + '" tabindex="-1" aria-hidden="true">' + U.art(e, { lg: true }) + "</a>" +
        U.ratingBtn(e) +
        (e.airing ? '<div class="poster-chips">' + U.airingChip(e) + "</div>" : "") +
        '<div class="cw-cap"><h3 id="cw-h" class="cw-title"><a class="title-link" href="' + U.detailsHref(e) + '">' + esc(e.title) + "</a>" + U.seasonBadge(e) + "</h3>" +
          (e.jp ? '<p class="cw-jp" lang="ja">' + esc(e.jp) + "</p>" : "") + "</div>" +
      "</div>" +
      '<div class="cw-body">' +
        // What you'll watch next leads, in the display face; the section heading already says "continue"
        '<div class="cw-next">' +
          '<span class="cw-eyebrow">' + esc(nextLabel(e)) + "</span>" +
          '<p class="cw-ep-big">' + esc(nextEpisode(e)) + "</p>" +
          '<p class="cw-meta"><span>' + esc([e.type, e.episodes ? e.episodes + " eps" : "", e.studio, e.season].filter(Boolean).join(" · ")) + "</span>" + U.scoreBadge(e) + "</p>" +
        "</div>" +
        episodeTrack(e) +
        '<div class="cw-foot">' + U.stepper(e) + U.reviewBtn(e) +
          '<a class="cw-open" href="library.html">Open in Library' + icon("arrow", 18, 2.4) + "</a></div>" +
      "</div></article>");
  }

  // Welcome banner panels: this week's streak and the latest achievement
  function renderSide() {
    var st = S.streak(), today = new Date(), dow = (today.getDay() + 6) % 7; // Monday = 0
    // Each day: logged (orange, check), today not logged yet (ring), still to come (faint), or missed
    var week = DAYS.map(function (name, i) {
      var d = new Date(today); d.setDate(today.getDate() - dow + i);
      var on = !!S.state.log[S.dayKey(d)] && i <= dow,
        isToday = i === dow,
        later = i > dow;
      var cls = "day" + (on ? " on" : isToday ? " today" : later ? " later" : "");
      var said = on ? "watched" : isToday ? "today, not logged yet" : later ? "coming up" : "missed";
      return '<li><span class="day-l" aria-hidden="true">' + name[0] + '</span><span class="' + cls + '">' + (on ? icon("check", 14, 3.2) : "") +
        '</span><span class="sr">' + name + ": " + said + "</span></li>";
    }).join("");
    U.$("#streak").innerHTML =
      '<div class="hp-head"><span class="hp-flame" aria-hidden="true">' + icon("flame", 20) + "</span>" +
      '<div><h2 id="st-h" class="hp-title">' + st.current + '-day streak <span class="hp-tag">' + (st.current ? "Keep going!" : "Start today!") + "</span></h2>" +
      '<p class="hp-sub">Longest: ' + S.longestStreak() + " days</p></div></div>" +
      '<ul class="week" aria-label="This week">' + week + "</ul>" +
      '<p class="hp-note">' + (st.loggedToday ? "Today’s episode is logged. See you tomorrow!" : "Log one episode today to reach " + (st.current + 1) + " days.") + "</p>";

    var ach = S.achievements(), earned = ach.filter(function (a) { return a.earned; });
    var last = S.latestAchievement();
    U.$("#achievement").innerHTML = '<span class="hp-eyebrow">LATEST ACHIEVEMENT</span>' +
      (last ? '<div class="hp-head"><span class="hp-badge" aria-hidden="true" style="background:' + last.bg + ";color:" + (last.bg === "#1F3FA6" ? "#FFFBF2" : "#0F1F5C") + '">' + esc(last.glyph) + "</span>" +
        '<div><h2 id="ach-h" class="hp-title">' + esc(last.name) + '</h2><p class="hp-sub">' + esc(last.desc) + " · " + earned.length + " of " + ach.length + " earned</p></div></div>"
        : '<h2 id="ach-h" class="hp-title">No stickers yet</h2><p class="hp-sub">Add your first anime to earn First Steps.</p>') +
      '<a class="hp-link" href="profile.html">' + icon("trophy", 16) + "All achievements" + icon("arrow", 14, 2.4) + "</a>";
  }

  // Genre chips, colored like the Nekai's Picks cards
  function genreTags(e) {
    return (e.genres || []).slice(0, 3).map(function (g) {
      var c = NEKAI.data.genreColors[g] || { bg: "#EDE4D2", fg: "#4A5378" };
      return '<span role="listitem" class="gtag gtag-' + U.genreTone(c) + '" style="background:' + c.bg + ";color:" + c.fg + '">' + esc(g) + "</span>";
    }).join("");
  }

  // Same look as the Nekai's Picks cards: white card, inset poster, soft pill counter (.library-list)
  function contCard(e) {
    var next = e.known && e.watched >= e.episodes ? e.watched : e.watched + 1;
    var tags = genreTags(e);
    return '<article class="cw-card">' +
      // the title sits on a fade at the bottom of the poster, so a second line grows up into it
      '<div class="cw-card-media has-cap"><a class="pick-hit" href="' + U.detailsHref(e) + '" tabindex="-1" aria-hidden="true">' + U.art(e) + "</a>" +
        '<div class="poster-chips"><span class="cw-ep">EP ' + next + "</span>" + U.airingChip(e) + "</div>" +
        '<div class="card-cap"><h3 class="pick-title"><a class="title-link" href="' + U.detailsHref(e) + '">' + esc(e.title) + "</a>" + U.seasonBadge(e) + "</h3></div></div>" +
      (e.year ? '<p class="m-sub card-sub">' + esc(e.year) + "</p>" : "") +
      (tags ? '<div class="pick-tags" role="list" aria-label="Genres">' + tags + "</div>" : "") +
      // the progress text is gone, so the bar carries it for screen readers
      (e.known || e.aired ? '<div class="progress" role="progressbar" aria-label="' + esc(e.title) + ' progress" aria-valuemin="0" aria-valuemax="' + (e.episodes || e.aired) + '" aria-valuenow="' + e.watched + '" aria-valuetext="' + esc(e.progText) + '"><span style="width:' + e.pct + '%"></span></div>' : "") +
      '<div class="cw-card-foot">' + U.stepper(e) + "</div>" +
      "</article>";
  }

  var heroId = null;
  // Redraws the whole page (on load and after every store change)
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
    U.render(U.$("#continue"), rest.length ? '<div class="cw-grid library-list">' + rest.map(contCard).join("") + "</div>"
      : '<p class="body muted">Nothing else in progress. Pick something from <a href="library.html">Plan to Watch</a>.</p>');
    var picks = U.picks();
    if (picks.length) U.pickRow(U.$("#picks"), picks, "Picked for you, scroll sideways", { lite: true, wide: true, dismiss: true });
    else U.render(U.$("#picks"), '<p class="body muted">You’ve added or hidden every pick. Get a fresh set on <a href="discover.html">Discover</a>.</p>');
  }

  S.subscribe(render);
  render();

  // A new account (genres picked, nothing added yet): ask for AI picks from those genres now,
  // so "Picked for you" isn't the generic starter list. Saved picks are reused for a day.
  var R = NEKAI.recommend;
  if (R && !S.ids().length && (S.state.favGenres || []).length && !R.fresh()) R.load(false).catch(function () { /* the curated picks stay */ });

  // Ongoing shows: fetch how many episodes have aired so far (for the progress bar and counter),
  // refreshed every few hours since a new episode can come out any week
  var AIRED_TTL = 6 * 3600e3;
  S.ids(function (e) { return e.status === "watching"; }).map(S.entry)
    .filter(function (e) { return e.ongoing && !(e.airedAt && Date.now() - e.airedAt < AIRED_TTL); })
    .forEach(function (e) {
      NEKAI.tenrai.airedCount(e.id).then(function (n) {
        if (n) S.cacheAnime({ id: e.id, airedEps: n, airedAt: Date.now() });
        render();
      }).catch(function () {});
    });

  // Work out which season each show you're watching is (for the S2 / S3 badges)
  var seasonsPending;
  NEKAI.tenrai.fillSeasons(S.ids(function (e) { return e.status === "watching"; }), function () {
    clearTimeout(seasonsPending); seasonsPending = setTimeout(render, 300);
  });

  // Swap placeholder art for real posters from Tenrai, a few at a time
  var pending;
  NEKAI.tenrai.hydrate(S.ids().concat(NEKAI.data.picks.map(function (p) { return String(p.id); })), function () {
    clearTimeout(pending); pending = setTimeout(render, 250);
  });
})();
