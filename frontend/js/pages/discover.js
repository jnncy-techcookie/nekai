/* Discover: live Tenrai search, "What should I watch next?" spin wheel, Nekai's Picks, Popular right now */
(function () {
  "use strict";
  var S = NEKAI.store, U = NEKAI.ui, D = NEKAI.data, J = NEKAI.tenrai, esc = U.esc, icon = U.icon;
  if (!S.state.signedIn) { location.replace("signin.html"); return; }

  U.shell({ page: "discover.html", lolli: "Not sure what to watch? Pick a genre or two below and I’ll find something you haven’t seen.", lolliCta: ["#picker", "Try it"] });

  var ui = { types: {}, genres: [], genreList: null, genreFailed: false, genreNote: "", showAll: false, results: [], submitted: "", searching: false, offline: false, error: "", sel: {}, finding: false, pick: null, pickNone: false };

  var searchId = 0, PAGE_SIZE = 24;
  ui.page = 1; ui.hasNext = false; ui.query = ""; ui.resultError = "";

  /* ---------- featured banners: swipe, dots, auto-advance ---------- */
  (function promo() {
    var track = U.$("#promo-track"), dotsEl = U.$("#promo-dots");
    var slides = Array.prototype.slice.call(track.children), n = slides.length;
    var AUTO = 90000; // advance every 90 seconds
    var timer, paused = false;
    dotsEl.innerHTML = slides.map(function (s, i) { return '<button type="button" class="promo-dot" data-i="' + i + '" aria-label="Show banner ' + (i + 1) + " of " + n + '"></button>'; }).join("");
    var dots = Array.prototype.slice.call(dotsEl.children);
    function current() { return Math.round(track.scrollLeft / track.clientWidth) || 0; }
    function sync() { var i = current(); dots.forEach(function (d, k) { d.setAttribute("aria-current", k === i); }); }
    function go(i) { track.scrollTo({ left: ((i + n) % n) * track.clientWidth, behavior: U.reducedMotion() ? "auto" : "smooth" }); arm(); }
    // Restart the countdown after any manual change; skip while hovered, focused or the tab is hidden
    function arm() { clearTimeout(timer); timer = setTimeout(function () { if (!paused && !document.hidden) go(current() + 1); else arm(); }, AUTO); }
    dotsEl.addEventListener("click", function (e) { var d = e.target.closest("[data-i]"); if (d) go(+d.dataset.i); });
    track.addEventListener("scroll", function () { requestAnimationFrame(sync); }, { passive: true });
    track.addEventListener("keydown", function (e) { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); go(current() + (e.key === "ArrowRight" ? 1 : -1)); } });
    var promoEl = track.parentNode;
    promoEl.addEventListener("mouseenter", function () { paused = true; });
    promoEl.addEventListener("mouseleave", function () { paused = false; });
    promoEl.addEventListener("focusin", function () { paused = true; });
    promoEl.addEventListener("focusout", function (e) { if (!promoEl.contains(e.relatedTarget)) paused = false; });
    // Touch and trackpads swipe natively (scroll-snap); a mouse can drag too
    var drag = null;
    track.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      drag = { x: e.clientX, left: track.scrollLeft, from: current() };
      track.classList.add("is-dragging"); track.setPointerCapture(e.pointerId);
    });
    track.addEventListener("pointermove", function (e) { if (drag) track.scrollLeft = drag.left - (e.clientX - drag.x); });
    function endDrag(e) {
      if (!drag) return;
      var dx = e.clientX - drag.x, from = drag.from; drag = null;
      track.classList.remove("is-dragging");
      go(Math.abs(dx) > 60 ? from + (dx < 0 ? 1 : -1) : from);
    }
    track.addEventListener("pointerup", endDrag);
    track.addEventListener("pointercancel", endDrag);
    track.addEventListener("touchend", arm, { passive: true });
    window.addEventListener("resize", function () { track.scrollLeft = current() * track.clientWidth; });
    sync(); arm();
  })();

  /* ---------- search + genre pills ---------- */
  // Genres come from Tenrai: the 8 with the most anime get pills, the full list lives in the More menu
  var TOP_GENRES = 8, MAX_GENRES = 5;
  function byName(a, b) { return a.name.localeCompare(b.name); }
  function genreById(id) { return (ui.genreList || []).filter(function (g) { return g.id === id; })[0]; }
  function genreNames() { return ui.genres.map(function (id) { var g = genreById(id); return g ? g.name : ""; }).filter(Boolean); }
  function topGenres() {
    return (ui.genreList || []).slice().sort(function (a, b) { return b.count - a.count || byName(a, b); }).slice(0, TOP_GENRES).sort(byName);
  }
  function loadGenres() {
    ui.genreFailed = false; renderSearch();
    J.genres().then(function (list) { ui.genreList = list.sort(byName); renderSearch(); })
      .catch(function () { ui.genreFailed = true; renderSearch(); });
  }
  function toggleGenre(id) {
    var i = ui.genres.indexOf(id);
    if (i >= 0) ui.genres.splice(i, 1);
    else if (ui.genres.length >= MAX_GENRES) { ui.genreNote = "You can pick up to " + MAX_GENRES + " genres. Remove one to add another."; renderSearch(); return; }
    else ui.genres.push(id);
    ui.genreNote = ""; ui.error = ""; renderSearch(); doSearch();
  }

  var SKEL = '<div class="cart" aria-hidden="true"><div class="skel" style="aspect-ratio:3/4;background:#26336A"></div><div class="cart-label"><div class="skel" style="height:16px;width:80%"></div><div class="skel" style="height:16px;width:56%"></div><div class="skel" style="height:48px;margin-top:16px"></div></div></div>';

  function typesOn() { return Object.keys(ui.types).filter(function (t) { return ui.types[t]; }); }
  function localSearch(q) {
    q = q.toLowerCase();
    var types = typesOn(), names = genreNames();
    return Object.keys(D.catalog).map(S.anime).filter(function (a) {
      if (q && (a.title + " " + a.jp + " " + a.studio).toLowerCase().indexOf(q) < 0) return false;
      if (types.length && types.indexOf(a.type) < 0) return false;
      if (names.some(function (g) { return a.genres.indexOf(g) < 0; })) return false;
      return true;
    });
  }

  // Search by title, browse a genre, or both. An empty box with a genre browses that genre.
  function doSearch(page) {
    var paging = typeof page === "number";
    var q = paging ? ui.query : U.$("#q").value.trim();
    page = paging ? page : 1;
    var genreLabel = genreNames().join(" + ");
    if (q.length === 1 || (!q && !ui.genres.length)) {
      if (!q && !ui.genres.length) { clearSearch(); }
      else { ui.error = "Type at least 2 characters to search."; renderSearch(); U.$("#q").focus(); }
      return;
    }
    var id = ++searchId;
    ui.error = ""; ui.resultError = ""; ui.searching = true;
    if (!paging) {
      ui.offline = false; ui.page = 1; ui.hasNext = false; ui.results = [];
      ui.query = q;
      ui.submitted = q ? "“" + q + "”" + (genreLabel ? " in " + genreLabel : "") : genreLabel;
    }
    renderSearch(); renderResults();
    function localPage() {
      var list = localSearch(q);
      return { items: list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), hasNext: list.length > page * PAGE_SIZE };
    }
    var request = paging && ui.offline ? Promise.resolve(localPage()) : J.search(q, { type: typesOn(), genres: ui.genres, page: page });
    return request.catch(function () {
      if (id !== searchId) return;
      if (paging) { ui.resultError = "Couldn’t load that page. Please try again."; return; }
      ui.offline = true;
      return localPage();
    }).then(function (result) {
      if (id !== searchId) return;
      if (result) {
        S.cacheMany(result.items);
        ui.results = result.items.map(function (a) { return S.anime(a.id); });
        ui.page = page; ui.hasNext = result.hasNext;
      }
      ui.searching = false; renderSearch(); renderResults();
      if (paging) U.$("#r-h").focus({ preventScroll: true });
    });
  }
  function clearSearch() {
    ++searchId;
    ui.submitted = ""; ui.results = []; ui.genres = []; ui.genreNote = ""; ui.types = {}; U.$("#q").value = "";
    ui.page = 1; ui.hasNext = false; ui.query = ""; ui.searching = false; ui.offline = false; ui.error = ""; ui.resultError = "";
    renderSearch(); renderResults(); U.$("#q").focus();
  }

  function pagination(position) {
    return '<nav class="results-pagination" aria-label="Results pages (' + position + ')">' +
      '<button type="button" class="btn btn-secondary" data-page="' + (ui.page - 1) + '"' + (ui.searching || ui.page <= 1 ? ' disabled' : '') + ' aria-label="Previous page" title="Previous page">' + icon("chevL", 20, 2.6) + '</button>' +
      '<span class="small semibold">Page ' + ui.page + '</span>' +
      '<button type="button" class="btn btn-secondary" data-page="' + (ui.page + 1) + '"' + (ui.searching || !ui.hasNext ? ' disabled' : '') + ' aria-label="Next page" title="Next page">' + icon("chevR", 20, 2.6) + '</button></nav>';
  }

  // Pills and box items share one toggle; stable ids keep keyboard focus through re-renders
  function genreButton(g, cls, prefix) {
    var on = ui.genres.indexOf(g.id) >= 0, full = !on && ui.genres.length >= MAX_GENRES;
    return '<button type="button" id="' + prefix + g.id + '" class="' + cls + (full ? " is-full" : "") + '" data-gid="' + g.id + '" aria-pressed="' + on + '">' +
      (on ? icon("check", 16, 3) : "") + esc(g.name) + "</button>";
  }
  function renderSearch() {
    var q = U.$("#q"), err = U.$("#q-err");
    q.setAttribute("aria-invalid", !!ui.error);
    q.setAttribute("aria-busy", ui.searching);
    err.hidden = !ui.error; err.lastChild.textContent = ui.error;
    U.$("#q-kbd").innerHTML = ui.searching ? '<span class="spinner" aria-hidden="true"></span>' : (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ K" : "Ctrl K");
    var pills = U.$("#genre-pills"), box = U.$("#genre-box"), note = U.$("#genre-note");
    // All Genres opens and closes the box that lists every genre
    var all = '<button type="button" id="g-all" class="gpill" data-gall aria-controls="genre-box" aria-expanded="' + ui.showAll + '"' + (ui.genreList ? "" : " disabled") + ">" +
      icon("grid", 18, 2.2) + "All Genres" + icon("chevD", 16, 2.6) + "</button>";
    if (!ui.genreList) {
      U.render(pills, all + (ui.genreFailed
        ? '<span class="small muted semibold">Couldn’t load genres from Tenrai.</span><button type="button" id="g-retry" class="gpill gpill-more" data-gretry>Try again</button>'
        : '<span class="small muted semibold" role="status">Loading genres…</span>'));
      box.hidden = true; note.hidden = true;
      return;
    }
    var top = topGenres(), topIds = top.map(function (g) { return g.id; });
    // Genres picked in the box also get a pill, so every active filter stays visible
    var extra = ui.genres.filter(function (id) { return topIds.indexOf(id) < 0; }).map(genreById).filter(Boolean).sort(byName);
    U.render(pills, all + top.concat(extra).map(function (g) { return genreButton(g, "gpill", "g-"); }).join(""));
    box.hidden = !ui.showAll;
    if (ui.showAll) U.render(box, '<div class="genre-box-head"><span class="eyebrow">ALL GENRES</span><span class="small muted semibold">' +
      ui.genres.length + " of " + MAX_GENRES + " picked</span></div>" +
      '<div class="genre-box-list">' + ui.genreList.map(function (g) { return genreButton(g, "chip", "gb-"); }).join("") + "</div>");
    note.hidden = !ui.genreNote; note.textContent = ui.genreNote;
  }

  function renderResults() {
    var host = U.$("#results");
    host.hidden = !ui.submitted;
    if (!ui.submitted) return;
    var types = ["TV", "Movie", "OVA", "ONA"].map(function (t) {
      return '<button type="button" class="chip" data-type="' + t + '" aria-pressed="' + !!ui.types[t] + '">' + (ui.types[t] ? icon("check", 16, 3) : "") + t + "</button>";
    }).join("");
    var head = '<div class="sec-head"><h2 id="r-h" class="h2 sec-title" tabindex="-1">Results for “' + esc(ui.submitted) + "”</h2>" +
      '<span class="small muted semibold">' + (ui.searching ? "Searching Tenrai…" : "Showing " + ui.results.length + " anime") + "</span>" +
      '<button type="button" class="btn btn-ghost ml-auto" id="clear">Clear search</button></div>' +
      '<div class="results-toolbar"><div class="row gap-8" role="group" aria-label="Filter by type">' + types + '</div>' + pagination("top") + '</div>';
    var note = ui.offline && !ui.searching ? '<p class="notice" role="status">' + icon("wifiOff", 20) + "<span>Couldn’t reach the Tenrai API, so these results come from NEKAI’s built-in sample list. Check your connection and search again for everything on MyAnimeList.</span></p>" : "";
    var body;
    if (ui.searching) body = '<div class="grid-auto">' + SKEL + SKEL + SKEL + SKEL + "</div>";
    else if (ui.results.length) body = '<div id="r-row"></div>';
    else body = '<div class="card empty"><div class="empty-top"><span class="pill pill-yellow">NO MATCH</span></div><div class="empty-body"><h3 class="h2">Nothing found for ' + esc(ui.submitted) +
      '</h3><p class="body muted" style="max-width:480px">Check the spelling, try the Japanese title, or clear the type and genre filters.</p><button type="button" class="btn btn-secondary" id="clear2">Clear search</button></div></div>';
    if (ui.resultError) note += '<p class="notice" role="alert">' + esc(ui.resultError) + '</p>';
    if (!ui.searching && !ui.results.length && ui.hasNext) body = '<p class="body muted">No matches on this page. Select Next to keep browsing, or change the filters.</p>';
    host.setAttribute("aria-busy", ui.searching);
    U.render(host, head + note + body + pagination("bottom"));
    // Results use the same card as Popular right now, in a grid, without the hover preview
    if (!ui.searching && ui.results.length) U.pickGrid(U.$("#r-row"), ui.results.map(function (a) { a = S.anime(a.id); a.match = S.match(a); return a; }), "Search results", { lite: true, preview: false });
  }

  /* ---------- "What should I watch next?" spin wheel ---------- */
  function selected() { return Object.keys(ui.sel).filter(function (g) { return ui.sel[g]; }); }
  // Unseen titles; with no genres selected, anything goes
  function pool(extra) {
    var sel = selected(), ids = {};
    Object.keys(D.catalog).forEach(function (id) { ids[id] = 1; });
    (extra || []).forEach(function (a) { ids[a.id] = 1; });
    return Object.keys(ids).map(S.entry).filter(function (e) {
      return e && e.status !== "watching" && e.status !== "completed" && e.status !== "dropped" &&
        (!sel.length || e.genres.some(function (g) { return sel.indexOf(g) >= 0; }));
    });
  }

  // The wheel is a long strip of identical mystery cards (assets/images/mystery-anime.png). Each spin snaps back to HOME
  // (invisible, since every card looks the same) and glides forward to a random stop.
  var wheelEl = U.$(".wheel"), track = U.$("#wheel-track"), viewport = track.parentNode;
  var N = 64, HOME = 10;
  var W = { pos: HOME, spinning: false, picked: null };
  track.innerHTML = new Array(N + 1).join('<div class="wcard"><div class="wc-inner"><div class="wc-face wc-back"></div><div class="wc-face wc-front"></div></div></div>');
  var cards = Array.prototype.slice.call(track.children);

  // Cards shrink, fade and turn away with distance from the pointer; blur while moving fast
  function layoutWheel(pos, speed) {
    var c = cards[0], gap = parseFloat(getComputedStyle(track).columnGap) || 16;
    var w = c.offsetWidth, step = w + gap, vw = viewport.clientWidth;
    track.style.transform = "translate3d(" + (vw / 2 - (pos * step + w / 2)).toFixed(1) + "px,0,0)";
    var reach = Math.ceil(vw / 2 / step) + 2;
    for (var i = Math.max(0, Math.floor(pos) - reach); i <= Math.min(N - 1, Math.ceil(pos) + reach); i++) {
      var d = i - pos, ad = Math.abs(d), el = cards[i];
      el.style.transform = "perspective(800px) rotateY(" + Math.max(-35, Math.min(35, -d * 8)).toFixed(1) + "deg) scale(" + Math.max(0.6, 1 - ad * 0.09).toFixed(3) + ")";
      el.style.opacity = Math.max(0.1, 1 - ad * 0.15).toFixed(2);
      el.style.filter = speed > 0.04 && ad > 0.45 ? "blur(" + Math.min(3, speed * 16).toFixed(1) + "px)" : "";
      el.classList.toggle("is-center", ad < 0.5);
    }
  }
  function resetFace() {
    if (!W.picked) return;
    W.picked.classList.remove("is-flipped", "is-picked");
    W.picked.querySelector(".wc-front").innerHTML = "";
    W.picked = null;
  }
  function spin() {
    return new Promise(function (done) {
      resetFace(); W.spinning = true; wheelEl.classList.add("is-spinning");
      layoutWheel(HOME, 0);
      var from = HOME, target = HOME + 26 + Math.floor(Math.random() * 10);
      var finish = function () { W.pos = target; layoutWheel(target, 0); W.spinning = false; wheelEl.classList.remove("is-spinning"); done(cards[target]); };
      if (U.reducedMotion()) return finish();
      var t0 = performance.now(), dur = 3600, last = from, lastTick = from;
      requestAnimationFrame(function frame(now) {
        var t = Math.min(1, (now - t0) / dur), p = from + (target - from) * (1 - Math.pow(1 - t, 4)); // ease-out quart
        layoutWheel(p, p - last);
        if (Math.round(p) !== lastTick) { lastTick = Math.round(p); U.sound("tick"); }
        last = p; W.pos = p;
        if (t < 1) requestAnimationFrame(frame); else finish();
      });
    });
  }
  function reveal(card, e) {
    card.querySelector(".wc-front").innerHTML = U.art(e);
    card.classList.add("is-flipped", "is-picked");
    W.picked = card;
    U.sound("done");
  }
  window.addEventListener("resize", function () { if (!W.spinning) layoutWheel(W.pos, 0); });

  function find() {
    if (ui.finding) return;
    var sel = selected();
    ui.finding = true; ui.pick = null; ui.pickNone = false; renderPicker();
    var live = sel.length ? J.byGenres(sel).then(function (list) { S.cacheMany(list); return list; }).catch(function () { return []; }) : Promise.resolve([]);
    // The wheel stops on its own schedule; if Tenrai is slow, the center card waits face-down
    Promise.all([live, spin()]).then(function (r) {
      var p = pool(r[0]), others = p.filter(function (e) { return e.id !== ui.lastPick; }), list = others.length ? others : p;
      ui.finding = false;
      if (list.length) { var e = list[Math.floor(Math.random() * list.length)]; ui.pick = ui.lastPick = e.id; reveal(r[1], S.entry(e.id)); }
      else ui.pickNone = true;
      renderPicker();
    });
  }
  function renderPicker() {
    var sel = selected();
    U.render(U.$("#genres"), D.pickerGenres.map(function (g) {
      return '<button type="button" class="chip" data-genre="' + esc(g) + '" aria-pressed="' + !!ui.sel[g] + '">' + (ui.sel[g] ? icon("check", 16, 3) : "") + esc(g) + "</button>";
    }).join(""));
    var b = U.$("#find");
    b.disabled = ui.finding; b.setAttribute("aria-busy", ui.finding);
    b.innerHTML = ui.finding ? '<span class="spinner" aria-hidden="true"></span>Spinning…' : icon("play", 18) + (ui.pick ? "Spin again" : "Spin for an anime");
    U.$("#find-help").textContent = (sel.length ? sel.join(", ") : "Any genre") + " · " + pool().length + "+ titles in the pool";
    var out = U.$("#pick-out");
    if (ui.pick && !ui.finding) {
      var e = S.entry(ui.pick);
      U.render(out, '<div class="wheel-result"><span class="eyebrow">YOUR PICK</span>' +
        '<h3 class="h2">' + esc(e.title) + "</h3>" +
        '<div class="row gap-16" style="justify-content:center">' + U.scoreBadge(e) + '<span class="small muted semibold">' + esc([e.type, e.epsText, e.genres.join(" · ")].filter(Boolean).join(" · ")) + "</span></div>" +
        '<div class="row gap-16" style="justify-content:center;margin-top:8px">' +
          '<button type="button" class="btn ' + (e.inList ? "btn-accent" : "btn-primary btn-add") + '" data-act="toggle" data-id="' + e.id + '" aria-pressed="' + e.inList + '">' + (e.inList ? "✓ " + D.statuses[e.status].label : "Add to Library") + "</button>" +
          '<a class="btn btn-secondary" href="' + U.detailsHref(e) + '">View details</a></div></div>');
    } else if (ui.pickNone && !ui.finding) {
      U.render(out, '<div class="prompt" role="status" style="background:#FFE9D6;border-color:var(--ink);color:var(--ink)">You’ve seen every match for these genres. Add another genre to widen the pool.</div>');
    } else out.innerHTML = "";
  }
  function changeGenres() { if (!ui.finding) { ui.pick = null; ui.pickNone = false; resetFace(); } renderPicker(); }

  // Popular: Tenrai's top airing list. Until it arrives (or if it can't), the best-scored sample titles.
  function renderPopular() {
    U.$("#pop-sub").textContent = ui.popular || !ui.popFailed ? "The top-rated shows airing now on MyAnimeList." : "MyAnimeList is busy right now, so here are the top-rated titles in NEKAI’s catalog.";
    var list = ui.popular || Object.keys(D.catalog).map(S.anime).sort(function (a, b) { return (b.score || 0) - (a.score || 0); }).slice(0, 12);
    // "Not interested" (same as Nekai's Picks) hides a title here and from future picks
    list = list.filter(function (a) { return !S.state.hidden[String(a.id)]; });
    U.pickRow(U.$("#popular"), list.map(function (a) { a = S.anime(a.id); a.match = S.match(a); return a; }), "Popular right now, scroll sideways", { lite: true, wide: true, dismiss: true });
  }
  // If Tenrai is busy, say so rather than calling the sample titles "airing now", and try once more later
  function loadPopular(retry) {
    J.popular().then(function (list) { S.cacheMany(list); ui.popular = list; renderPopular(); })
      .catch(function () { ui.popFailed = true; renderPopular(); if (retry) setTimeout(function () { loadPopular(false); }, 30000); });
  }
  loadPopular(true);

  /* ---------- Nekai's Picks: AI picks (services/recommend.js), curated picks until they arrive or if they fail ---------- */
  var R = NEKAI.recommend;
  function ago(t) {
    var m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? "just now" : m < 60 ? m + " min ago" : Math.round(m / 60) + " h ago";
  }
  function renderPicks() {
    var picks = U.picks(), busy = R.busy();
    if (picks.length) U.pickRow(U.$("#picks"), picks, "Nekai’s Picks, scroll sideways", { lite: true, wide: true, dismiss: true });
    else U.render(U.$("#picks"), '<p class="body muted">' + (busy ? "" : "You’ve added or hidden every pick. Select New picks for a fresh set.") + "</p>");
    var ai = U.aiPicks(), msg = "";
    if (busy) msg = '<span class="spinner" aria-hidden="true"></span><span>' + (ai ? "Updating your picks from your latest list…" : "The AI is reading your history and picking titles. This takes about 15 seconds; curated picks until then.") + "</span>";
    else if (ui.recError) msg = "<span>" + esc(ui.recError) + (ai ? " Showing your last AI picks." : " Showing NEKAI’s curated picks instead.") + "</span>";
    else if (ai) msg = icon("spark", 16) + "<span>AI picks from your history, updated " + ago(S.state.recs.at) + "</span>";
    var st = U.$("#picks-status");
    st.innerHTML = msg;
    st.style.display = msg ? "" : "none"; // .row's display:flex would beat the hidden attribute
    var b = U.$("#picks-new");
    b.disabled = busy;
    b.textContent = busy ? "Picking…" : "New picks";
  }
  function loadPicks(force) {
    ui.recError = "";
    var p = R.load(force);
    renderPicks();
    p.catch(function (err) {
      ui.recError = err.message;
      // The curated picks are staying, so fetch their real posters
      J.hydrate(D.picks.map(function (x) { return String(x.id); }), function () { clearTimeout(t); t = setTimeout(renderPicks, 250); });
    }).then(renderPicks);
  }
  var t;

  /* ---------- events ---------- */
  U.$(".disc-search-icon").innerHTML = icon("search", 20);
  U.$("#q").addEventListener("keydown", function (e) { if (e.key === "Enter") doSearch(); });
  U.$("#q").addEventListener("input", function (e) { if (ui.error && e.target.value.trim().length !== 1) { ui.error = ""; renderSearch(); } });
  // The native clear (×) in the search box: fall back to the genre, or close the results
  U.$("#q").addEventListener("search", function (e) { if (!e.target.value && ui.submitted) doSearch(); });
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); U.$("#q").focus(); U.$("#q").select(); }
  });
  function genreClick(e) {
    var b = e.target.closest("[data-gid],[data-gall],[data-gretry]"); if (!b) return;
    if (b.hasAttribute("data-gretry")) { loadGenres(); return; }
    if (b.hasAttribute("data-gall")) { ui.showAll = !ui.showAll; renderSearch(); return; }
    toggleGenre(Number(b.dataset.gid));
  }
  U.$("#genre-pills").addEventListener("click", genreClick);
  U.$("#genre-box").addEventListener("click", genreClick);
  // Close the box on Escape or a click outside it
  function closeBox(refocus) { if (!ui.showAll) return; ui.showAll = false; renderSearch(); if (refocus) U.$("#g-all").focus(); }
  // A toggled genre re-renders before this runs, so a detached target still counts as inside the box
  document.addEventListener("click", function (e) { if (e.target.isConnected && !e.target.closest("#genre-box,#g-all")) closeBox(false); });
  U.$(".genre-filter").addEventListener("keydown", function (e) { if (e.key === "Escape" && ui.showAll) { e.stopPropagation(); closeBox(true); } });
  U.$("#results").addEventListener("click", function (e) {
    var pageButton = e.target.closest("[data-page]");
    if (pageButton) {
      var page = Number(pageButton.dataset.page);
      if (!pageButton.disabled && !ui.searching && page >= 1 && (page < ui.page || ui.hasNext)) {
        doSearch(page);
        U.$("#results").scrollIntoView({ behavior: U.reducedMotion() ? "auto" : "smooth", block: "start" });
      }
      return;
    }
    var t = e.target.closest("[data-type]");
    if (t) { ui.types[t.dataset.type] = !ui.types[t.dataset.type]; doSearch(); return; }
    if (e.target.id === "clear" || e.target.id === "clear2") clearSearch();
  });
  U.$("#genres").addEventListener("click", function (e) { var b = e.target.closest("[data-genre]"); if (b) { ui.sel[b.dataset.genre] = !ui.sel[b.dataset.genre]; changeGenres(); } });
  U.$("#find").addEventListener("click", find);

  S.subscribe(function () { renderResults(); renderPicker(); renderPicks(); renderPopular(); });
  renderSearch(); loadGenres(); renderResults(); renderPicker(); renderPopular(); renderPicks(); layoutWheel(HOME, 0);
  if (location.hash === "#q") U.$("#q").focus();
  U.$("#picks-new").addEventListener("click", function () { loadPicks(true); });
  // Only asks the AI when the list, a status, a rating or "Not interested" changed since the last picks
  loadPicks(false);
})();
