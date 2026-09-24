/* Discover: live Jikan search, "What should I watch next?" picker, Nekai's Picks, genre signs */
(function () {
  "use strict";
  var S = NEKAI.store, U = NEKAI.ui, D = NEKAI.data, J = NEKAI.jikan, esc = U.esc, icon = U.icon;
  if (!S.state.signedIn) { location.replace("signin.html"); return; }

  U.shell({ page: "discover.html", lolli: "Not sure what to watch? Pick a genre or two below and I’ll find something you haven’t seen.", lolliCta: ["#picker", "Try it"] });

  var ui = { types: {}, genre: "", results: [], submitted: "", searching: false, offline: false, error: "", sel: {}, finding: false, pick: null, pickNone: false };

  /* ---------- search ---------- */
  function resultCard(a) {
    var e = S.entry(a.id) || a;
    var inList = !!e.inList;
    return '<article class="cart">' + U.art(a, { ep: [a.type, a.epsText].filter(Boolean).join(" · ") }) +
      '<div class="cart-label"><h3 class="h3 clamp2"><a class="title-link" href="' + U.detailsHref(a) + '">' + esc(a.title) + "</a></h3>" +
      '<div class="row gap-8">' + U.scoreBadge(a) + "</div>" +
      '<p class="caption muted">' + esc(a.genres.join(" · ") || "Genres unavailable") + "</p>" +
      '<div class="row gap-8" style="margin-top:auto;padding-top:8px">' +
        '<button type="button" class="btn ' + (inList ? "btn-accent" : "btn-secondary") + ' grow" data-act="toggle" data-id="' + a.id + '" aria-pressed="' + inList + '" style="padding:0 16px">' +
        (inList ? "✓ " + D.statuses[e.status].label : "Add to watchlist") + "</button></div></div></article>";
  }
  var SKEL = '<div class="cart" aria-hidden="true"><div class="skel" style="aspect-ratio:3/4;background:#26336A"></div><div class="cart-label"><div class="skel" style="height:16px;width:80%"></div><div class="skel" style="height:16px;width:56%"></div><div class="skel" style="height:48px;margin-top:16px"></div></div></div>';

  function localSearch(q) {
    q = q.toLowerCase();
    var typeOn = Object.keys(ui.types).filter(function (t) { return ui.types[t]; });
    return Object.keys(D.catalog).map(S.anime).filter(function (a) {
      if ((a.title + " " + a.jp + " " + a.studio).toLowerCase().indexOf(q) < 0) return false;
      if (typeOn.length && typeOn.indexOf(a.type) < 0) return false;
      if (ui.genre && a.genres.indexOf(ui.genre) < 0) return false;
      return true;
    });
  }

  function doSearch() {
    var q = U.$("#q").value.trim();
    if (q.length < 2) { ui.error = "Type at least 2 characters to search."; renderSearch(); U.$("#q").focus(); return; }
    ui.error = ""; ui.searching = true; ui.submitted = q; ui.offline = false;
    renderSearch(); renderResults();
    var typeOn = Object.keys(ui.types).filter(function (t) { return ui.types[t]; });
    J.search(q, { type: typeOn, genre: ui.genre }).then(function (list) {
      S.cacheMany(list);
      ui.results = list.map(function (a) { return S.anime(a.id); });
    }).catch(function () {
      ui.offline = true; ui.results = localSearch(q);
    }).then(function () {
      ui.searching = false; renderSearch(); renderResults();
      var h = U.$("#r-h"); if (h) h.focus({ preventScroll: false });
    });
  }

  function renderSearch() {
    var q = U.$("#q"), err = U.$("#q-err");
    q.setAttribute("aria-invalid", !!ui.error);
    err.hidden = !ui.error; err.lastChild.textContent = ui.error;
    var b = U.$("#search-btn");
    b.disabled = ui.searching; b.setAttribute("aria-busy", ui.searching);
    b.innerHTML = ui.searching ? '<span class="spinner" aria-hidden="true"></span>Searching…' : icon("search", 20) + "Search";
    U.render(U.$("#types"), ["TV", "Movie", "OVA", "ONA"].map(function (t) {
      return '<button type="button" class="chip" data-type="' + t + '" aria-pressed="' + !!ui.types[t] + '">' + (ui.types[t] ? icon("check", 16, 3) : "") + t + "</button>";
    }).join(""));
  }

  function renderResults() {
    var host = U.$("#results");
    host.hidden = !ui.submitted;
    if (!ui.submitted) return;
    var head = '<div class="sec-head"><h2 id="r-h" class="h2 sec-title" tabindex="-1"><span class="pill pill-blue">RESULTS</span>“' + esc(ui.submitted) + "”</h2>" +
      '<span class="small muted semibold">' + (ui.searching ? "Searching Jikan…" : ui.results.length + " anime found") + "</span>" +
      '<button type="button" class="btn btn-ghost ml-auto" id="clear">Clear search</button></div>';
    var note = ui.offline && !ui.searching ? '<p class="notice" role="status">' + icon("wifiOff", 20) + "<span>Couldn’t reach the Jikan API, so these results come from NEKAI’s built-in sample list. Check your connection and search again for everything on MyAnimeList.</span></p>" : "";
    var body;
    if (ui.searching) body = '<div class="grid-auto">' + SKEL + SKEL + SKEL + SKEL + "</div>";
    else if (ui.results.length) body = '<div class="grid-auto">' + ui.results.map(resultCard).join("") + "</div>";
    else body = '<div class="card empty"><div class="empty-top"><span class="pill pill-yellow">NO MATCH</span></div><div class="empty-body"><h3 class="h2">Nothing found for “' + esc(ui.submitted) +
      '”</h3><p class="body muted" style="max-width:480px">Check the spelling, try the Japanese title, or clear the type and genre filters.</p><button type="button" class="btn btn-secondary" id="clear2">Clear search</button></div></div>';
    U.render(host, head + note + body);
  }

  /* ---------- random picker ---------- */
  function pool(extra) {
    var sel = Object.keys(ui.sel).filter(function (g) { return ui.sel[g]; });
    var ids = {};
    Object.keys(D.catalog).forEach(function (id) { ids[id] = 1; });
    (extra || []).forEach(function (a) { ids[a.id] = 1; });
    return Object.keys(ids).map(S.entry).filter(function (e) {
      return e && e.status !== "watching" && e.status !== "completed" && e.status !== "dropped" &&
        e.genres.some(function (g) { return sel.indexOf(g) >= 0; });
    });
  }
  function find() {
    var sel = Object.keys(ui.sel).filter(function (g) { return ui.sel[g]; });
    if (!sel.length || ui.finding) return;
    ui.finding = true; renderPicker();
    var started = Date.now();
    J.byGenres(sel).then(function (list) { S.cacheMany(list); return list; }).catch(function () { return []; }).then(function (live) {
      var p = pool(live), others = p.filter(function (e) { return !ui.pick || e.id !== ui.pick; });
      var list = others.length ? others : p;
      setTimeout(function () {
        ui.finding = false;
        ui.pick = list.length ? list[Math.floor(Math.random() * list.length)].id : null;
        ui.pickNone = !list.length;
        renderPicker();
      }, Math.max(0, 500 - (Date.now() - started)));
    });
  }
  function renderPicker() {
    var sel = Object.keys(ui.sel).filter(function (g) { return ui.sel[g]; });
    U.render(U.$("#genres"), D.pickerGenres.map(function (g) {
      return '<button type="button" class="chip" data-genre="' + esc(g) + '" aria-pressed="' + !!ui.sel[g] + '">' + (ui.sel[g] ? icon("check", 16, 3) : "") + esc(g) + "</button>";
    }).join(""));
    var b = U.$("#find");
    b.disabled = !sel.length || ui.finding; b.setAttribute("aria-busy", ui.finding);
    b.innerHTML = ui.finding ? '<span class="spinner" aria-hidden="true"></span>Finding…' : icon("shuffle", 20) + "Find me an anime";
    U.$("#find-help").textContent = sel.length ? sel.length + (sel.length === 1 ? " genre" : " genres") + " selected · " + pool().length + "+ titles in the pool" : "Select at least one genre to start.";
    var out = U.$("#pick-out");
    if (ui.pick && !ui.finding) {
      var e = S.entry(ui.pick);
      U.render(out, '<div class="cart random-pick">' + U.art(e, { thumb: true, width: 128 }) + '<div class="cart-label"><span class="eyebrow">YOUR RANDOM PICK</span>' +
        '<h3 class="h2">' + esc(e.title) + "</h3>" +
        '<div class="row gap-16">' + U.scoreBadge(e) + '<span class="small muted semibold">' + esc([e.type, e.epsText, e.genres.join(" · ")].filter(Boolean).join(" · ")) + "</span></div>" +
        '<div class="row gap-16" style="margin-top:8px">' +
          '<button type="button" class="btn ' + (e.inList ? "btn-accent" : "btn-primary") + '" data-act="toggle" data-id="' + e.id + '" aria-pressed="' + e.inList + '">' + (e.inList ? "✓ " + D.statuses[e.status].label : "Add to watchlist") + "</button>" +
          '<button type="button" class="btn btn-secondary" id="again">' + icon("shuffle", 20) + "Another suggestion</button>" +
          '<a class="btn btn-ghost" href="' + U.detailsHref(e) + '">View details</a></div></div></div>');
    } else if (ui.pickNone && !ui.finding) {
      U.render(out, '<div class="prompt" role="status" style="background:#FFE9D6;border-color:var(--ink);color:var(--ink)">You’ve seen every match for these genres. Add another genre to widen the pool.</div>');
    } else out.innerHTML = "";
  }

  function renderSigns() {
    U.$("#signs").innerHTML = D.signs.map(function (s) {
      return '<a class="card sign" href="#picker" data-sign="' + esc(s.genre) + '" aria-label="Pick ' + esc(s.genre) + ' for What should I watch next">' +
        '<span class="sign-top"><span class="pill ' + s.pill + '">' + esc(s.word) + "</span></span>" +
        '<span class="sign-body"><span class="icon-tile" style="background:' + s.bg + ";color:" + s.fg + '">' + icon(s.icon, 24) + "</span>" +
        '<span class="stack"><span class="h2">' + esc(s.genre) + '</span><span class="small muted semibold">' + esc(s.desc) + "</span></span></span></a>";
    }).join("");
  }

  function renderPicks() { U.pickRow(U.$("#picks"), U.picks(), "Nekai’s Picks, scroll sideways"); }

  /* ---------- events ---------- */
  U.$("#search-btn").addEventListener("click", doSearch);
  U.$("#q").addEventListener("keydown", function (e) { if (e.key === "Enter") doSearch(); });
  U.$("#q").addEventListener("input", function (e) { if (ui.error && e.target.value.trim().length >= 2) { ui.error = ""; renderSearch(); } });
  U.$("#types").addEventListener("click", function (e) { var b = e.target.closest("[data-type]"); if (b) { ui.types[b.dataset.type] = !ui.types[b.dataset.type]; renderSearch(); } });
  U.$("#genre").addEventListener("change", function (e) { ui.genre = e.target.value; });
  U.$("#results").addEventListener("click", function (e) {
    if (e.target.id === "clear" || e.target.id === "clear2") { ui.submitted = ""; ui.results = []; U.$("#q").value = ""; renderResults(); U.$("#q").focus(); }
  });
  U.$("#genres").addEventListener("click", function (e) { var b = e.target.closest("[data-genre]"); if (b) { ui.sel[b.dataset.genre] = !ui.sel[b.dataset.genre]; ui.pick = null; ui.pickNone = false; renderPicker(); } });
  U.$("#find").addEventListener("click", find);
  U.$("#pick-out").addEventListener("click", function (e) { if (e.target.closest("#again")) find(); });
  U.$("#signs").addEventListener("click", function (e) {
    var a = e.target.closest("[data-sign]"); if (!a) return;
    ui.sel[a.dataset.sign] = true; ui.pick = null; ui.pickNone = false; renderPicker();
  });

  S.subscribe(function () { renderResults(); renderPicker(); renderPicks(); });
  renderSearch(); renderResults(); renderPicker(); renderSigns(); renderPicks();
  if (location.hash === "#q") U.$("#q").focus();
  var t; J.hydrate(D.picks.map(function (p) { return String(p.id); }), function () { clearTimeout(t); t = setTimeout(renderPicks, 250); });
})();
