/* Library: search, sort and filter your list; update progress, rating and status inline */
(function () {
  "use strict";
  var S = NEKAI.store, U = NEKAI.ui, D = NEKAI.data, esc = U.esc, icon = U.icon;
  if (!S.state.signedIn) { location.replace("signin.html"); return; }

  // Neko points at the show closest to its finale
  var close = S.ids(function (e) { return e.status === "watching"; }).map(S.entry)
    .filter(function (e) { return e.known && e.episodes - e.watched >= 1; })
    .sort(function (a, b) { return (a.episodes - a.watched) - (b.episodes - b.watched); })[0];
  U.shell({
    page: "library.html",
    neko: close ? (close.episodes - close.watched === 1 ? close.title + " is one episode from the finale. Want to finish it tonight?"
      : close.title + " has " + (close.episodes - close.watched) + " episodes left. You’re nearly there!") : "Your list is looking tidy. Find something new in Discover."
  });

  var TABS = [["all", "All"], ["watching", "Watching"], ["plan", "Plan to Watch"], ["completed", "Completed"], ["dropped", "Dropped"]];
  var params = new URLSearchParams(location.search);
  var ui = { tab: params.get("tab") || "watching", q: "", sort: "updated", view: S.state.ui.libraryView === "cards" ? "cards" : "list" };
  var EMPTY = {
    dropped: "Shows you stop watching land here. You can pick them back up any time.", plan: "Save shows from Discover to build your queue.",
    completed: "Finish a show and it will appear here, with confetti.", watching: "Start something from your Plan to Watch list.", all: "Your list is empty. Add your first anime from Discover."
  };
  // The Sort menu's orders; ties on rating fall back to the most recently updated
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
  // Remove button (asks first, through data-act="remove")
  function del(e) { return '<button type="button" class="m-del" data-act="remove" data-id="' + e.id + '" aria-label="Remove ' + esc(e.title) + ' from your list" title="Remove from list">' + icon("trash", 18) + "</button>"; }

  // Multi-select checkbox: shows on hover (desktop) and on every item while selecting
  function check(e) {
    return '<button type="button" class="sel-check" role="checkbox" aria-checked="false" data-sel="' + e.id + '" aria-label="Select ' + esc(e.title) + '">' + icon("check", 14, 3.2) + "</button>";
  }

  // List: [poster] [title, year · genre] [stepper] [rating] [status] [delete]
  function row(e) {
    return '<article class="card-sm list-row list-cols" data-item="' + e.id + '"><div class="l-art">' + U.art(e, { thumb: true }) + check(e) + "</div>" +
      '<div class="l-title">' + title(e) + sub(e, true) + "</div>" +
      '<div class="l-controls"><div class="l-eps">' + U.stepper(e) + "</div>" + rating(e) + status(e) + "</div>" +
      '<div class="l-actions">' + del(e) + "</div>" +
      "</article>";
  }
  // Card: poster with the rating button on it and the title on its fade, then year · genres, stepper, status + delete
  function card(e) {
    return '<article class="card-sm anime-card" data-item="' + e.id + '">' +
      '<div class="ac-top has-cap"><a class="ac-media" href="' + U.detailsHref(e) + '" tabindex="-1" aria-hidden="true">' + U.art(e) + "</a>" + check(e) + U.ratingBtn(e) +
        (e.airing ? '<div class="poster-chips">' + U.airingChip(e) + "</div>" : "") +
        '<div class="card-cap">' + title(e, "ac-title") + "</div></div>" +
      '<div class="ac-body">' +
        '<div class="ac-head card-sub">' + sub(e) + "</div>" +
        '<div class="ac-eps">' + U.stepper(e) + "</div>" +
        '<div class="ac-foot">' + status(e) + del(e) + "</div>" +
      "</div></article>";
  }

  // Draws the tabs (with counts), the result count, and the rows or cards for the current tab, search and sort
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
    // Selection follows what's on screen: anime that left this view (moved, removed, filtered out) drop out of it
    visible = rows.map(function (e) { return String(e.id); });
    sel.ids.forEach(function (id) { if (visible.indexOf(id) === -1) sel.ids.delete(id); });
    if (sel.on && !visible.length) sel.on = false;
    paintSel();
  }
  // Set by a tab or view change so render() replays the panel's enter animation
  var switched = false;
  // Changes tab and keeps it in the URL (?tab=…), so reloads and links land on it
  function switchTab(tab) {
    if (tab === ui.tab) return;
    clearSel(); // a selection belongs to one tab: don't carry hidden picks to the next
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

  /* ---------- multi-select ----------
     Ways in: the checkbox that shows when you hover an item (and on every item once selecting),
     the Select button, Ctrl/Cmd+click (add one), Shift+click (a range), Ctrl/Cmd+A (everything
     in view) and, on touch screens, a long press. While selecting, clicking an item ticks it
     instead of opening it; Esc, Cancel or the bar's ✕ stops. The bar at the bottom moves the
     selected anime to another list or removes them, as one change with one Undo. */
  var sel = { on: false, ids: new Set(), anchor: null };
  var visible = []; // ids on screen, in order (set by render)
  var menuOpen = false; // the bar's "Move to" menu
  var panelEl = U.$("#panel"), bulk = U.$("#bulk-bar"), selBtn = U.$("#select-toggle");
  var MOVE = ["watching", "plan", "completed", "dropped"];

  function clearSel() { sel.on = false; sel.ids.clear(); sel.anchor = null; menuOpen = false; }
  function endSel() { clearSel(); paintSel(); }
  function toggleOne(id) {
    sel.on = true;
    if (sel.ids.has(id)) sel.ids.delete(id); else sel.ids.add(id);
    sel.anchor = id;
    paintSel();
  }
  // Shift+click: everything between the last clicked item and this one, in on-screen order
  function selectRange(id) {
    var a = visible.indexOf(sel.anchor), b = visible.indexOf(id);
    if (a === -1 || b === -1) return toggleOne(id);
    for (var i = Math.min(a, b); i <= Math.max(a, b); i++) sel.ids.add(visible[i]);
    sel.on = true; sel.anchor = id;
    paintSel();
  }
  function selectAll() { visible.forEach(function (id) { sel.ids.add(id); }); sel.on = true; paintSel(); }
  function plural(n) { return n === 1 ? "1 anime" : n + " anime"; }

  // Updates the checkboxes, the Select button and the bar in place (the list itself isn't rebuilt)
  function paintSel() {
    var n = sel.ids.size;
    panelEl.classList.toggle("is-selecting", sel.on);
    document.documentElement.classList.toggle("lib-selecting", sel.on); // Neko's button steps aside for the bar
    U.$$("[data-item]", panelEl).forEach(function (el) {
      var on = sel.ids.has(el.dataset.item);
      el.classList.toggle("is-selected", on);
      var c = el.querySelector(".sel-check");
      if (c) c.setAttribute("aria-checked", on);
    });
    selBtn.hidden = !visible.length;
    selBtn.setAttribute("aria-pressed", sel.on);
    selBtn.innerHTML = sel.on ? icon("x", 15, 2.6) + "<span>Cancel</span>" : icon("check", 15, 2.8) + "<span>Select</span>";
    if (!sel.on) { bulk.classList.remove("is-open"); bulk.hidden = true; bulk.innerHTML = ""; return; }
    // keep keyboard focus on the same bar control across the rebuild
    var focused = bulk.contains(document.activeElement) ? document.activeElement.dataset.bulk : null;
    var here = ui.tab === "all" ? null : ui.tab; // no point moving to the list you're looking at
    var off = n ? "" : " disabled";
    bulk.innerHTML =
      '<span class="bb-count" aria-live="polite">' + (n ? plural(n) + " selected" : "Select anime to move or remove") + "</span>" +
      '<div class="bb-actions">' +
        '<div class="bb-move">' +
          '<button type="button" class="bb-btn bb-primary" data-bulk="menu" aria-haspopup="menu" aria-expanded="' + (menuOpen && !!n) + '"' + off + "><span>Move to</span>" + icon("chevD", 16, 2.6) + "</button>" +
          (menuOpen && n ? '<div class="bb-menu" role="menu" aria-label="Move selected anime to">' + MOVE.filter(function (k) { return k !== here; }).map(function (k) {
            return '<button type="button" role="menuitem" data-bulk="move" data-to="' + k + '"><i class="bb-dot st-' + k + '" aria-hidden="true"></i>' + esc(D.statuses[k].label) + "</button>";
          }).join("") + "</div>" : "") +
        "</div>" +
        '<button type="button" class="bb-btn" data-bulk="remove"' + off + ">" + icon("trash", 16, 2.4) + "<span>Remove</span></button>" +
        '<button type="button" class="bb-btn bb-ghost" data-bulk="all">' + (n && n === visible.length ? "Clear all" : "Select all") + "</button>" +
        '<button type="button" class="bb-btn bb-ghost bb-x" data-bulk="close" aria-label="Stop selecting" title="Stop selecting (Esc)">' + icon("x", 18, 2.4) + "</button>" +
      "</div>";
    bulk.hidden = false;
    requestAnimationFrame(function () { bulk.classList.add("is-open"); });
    if (focused) { var f = bulk.querySelector('[data-bulk="' + focused + '"]:not(:disabled)'); if (f) f.focus(); }
  }

  // Item clicks: the checkbox, Ctrl/Cmd+click and Shift+click always select; while selecting,
  // any click on an item ticks it. Runs before the links, steppers and menus inside the item.
  // The item just long-pressed: the click that ends that press (if the phone sends one) is swallowed,
  // so it doesn't untick the item straight away. Clicks on other items are never affected.
  var longPressed = null; // { id, until }
  panelEl.addEventListener("click", function (e) {
    var item = e.target.closest("[data-item]");
    if (!item) return;
    if (longPressed && longPressed.id === item.dataset.item && Date.now() < longPressed.until) {
      longPressed = null; e.preventDefault(); e.stopPropagation(); return;
    }
    var box = e.target.closest(".sel-check"), mod = e.ctrlKey || e.metaKey;
    if (!box && !mod && !e.shiftKey && !sel.on) return; // a normal click: everything works as usual
    e.preventDefault(); e.stopPropagation();
    if (e.shiftKey && sel.anchor != null) selectRange(item.dataset.item);
    else toggleOne(item.dataset.item);
  }, true);
  // Shift+click would also highlight text between the clicks
  panelEl.addEventListener("mousedown", function (e) {
    if (e.shiftKey && e.target.closest("[data-item]")) e.preventDefault();
  });

  // Touch: hold an item for half a second to start selecting (like the phone apps)
  var press = null;
  panelEl.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "mouse") return;
    var item = e.target.closest("[data-item]");
    if (!item || e.target.closest(".sel-check")) return;
    press = { x: e.clientX, y: e.clientY, t: setTimeout(function () {
      press = null;
      longPressed = { id: item.dataset.item, until: Date.now() + 1500 };
      if (!sel.ids.has(item.dataset.item)) toggleOne(item.dataset.item);
      try { if (navigator.vibrate) navigator.vibrate(12); } catch (err) { /* not supported */ }
    }, 500) };
  });
  function cancelPress(e) {
    if (!press) return;
    if (e.type === "pointermove" && Math.abs(e.clientX - press.x) < 10 && Math.abs(e.clientY - press.y) < 10) return;
    clearTimeout(press.t); press = null;
  }
  ["pointermove", "pointerup", "pointercancel"].forEach(function (t) { panelEl.addEventListener(t, cancelPress); });
  // no "open link / copy" menu on a long press
  panelEl.addEventListener("contextmenu", function (e) {
    if ((longPressed || sel.on) && e.target.closest("[data-item]")) e.preventDefault();
  });

  selBtn.addEventListener("click", function () {
    if (sel.on) endSel();
    else if (visible.length) { sel.on = true; paintSel(); }
  });

  // The bar's buttons
  bulk.addEventListener("click", function (e) {
    var b = e.target.closest("[data-bulk]");
    if (!b || b.disabled) return;
    var act = b.dataset.bulk, ids = Array.from(sel.ids);
    if (act === "menu") {
      menuOpen = !menuOpen; paintSel();
      if (menuOpen) { var first = bulk.querySelector('[role="menuitem"]'); if (first) first.focus(); }
    } else if (act === "all") {
      if (sel.ids.size === visible.length) sel.ids.clear(); else selectAll();
      paintSel();
    } else if (act === "close") {
      endSel(); selBtn.focus();
    } else if (act === "move") {
      var to = b.dataset.to, label = D.statuses[to].label;
      var r = S.setStatusMany(ids, to);
      endSel();
      if (r.firstCompletion) { U.confetti(); U.sound("done"); }
      U.toast(r.moved ? "Moved " + plural(r.moved) + " to " + label : "Already in " + label, r.moved ? r.undo : null);
    } else if (act === "remove") {
      U.confirm({
        title: "Remove " + plural(ids.length) + " from your Library?",
        body: "Their progress, ratings and reviews will be removed too.",
        confirm: "Remove", danger: true, icon: "trash"
      }).then(function (ok) {
        if (!ok) return;
        var undo = S.removeMany(ids);
        endSel();
        U.toast(plural(ids.length) + " removed from your list", undo);
      });
    }
  });
  // The "Move to" menu closes on a click anywhere else
  document.addEventListener("click", function (e) {
    if (menuOpen && !e.target.closest(".bb-move")) { menuOpen = false; paintSel(); }
  });
  // Esc closes the menu, then stops selecting; Ctrl/Cmd+A selects everything in view
  document.addEventListener("keydown", function (e) {
    if (document.querySelector("dialog[open]")) return; // the confirm dialog handles its own keys
    if (e.key === "Escape") {
      if (menuOpen) { menuOpen = false; paintSel(); var m = bulk.querySelector('[data-bulk="menu"]'); if (m) m.focus(); e.preventDefault(); }
      else if (sel.on) { endSel(); e.preventDefault(); }
      return;
    }
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "a" || e.key === "A") && !typing && visible.length) {
      e.preventDefault(); selectAll();
    }
  });

  S.subscribe(render);
  render();
  var t; NEKAI.tenrai.hydrate(S.ids(), function () { clearTimeout(t); t = setTimeout(render, 250); });
  // work out which season each show is (for the S2 / S3 badges), a few at a time
  var ts; NEKAI.tenrai.fillSeasons(S.ids(), function () { clearTimeout(ts); ts = setTimeout(render, 300); });
})();
