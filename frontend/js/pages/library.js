/* Library: search, sort and filter your list; update progress, rating and status inline */
(function () {
  "use strict";
  var S = NEKAI.store, U = NEKAI.ui, D = NEKAI.data, esc = U.esc, icon = U.icon;
  if (!S.state.signedIn) { location.replace("signin.html"); return; }

  // Lolli points at the show closest to its finale
  var close = S.ids(function (e) { return e.status === "watching"; }).map(S.entry)
    .filter(function (e) { return e.known && e.episodes - e.watched >= 1; })
    .sort(function (a, b) { return (a.episodes - a.watched) - (b.episodes - b.watched); })[0];
  U.shell({
    page: "library.html",
    lolli: close ? (close.episodes - close.watched === 1 ? close.title + " is one episode from the finale. Want to finish it tonight?"
      : close.title + " has " + (close.episodes - close.watched) + " episodes left. You’re nearly there!") : "Your list is looking tidy. Find something new in Discover."
  });

  var TABS = [["all", "All"], ["watching", "Watching"], ["plan", "Plan to Watch"], ["completed", "Completed"], ["dropped", "Dropped"]];
  var params = new URLSearchParams(location.search);
  var ui = { tab: params.get("tab") || "watching", q: "", sort: "updated", view: S.state.ui.libraryView === "cards" ? "cards" : "list" };
  var EMPTY = {
    dropped: "Shows you stop watching land here. You can pick them back up any time.", plan: "Save shows from Discover to build your queue.",
    completed: "Finish a show and it will appear here, with confetti.", watching: "Start something from your Plan to Watch list.", all: "Your list is empty. Add your first anime from Discover."
  };
  var SORTS = {
    updated: function (a, b) { return b.updatedAt - a.updatedAt; },
    rating: function (a, b) { return b.rating - a.rating || b.updatedAt - a.updatedAt; },
    score: function (a, b) { return (b.score || 0) - (a.score || 0); },
    title: function (a, b) { return a.title.localeCompare(b.title); }
  };

  // Pieces shared by the list row and the card
  function title(e, cls) { return '<h2 class="m-title ' + (cls || "") + '"><a class="title-link" href="' + U.detailsHref(e) + '">' + esc(e.title) + "</a>" + U.seasonBadge(e) + "</h2>"; }
  // Rating: a compact "★ 8.4 ⌄" button; it and its pane come from js/core/panes.js
  function rating(e) { return '<div class="m-rate"><span class="m-rate-label">Your rating</span>' + U.ratingBtn(e) + "</div>"; }
  function status(e) { return '<div class="l-status" data-status="' + e.status + '"><label class="sr" for="st-' + e.id + '">Status for ' + esc(e.title) + "</label>" + U.statusSelect(e, "st-" + e.id) + "</div>"; }
  // "2019 • Action • Adventure • Fantasy" under the title (up to 3 genres)
  // withAiring (list rows, whose tiny thumbnails have no room for the AIRING chip): "1999 • Airing • Action…"
  function sub(e, withAiring) {
    var bits = [e.year].concat((e.genres || []).slice(0, 3)).filter(Boolean).map(esc);
    if (withAiring && e.airing) bits.splice(1, 0, '<span class="air-tag">Airing</span>');
    return bits.length ? '<p class="m-sub">' + bits.join('<span class="m-dot" aria-hidden="true">•</span>') + "</p>" : "";
  }
  function del(e) { return '<button type="button" class="m-del" data-act="remove" data-id="' + e.id + '" aria-label="Remove ' + esc(e.title) + ' from your list" title="Remove from list">' + icon("trash", 18) + "</button>"; }

  // List: [poster] [title, year · genre] [stepper] [rating] [status] [delete]
  function row(e) {
    return '<article class="card-sm list-row list-cols">' + U.art(e, { thumb: true }) +
      '<div class="l-title">' + title(e) + sub(e, true) + "</div>" +
      '<div class="l-controls"><div class="l-eps">' + U.stepper(e) + "</div>" + rating(e) + status(e) + "</div>" +
      '<div class="l-actions">' + del(e) + "</div>" +
      "</article>";
  }
  // Card: poster with the rating button on it and the title on its fade, then year · genres, stepper, status + delete
  function card(e) {
    return '<article class="card-sm anime-card">' +
      '<div class="ac-top has-cap"><a class="ac-media" href="' + U.detailsHref(e) + '" tabindex="-1" aria-hidden="true">' + U.art(e) + "</a>" + U.ratingBtn(e) +
        (e.airing ? '<div class="poster-chips">' + U.airingChip(e) + "</div>" : "") +
        '<div class="card-cap">' + title(e, "ac-title") + "</div></div>" +
      '<div class="ac-body">' +
        '<div class="ac-head card-sub">' + sub(e) + "</div>" +
        '<div class="ac-eps">' + U.stepper(e) + "</div>" +
        '<div class="ac-foot">' + status(e) + del(e) + "</div>" +
      "</div></article>";
  }

  function render() {
    var c = S.counts(), all = S.ids();
    var label = TABS.filter(function (t) { return t[0] === ui.tab; })[0][1];
    // Build the tabs once, then update them in place so the selected color can transition
    var tabs = U.$("#tabs");
    if (!tabs.children.length) U.render(tabs, TABS.map(function (t) {
      return '<button type="button" role="tab" class="chip" data-tab="' + t[0] + '" id="tab-' + t[0] + '" aria-controls="panel">' + t[1] + '<span class="count"></span></button>';
    }).join(""));
    TABS.forEach(function (t) {
      var b = U.$("#tab-" + t[0]), on = t[0] === ui.tab;
      b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1;
      b.querySelector(".count").textContent = t[0] === "all" ? all.length : c[t[0]];
    });
    var q = ui.q.trim().toLowerCase();
    var rows = all.map(S.entry).filter(function (e) {
      return (ui.tab === "all" || e.status === ui.tab) && (!q || (e.title + " " + e.jp).toLowerCase().indexOf(q) >= 0);
    }).sort(SORTS[ui.sort]);
    U.$("#q-count").textContent = q ? rows.length + (rows.length === 1 ? " match" : " matches") + " in " + label : "Showing " + rows.length + " in " + label;
    var panel = U.$("#panel");
    panel.setAttribute("aria-labelledby", "tab-" + ui.tab);
    var cards = ui.view === "cards";
    bar.hidden = !rows.length;
    bar.classList.toggle("is-cards", cards);
    U.$$("[data-view]", U.$("#view-toggle")).forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.view === ui.view); });
    if (rows.length) {
      U.render(panel, cards ? '<div class="card-grid">' + rows.map(card).join("") + "</div>" : rows.map(row).join(""));
    } else {
      U.render(panel, q ? U.emptyState("NO MATCH", "Nothing in " + label + " matches “" + ui.q + "”", "Check the spelling or look in All.", '<button type="button" class="btn btn-secondary" id="clear-q">Clear search</button>', { icon: "search" })
        : U.emptyState("ALL CLEAR", "No anime in " + label + " yet", EMPTY[ui.tab], '<a class="btn btn-secondary" href="discover.html">Browse Discover</a>'));
    }
    if (switched) {
      switched = false;
      panel.classList.remove("tab-enter"); void panel.offsetWidth; // restart the animation on quick repeat clicks
      panel.classList.add("tab-enter");
    }
  }
  var switched = false;
  function switchTab(tab) {
    if (tab === ui.tab) return;
    ui.tab = tab; switched = true; history.replaceState(null, "", "?tab=" + ui.tab); render();
  }

  // List / Cards layout toggle, remembered with the other UI preferences
  var bar = U.$("#list-bar");
  U.$("#view-toggle").innerHTML =
    '<button type="button" class="view-btn" data-view="list" title="List view">' + icon("list", 16, 2.2) + '<span class="sr">List view</span></button>' +
    '<button type="button" class="view-btn" data-view="cards" title="Card view">' + icon("grid", 16, 2.2) + '<span class="sr">Card view</span></button>';
  U.$("#view-toggle").addEventListener("click", function (e) {
    var b = e.target.closest("[data-view]"); if (!b || b.dataset.view === ui.view) return;
    ui.view = b.dataset.view; S.setUi({ libraryView: ui.view }); switched = true; render();
  });
  U.$("#panel").addEventListener("animationend", function (e) { if (e.target === e.currentTarget) e.currentTarget.classList.remove("tab-enter"); });

  U.$("#q").addEventListener("input", function (e) { ui.q = e.target.value; render(); });
  U.$("#sort").addEventListener("change", function (e) { ui.sort = e.target.value; render(); });
  U.$("#tabs").addEventListener("click", function (e) {
    var b = e.target.closest("[data-tab]"); if (!b) return;
    switchTab(b.dataset.tab);
  });
  // Arrow keys move between tabs (WAI-ARIA tabs pattern)
  U.$("#tabs").addEventListener("keydown", function (e) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    var i = TABS.findIndex(function (t) { return t[0] === ui.tab; });
    i = (i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
    switchTab(TABS[i][0]); U.$("#tab-" + ui.tab).focus();
  });
  U.$("#panel").addEventListener("click", function (e) { if (e.target.id === "clear-q") { ui.q = ""; U.$("#q").value = ""; render(); U.$("#q").focus(); } });

  S.subscribe(render);
  render();
  var t; NEKAI.tenrai.hydrate(S.ids(), function () { clearTimeout(t); t = setTimeout(render, 250); });
  // work out which season each show is (for the S2 / S3 badges), a few at a time
  var ts; NEKAI.tenrai.fillSeasons(S.ids(), function () { clearTimeout(ts); ts = setTimeout(render, 300); });
})();
