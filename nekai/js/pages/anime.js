/* Anime details: anime.html?id=<MyAnimeList id>
 * Shows cached/sample data immediately, then refreshes from Jikan
 * (full record, trailer and episode list).
 */
(function () {
  "use strict";
  var S = NEKAI.store, U = NEKAI.ui, D = NEKAI.data, J = NEKAI.jikan, esc = U.esc, icon = U.icon;
  if (!S.state.signedIn) { location.replace("signin.html"); return; }

  var id = Number(new URLSearchParams(location.search).get("id")) || 37521;
  var ui = { addAs: "plan", adding: false, loading: true, failed: false, eps: [], epsPage: 1, epsNext: false, epsLoading: false, epsFailed: false, showAll: false, trailerOn: false };

  var first = S.anime(id);
  var match = first ? S.match(first) : null;
  U.shell({
    page: "discover.html",
    lolli: first ? first.title + " is a " + match + "% match for you" + (first.genres.length ? ": " + first.genres.slice(0, 2).join(" and ") + "." : ".") : "Loading this anime from Jikan…"
  });

  function watchlist(e) {
    if (!e.inList) {
      return '<h2 id="wl-h" class="h3">Your watchlist</h2>' +
        '<div><label class="label" for="add-as">Add as</label><select id="add-as" class="input select">' +
        Object.keys(D.statuses).map(function (k) { return '<option value="' + k + '"' + (k === ui.addAs ? " selected" : "") + ">" + D.statuses[k].label + "</option>"; }).join("") +
        "</select></div>" +
        '<button type="button" id="add" class="btn btn-primary w-full"' + (ui.adding ? ' disabled aria-busy="true"' : "") + ">" +
        (ui.adding ? '<span class="spinner" aria-hidden="true"></span>Adding…' : icon("plus", 20) + "Add to watchlist") + "</button>";
    }
    return '<h2 id="wl-h" class="h3">Your watchlist</h2>' +
      '<div><label class="label" for="st">Status</label>' + U.statusSelect(e, "st") + "</div>" +
      '<div><span class="label">Episodes watched</span>' + U.stepper(e) + "</div>" +
      (e.known ? '<div class="progress" role="progressbar" aria-label="Progress, ' + e.pct + '%" aria-valuemin="0" aria-valuemax="' + e.episodes + '" aria-valuenow="' + e.watched + '"><span style="width:' + e.pct + '%"></span></div>' : '<p class="caption muted">Total episodes unknown</p>') +
      (e.askComplete ? '<button type="button" class="btn btn-accent" data-act="complete" data-id="' + e.id + '">Mark completed</button>' : "") +
      '<div><span class="label">Your rating</span>' + U.stars(e) + "</div>" +
      '<button type="button" class="btn btn-ghost self-start" data-act="remove" data-id="' + e.id + '" style="padding:0 8px;color:var(--red-dark)">' + icon("trash", 20) + "Remove from list</button>";
  }

  function trailer(e) {
    if (!e.trailer) {
      return '<div class="trailer" role="img" aria-label="No trailer available"><span aria-hidden="true" style="position:absolute;left:-48px;bottom:-64px;width:320px;height:320px;border-radius:50%;background:var(--orange);opacity:.9"></span>' +
        '<span class="trailer-play" style="background:#4A5378">' + (ui.loading ? '<span class="spinner" aria-hidden="true"></span>Checking for a trailer…' : ui.failed ? "Trailer unavailable offline" : "No trailer on MyAnimeList yet") + "</span></div>";
    }
    if (ui.trailerOn) {
      return '<div class="trailer"><iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(e.trailer) + '?autoplay=1&rel=0" title="' + esc(e.title) + ' trailer" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>';
    }
    return '<button type="button" class="trailer" id="play" aria-label="Play the official trailer for ' + esc(e.title) + '">' +
      (e.trailerThumb ? '<img class="trailer-thumb" src="' + esc(e.trailerThumb) + '" alt="">' :
        '<span aria-hidden="true" style="position:absolute;left:-48px;bottom:-64px;width:320px;height:320px;border-radius:50%;background:var(--orange);opacity:.9"></span><span aria-hidden="true" style="position:absolute;right:48px;top:48px;width:96px;height:96px;border-radius:50%;background:var(--cream);opacity:.9"></span>') +
      '<span class="trailer-play">' + icon("playc", 32, 2) + "Play trailer</span></button>";
  }

  function episodes(e) {
    var list = ui.eps.length ? ui.eps : [];
    var total = e.episodes;
    // Fall back to numbered placeholders when Jikan has no episode list
    if (!list.length && total && !ui.epsLoading) {
      for (var i = 1; i <= Math.min(total, 24); i++) list.push({ n: i, title: "", aired: "" });
    }
    var shown = ui.showAll ? list : list.slice(0, 6);
    var items = shown.map(function (x) {
      var watched = e.inList && e.watched >= x.n;
      var next = e.inList && !watched && x.n === e.watched + 1;
      return '<li class="card-sm ep-item' + (watched ? " watched" : "") + '"><span class="ep-num" aria-hidden="true">' + x.n + "</span>" +
        '<div style="min-width:0"><h3 class="h3">Episode ' + x.n + (x.title ? ' · <span class="muted" style="font-weight:500">' + esc(x.title) + "</span>" : "") + "</h3>" +
        '<p class="small muted">' + esc([x.aired ? "Aired " + x.aired : (ui.epsFailed ? "Episode title unavailable offline" : ""), x.filler ? "Filler" : "", x.recap ? "Recap" : ""].filter(Boolean).join(" · ") || "Details not listed on MyAnimeList") + "</p></div>" +
        '<span class="caption bold" style="color:' + (watched ? "#1F3FA6" : "var(--red-dark)") + '">' + (watched ? "✓ Watched" : next ? "Up next" : "") + "</span></li>";
    }).join("");
    var head = '<h2 id="ep-h" class="h2 sec-title"><span class="pill pill-ink">EPISODES</span>' + (total ? total + " episodes" : "Episodes") + "</h2>";
    if (ui.epsLoading && !ui.eps.length) return head + '<div class="stack gap-8" aria-busy="true">' + '<div class="skel" style="height:80px"></div>'.repeat(4) + "</div>";
    if (!list.length) return head + '<p class="body muted">No episode list yet. It usually appears once the show starts airing.</p>';
    var more = "";
    if (list.length > 6 || ui.epsNext) {
      more = ui.showAll
        ? (ui.epsNext ? '<button type="button" class="btn btn-secondary self-start" id="more-eps">' + (ui.epsLoading ? '<span class="spinner" aria-hidden="true"></span>Loading…' : "Load more episodes") + "</button>"
          : '<button type="button" class="btn btn-secondary self-start" id="fewer-eps">Show fewer</button>')
        : '<button type="button" class="btn btn-secondary self-start" id="all-eps">Show all · 6 of ' + (total || list.length + "+") + " shown</button>";
    }
    return head + '<ol class="ep-list">' + items + "</ol>" + more;
  }

  function render() {
    var e = S.entry(id);
    var host = U.$("#details");
    if (!e) {
      U.render(host, ui.loading ? '<div class="stack gap-16" aria-busy="true"><div class="skel" style="height:56px;width:60%"></div><div class="skel" style="height:320px"></div></div>'
        : U.emptyState("NOT FOUND", "We couldn’t load this anime", "Check your connection, or go back and search for it again.", '<a class="btn btn-secondary" href="discover.html">Back to Discover</a>'));
      return;
    }
    document.title = "NEKAI — " + e.title;
    var tags = [e.type, e.epsText, e.season, e.studio].filter(Boolean).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("");
    U.render(host,
      '<div class="details">' +
        '<div class="stack gap-32">' +
          '<div class="cart" style="padding:16px">' + U.art(e, { lg: true }) + "</div>" +
          '<section aria-labelledby="wl-h" class="card pad-24 stack gap-16" id="wl">' + watchlist(e) + "</section>" +
        "</div>" +
        '<div class="stack gap-32" style="min-width:0">' +
          '<div class="stack gap-16"><div class="row gap-8">' + tags + "</div>" +
            '<div class="page-title"><h1 class="h1">' + esc(e.title) + "</h1>" + (e.jp ? '<span class="jp-tag" aria-hidden="true">' + esc(e.jp) + "</span>" : "") + "</div></div>" +
          '<dl class="grid-2">' +
            '<div class="card-sm stat yellow"><dt>Community score<span>From Jikan (MyAnimeList). Not your rating.</span></dt><dd class="title">★ ' + esc(e.scoreText) + "</dd></div>" +
            '<div class="card-sm stat"><dt>Your rating<span class="muted">' + (e.inList ? "Rate it with the stars in your watchlist panel." : "Add it to your list to rate it.") + '</span></dt><dd class="title">' + (e.rating ? e.rating + " / 5" : "Not rated") + "</dd></div>" +
          "</dl>" +
          '<section aria-labelledby="syn-h" class="stack gap-16"><h2 id="syn-h" class="h2 sec-title"><span class="pill pill-teal">STORY</span>Synopsis</h2>' +
            (e.synopsis ? '<p class="body reading">' + esc(e.synopsis) + "</p>" : ui.loading ? '<div class="stack gap-8"><div class="skel" style="height:20px"></div><div class="skel" style="height:20px;width:80%"></div></div>' : '<p class="body muted">No synopsis available yet.</p>') +
            '<div class="row gap-8">' + e.genres.map(function (g) { return '<span class="tag" style="background:#FFFBF2;border:1.5px solid var(--ink)">' + esc(g) + "</span>"; }).join("") + "</div>" +
            (ui.failed ? '<p class="notice" role="status">' + icon("wifiOff", 20) + "<span>Couldn’t reach the Jikan API. Showing NEKAI’s saved details, which may be incomplete.</span></p>"
              : '<p class="caption muted row gap-8">' + icon("info", 16) + "Details come from the Jikan API. Some fields can be missing for new or obscure titles.</p>") +
          "</section>" +
          '<div class="grid-fit" style="--min:520px">' +
            '<section aria-labelledby="tr-h" class="stack gap-16"><h2 id="tr-h" class="h2 sec-title"><span class="pill pill-red">TRAILER</span>Official trailer</h2>' + trailer(e) +
              (e.trailer ? '<a class="small bold self-start" href="https://www.youtube.com/watch?v=' + encodeURIComponent(e.trailer) + '" target="_blank" rel="noopener">Open on YouTube ↗</a>' : "") + "</section>" +
            '<section aria-labelledby="ep-h" class="stack gap-16">' + episodes(e) + "</section>" +
          "</div>" +
        "</div>" +
      "</div>");
  }

  function loadEpisodes(page) {
    ui.epsLoading = true; render();
    J.episodes(id, page).then(function (r) {
      ui.eps = ui.eps.concat(r.items); ui.epsNext = r.hasNext; ui.epsPage = page;
    }).catch(function () { ui.epsFailed = true; }).then(function () { ui.epsLoading = false; render(); });
  }

  U.$("#details").addEventListener("change", function (e) { if (e.target.id === "add-as") ui.addAs = e.target.value; });
  U.$("#details").addEventListener("click", function (ev) {
    var t = ev.target.closest("button"); if (!t) return;
    if (t.id === "add") {
      ui.adding = true; render();
      setTimeout(function () {
        ui.adding = false;
        var a = S.anime(id), r = S.add(id, ui.addAs);
        if (r.firstCompletion) { U.confetti(); U.sound("done"); }
        U.toast(a.title + " added to " + D.statuses[ui.addAs].label, r.undo);
        var sel = U.$("#st"); if (sel) sel.focus();
      }, 400);
    }
    if (t.id === "play") { ui.trailerOn = true; render(); }
    if (t.id === "all-eps") { ui.showAll = true; render(); }
    if (t.id === "fewer-eps") { ui.showAll = false; render(); U.$("#ep-h").scrollIntoView({ block: "nearest" }); }
    if (t.id === "more-eps" && !ui.epsLoading) loadEpisodes(ui.epsPage + 1);
  });

  // "Back" returns to wherever the user came from inside NEKAI
  U.$("#back").addEventListener("click", function (ev) {
    if (document.referrer && document.referrer.indexOf(location.origin) === 0 && history.length > 1) { ev.preventDefault(); history.back(); }
  });

  S.subscribe(render);
  render();
  J.full(id).then(function (a) {
    // Keep curated fields (title, season text, placeholder art) for sample titles; take everything else fresh
    var keep = NEKAI.data.catalog[String(id)];
    if (keep) { delete a.title; delete a.season; delete a.genres; }
    S.cacheAnime(a);
  }).catch(function () { ui.failed = true; }).then(function () { ui.loading = false; render(); });
  loadEpisodes(1);
})();
