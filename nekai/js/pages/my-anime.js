/* My Anime: search, sort and filter your list; update progress, rating and status inline */
(function () {
  "use strict";
  var S = NEKAI.store, U = NEKAI.ui, D = NEKAI.data, esc = U.esc, icon = U.icon;
  if (!S.state.signedIn) { location.replace("signin.html"); return; }

  // Lolli points at the show closest to its finale
  var close = S.ids(function (e) { return e.status === "watching"; }).map(S.entry)
    .filter(function (e) { return e.known && e.episodes - e.watched >= 1; })
    .sort(function (a, b) { return (a.episodes - a.watched) - (b.episodes - b.watched); })[0];
  U.shell({
    page: "my-anime.html",
    lolli: close ? (close.episodes - close.watched === 1 ? close.title + " is one episode from the finale. Want to finish it tonight?"
      : close.title + " has " + (close.episodes - close.watched) + " episodes left. You’re nearly there!") : "Your list is looking tidy. Find something new in Discover."
  });

  var TABS = [["all", "All"], ["watching", "Watching"], ["plan", "Plan to Watch"], ["completed", "Completed"], ["dropped", "Dropped"]];
  var params = new URLSearchParams(location.search);
  var ui = { tab: params.get("tab") || "watching", q: "", sort: "updated" };
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

  function row(e) {
    return '<article class="card-sm list-row list-cols">' + U.art(e, { thumb: true }) +
      '<div class="l-title stack gap-8" style="min-width:0"><h2 class="h3" style="overflow-wrap:anywhere"><a class="title-link" href="' + U.detailsHref(e) + '">' + esc(e.title) + "</a></h2>" +
        '<p class="caption muted semibold">' + esc([e.type, e.epsText, e.studio, "★ " + e.scoreText].filter(Boolean).join(" · ")) + "</p></div>" +
      '<div class="l-eps stack gap-8">' + U.stepper(e) +
        (e.known ? '<div class="progress" role="progressbar" aria-label="' + esc(e.title) + " progress, " + e.pct + '%" aria-valuemin="0" aria-valuemax="' + e.episodes + '" aria-valuenow="' + e.watched + '"><span style="width:' + e.pct + '%"></span></div>'
          : '<span class="caption muted">Total episodes unknown</span>') +
        (e.askComplete ? '<button type="button" class="btn btn-accent" data-act="complete" data-id="' + e.id + '" style="width:176px;padding:0 16px">Mark completed</button>' : "") +
      "</div>" +
      U.stars(e) +
      '<div class="l-status"><label class="sr" for="st-' + e.id + '">Status for ' + esc(e.title) + "</label>" + U.statusSelect(e, "st-" + e.id) + "</div>" +
      '<button type="button" class="btn btn-ghost btn-icon l-del" data-act="remove" data-id="' + e.id + '" aria-label="Remove ' + esc(e.title) + ' from your list" title="Remove from list">' + icon("trash", 20) + "</button>" +
      "</article>";
  }

  function render() {
    var c = S.counts(), all = S.ids();
    var label = TABS.filter(function (t) { return t[0] === ui.tab; })[0][1];
    U.$("#total").textContent = all.length + " anime across your lists. Update progress, ratings and status right here.";
    U.render(U.$("#tabs"), TABS.map(function (t) {
      return '<button type="button" role="tab" class="chip" data-tab="' + t[0] + '" id="tab-' + t[0] + '" aria-selected="' + (t[0] === ui.tab) + '" tabindex="' + (t[0] === ui.tab ? 0 : -1) + '" aria-controls="panel">' + t[1] +
        '<span class="count">' + (t[0] === "all" ? all.length : c[t[0]]) + "</span></button>";
    }).join(""));
    var q = ui.q.trim().toLowerCase();
    var rows = all.map(S.entry).filter(function (e) {
      return (ui.tab === "all" || e.status === ui.tab) && (!q || (e.title + " " + e.jp).toLowerCase().indexOf(q) >= 0);
    }).sort(SORTS[ui.sort]);
    U.$("#q-count").textContent = q ? rows.length + (rows.length === 1 ? " match" : " matches") + " in " + label : "Showing " + rows.length + " in " + label;
    var panel = U.$("#panel");
    panel.setAttribute("aria-labelledby", "tab-" + ui.tab);
    if (rows.length) {
      U.render(panel, '<div class="list-head list-cols table-head" aria-hidden="true"><span></span><span>TITLE</span><span>EPISODES</span><span>YOUR RATING</span><span>STATUS</span><span></span></div>' + rows.map(row).join(""));
    } else {
      U.render(panel, q ? U.emptyState("NO MATCH", "Nothing in " + label + " matches “" + ui.q + "”", "Check the spelling or look in All.", '<button type="button" class="btn btn-secondary" id="clear-q">Clear search</button>')
        : U.emptyState("ALL CLEAR", "No anime in " + label + " yet", EMPTY[ui.tab], '<a class="btn btn-secondary" href="discover.html">Browse Discover</a>'));
    }
  }

  U.$("#q").addEventListener("input", function (e) { ui.q = e.target.value; render(); });
  U.$("#sort").addEventListener("change", function (e) { ui.sort = e.target.value; render(); });
  U.$("#tabs").addEventListener("click", function (e) {
    var b = e.target.closest("[data-tab]"); if (!b) return;
    ui.tab = b.dataset.tab; history.replaceState(null, "", "?tab=" + ui.tab); render();
  });
  // Arrow keys move between tabs (WAI-ARIA tabs pattern)
  U.$("#tabs").addEventListener("keydown", function (e) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    var i = TABS.findIndex(function (t) { return t[0] === ui.tab; });
    i = (i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
    ui.tab = TABS[i][0]; render(); U.$("#tab-" + ui.tab).focus();
  });
  U.$("#panel").addEventListener("click", function (e) { if (e.target.id === "clear-q") { ui.q = ""; U.$("#q").value = ""; render(); U.$("#q").focus(); } });

  S.subscribe(render);
  render();
  var t; NEKAI.jikan.hydrate(S.ids(), function () { clearTimeout(t); t = setTimeout(render, 250); });
})();
