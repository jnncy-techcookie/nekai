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
  var ui = { tab: params.get("tab") || "watching", q: "", sort: "updated", view: S.state.ui.myAnimeView === "cards" ? "cards" : "list" };
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
  function title(e, cls) { return '<h2 class="m-title ' + (cls || "") + '"><a class="title-link" href="' + U.detailsHref(e) + '">' + esc(e.title) + "</a></h2>"; }
  // The stepper shows "11 / 12" (or "EP Unknown"), so only the Mark completed button lives here
  function progress(e) {
    return (e.askComplete ? '<button type="button" class="btn btn-accent l-complete" data-act="complete" data-id="' + e.id + '">Mark completed</button>' : "");
  }
  // Rating: a compact "★ 8.4 ⌄" button; the pane (below) lets you drag across the stars or type 1–10
  function fmtRating(n) { return (Math.round(n * 10) / 10).toFixed(1); }
  function rating(e) { return '<div class="m-rate"><span class="m-rate-label">Your rating</span>' + ratingBtn(e) + "</div>"; }
  function ratingBtn(e) {
    return '<button type="button" class="rp-btn" data-rate-open="' + e.id + '" aria-haspopup="dialog" aria-expanded="false" aria-label="Your rating for ' + esc(e.title) + ": " + (e.rating ? fmtRating(e.rating) + " out of 10" : "not rated") + '. Change rating">' +
        U.star(16, e.rating ? "#F25C05" : "#E6DCC7") + (e.rating ? "<span>" + fmtRating(e.rating) + "</span>" : '<span class="rp-none">Rate</span>') + icon("chevD", 16, 2.6) + "</button>";
  }
  function status(e) { return '<div class="l-status" data-status="' + e.status + '"><label class="sr" for="st-' + e.id + '">Status for ' + esc(e.title) + "</label>" + U.statusSelect(e, "st-" + e.id) + "</div>"; }
  // "2019 • Action" under the title
  function sub(e) {
    var bits = [e.year, e.mainGenre].filter(Boolean).map(esc);
    return bits.length ? '<p class="m-sub">' + bits.join('<span class="m-dot" aria-hidden="true">•</span>') + "</p>" : "";
  }
  // Review note: opens the note pane (below); filled when a review exists
  function noteBtn(e) {
    var label = (e.note ? "Edit your review of " : "Write a review of ") + e.title;
    return '<button type="button" class="m-note' + (e.note ? " has-note" : "") + '" data-note-open="' + e.id + '" aria-haspopup="dialog" aria-expanded="false" aria-label="' + esc(label) + '" title="' + (e.note ? "Edit your review" : "Write a review") + '">' + icon("note", 18, 2.2) + "</button>";
  }
  function del(e) { return '<button type="button" class="m-del" data-act="remove" data-id="' + e.id + '" aria-label="Remove ' + esc(e.title) + ' from your list" title="Remove from list">' + icon("trash", 18) + "</button>"; }

  // List: [poster] [title, year · genre] [stepper] [rating] [status] [note, delete]
  function row(e) {
    return '<article class="card-sm list-row list-cols">' + U.art(e, { thumb: true }) +
      '<div class="l-title">' + title(e) + sub(e) + "</div>" +
      '<div class="l-controls"><div class="l-eps">' + U.stepper(e) + progress(e) + "</div>" + rating(e) + status(e) + "</div>" +
      '<div class="l-actions">' + noteBtn(e) + del(e) + "</div>" +
      "</article>";
  }
  // Card: poster with the rating button on it, then a two-line title, year · genre, stepper + note, status + delete
  function card(e) {
    return '<article class="card-sm anime-card">' +
      '<div class="ac-top"><a class="ac-media" href="' + U.detailsHref(e) + '" tabindex="-1" aria-hidden="true">' + U.art(e) + "</a>" + ratingBtn(e) + "</div>" +
      '<div class="ac-body">' +
        '<div class="ac-head">' + title(e, "ac-title") + sub(e) + "</div>" +
        '<div class="ac-eps">' + U.stepper(e) + noteBtn(e) + "</div>" + progress(e) +
        '<div class="ac-foot">' + status(e) + del(e) + "</div>" +
      "</div></article>";
  }

  function render() {
    var c = S.counts(), all = S.ids();
    var label = TABS.filter(function (t) { return t[0] === ui.tab; })[0][1];
    U.$("#total").textContent = all.length + " anime across your lists. Update progress, ratings and status right here.";
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
    U.$$("[data-view]", bar).forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.view === ui.view); });
    if (rows.length) {
      U.render(panel, cards ? '<div class="card-grid">' + rows.map(card).join("") + "</div>" : rows.map(row).join(""));
    } else {
      U.render(panel, q ? U.emptyState("NO MATCH", "Nothing in " + label + " matches “" + ui.q + "”", "Check the spelling or look in All.", '<button type="button" class="btn btn-secondary" id="clear-q">Clear search</button>')
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
    '<button type="button" class="view-btn" data-view="list" title="List view">' + icon("list", 18, 2.2) + '<span class="sr">List view</span></button>' +
    '<button type="button" class="view-btn" data-view="cards" title="Card view">' + icon("grid", 18, 2.2) + '<span class="sr">Card view</span></button>';
  U.$("#view-toggle").addEventListener("click", function (e) {
    var b = e.target.closest("[data-view]"); if (!b || b.dataset.view === ui.view) return;
    ui.view = b.dataset.view; S.setUi({ myAnimeView: ui.view }); switched = true; render();
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

  /* ---------- rating pane: drag across five stars or type 1–10 (one decimal) ---------- */
  // One pane for the whole page, so it survives the list re-rendering after a rating changes
  var rp = document.createElement("div");
  rp.className = "rp-pop";
  rp.setAttribute("role", "dialog");
  rp.setAttribute("aria-label", "Your rating");
  rp.hidden = true;
  var STAR_OFF = U.star(40, "#E6DCC7"), STAR_ON = U.star(40, "#FFA25C");
  rp.innerHTML =
    '<div class="rp-head"><span class="rp-title">Your rating</span>' +
      '<label class="rp-badge"><span class="sr">Rating from 1 to 10</span><input id="rp-input" type="text" inputmode="decimal" autocomplete="off" maxlength="4" aria-describedby="rp-err rp-hint"><span aria-hidden="true">/10</span></label></div>' +
    '<div class="rp-stars" role="slider" tabindex="0" aria-label="Drag to rate" aria-valuemin="1" aria-valuemax="10">' +
      [0, 1, 2, 3, 4].map(function () { return '<span class="rp-star">' + STAR_OFF + '<span class="rp-on">' + STAR_ON + "</span></span>"; }).join("") + "</div>" +
    '<p id="rp-err" class="rp-err" role="alert" hidden></p>' +
    '<div class="rp-foot"><span id="rp-hint">Drag across the stars, or type 1–10</span><button type="button" class="rp-clear">Clear</button></div>';
  document.body.appendChild(rp);
  var rpInput = rp.querySelector("#rp-input"), rpStars = rp.querySelector(".rp-stars"), rpErr = rp.querySelector("#rp-err");
  var RP = { id: null, preview: 0, keyTimer: null };

  function anchor() { return RP.id ? document.querySelector('[data-rate-open="' + RP.id + '"]') : null; }
  function paint(v, fromTyping) {
    RP.preview = v;
    Array.prototype.forEach.call(rpStars.children, function (s, i) {
      s.style.setProperty("--f", Math.max(0, Math.min(1, v / 2 - i)) * 100 + "%");
    });
    rpStars.setAttribute("aria-valuenow", v || 1);
    rpStars.setAttribute("aria-valuetext", v ? fmtRating(v) + " out of 10" : "Not rated");
    if (!fromTyping) { rpInput.value = v ? fmtRating(v) : ""; showErr(""); }
  }
  function showErr(msg) {
    rpErr.hidden = !msg; rpErr.textContent = msg;
    rpInput.setAttribute("aria-invalid", !!msg);
    rp.classList.toggle("has-error", !!msg);
  }
  // Basic validation: numbers only, one decimal place at most, between 1 and 10
  function check(raw) {
    raw = raw.trim();
    if (!raw) return { empty: true };
    if (!/^\d+(\.\d*)?$/.test(raw)) return { error: "Use numbers only, like 8 or 8.5." };
    if ((raw.split(".")[1] || "").length > 1) return { error: "Use one decimal place at most, like 8.5." };
    var n = parseFloat(raw);
    if (n > 10) return { error: "Ratings can’t go above 10." };
    if (n < 1) return { error: "Ratings start at 1." };
    return { value: n };
  }
  function place() {
    var a = anchor();
    if (!a) { closeRating(false); return; }
    var r = a.getBoundingClientRect(), w = rp.offsetWidth, h = rp.offsetHeight;
    var left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2));
    var above = r.bottom + 12 + h > innerHeight - 8 && r.top - 12 - h > 8;
    rp.style.left = left + "px";
    rp.style.top = (above ? r.top - 12 - h : r.bottom + 12) + "px";
    rp.style.setProperty("--nub", (r.left + r.width / 2 - left) + "px");
    rp.classList.toggle("above", above);
    a.setAttribute("aria-expanded", "true");
  }
  function openRating(id, viaKeyboard) {
    if (RP.id && RP.id !== id) closeRating(false);
    RP.id = id;
    rp.hidden = false;
    paint(S.entry(id).rating || 0);
    place();
    if (viaKeyboard) rpStars.focus({ preventScroll: true }); // mouse users keep focus on the button (no stray focus ring)
  }
  function closeRating(returnFocus) {
    var a = anchor();
    clearTimeout(RP.keyTimer);
    if (a) a.setAttribute("aria-expanded", "false");
    rp.hidden = true; RP.id = null;
    if (returnFocus && a) a.focus({ preventScroll: true });
  }
  function commit(v) {
    if (!RP.id) return;
    var e = S.entry(RP.id);
    v = Math.round(v * 10) / 10;
    if (v === (e.rating || 0)) return;
    var undo = S.rate(RP.id, v);
    U.toast(v ? "Rated " + e.title + " " + fmtRating(v) + "/10" : "Cleared your rating for " + e.title, undo);
    requestAnimationFrame(place); // the list re-rendered; follow the new button
  }

  // Drag (or click) across the stars: position → 1.0–10.0 in 0.1 steps
  function valueAt(x) {
    var r = rpStars.getBoundingClientRect();
    return Math.max(1, Math.min(10, Math.round((x - r.left) / r.width * 100) / 10));
  }
  var dragging = false;
  rpStars.addEventListener("pointerdown", function (ev) {
    dragging = true; rpStars.setPointerCapture(ev.pointerId); rp.classList.add("is-dragging");
    paint(valueAt(ev.clientX));
  });
  rpStars.addEventListener("pointermove", function (ev) { if (dragging) paint(valueAt(ev.clientX)); });
  function endDrag() { if (!dragging) return; dragging = false; rp.classList.remove("is-dragging"); commit(RP.preview); }
  rpStars.addEventListener("pointerup", endDrag);
  rpStars.addEventListener("pointercancel", endDrag);
  // Keyboard on the stars: arrows ±0.5 (Shift ±0.1), Home 1, End 10; saves after a short pause
  rpStars.addEventListener("keydown", function (ev) {
    var v = RP.preview || 0, step = ev.shiftKey ? 0.1 : 0.5;
    if (ev.key === "ArrowRight" || ev.key === "ArrowUp") v = Math.min(10, (v || 0.5) + step);
    else if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") v = Math.max(1, v - step);
    else if (ev.key === "Home") v = 1;
    else if (ev.key === "End") v = 10;
    else if (ev.key === "Enter") { clearTimeout(RP.keyTimer); commit(RP.preview); return; }
    else return;
    ev.preventDefault();
    paint(Math.round(v * 10) / 10);
    clearTimeout(RP.keyTimer); RP.keyTimer = setTimeout(function () { commit(RP.preview); }, 600);
  });
  // Typing: live preview on the stars; Enter or leaving the box saves a valid value
  rpInput.addEventListener("input", function () {
    var r = check(rpInput.value);
    showErr(r.error || "");
    if (r.value) paint(r.value, true);
  });
  rpInput.addEventListener("keydown", function (ev) {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    var r = check(rpInput.value);
    if (r.value) { commit(r.value); paint(r.value); }
    else if (r.empty) showErr("Type a rating from 1 to 10.");
  });
  rpInput.addEventListener("blur", function () {
    var r = check(rpInput.value);
    if (r.value && RP.id) commit(r.value);
  });
  rp.querySelector(".rp-clear").addEventListener("click", function () { commit(0); closeRating(true); });

  document.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-rate-open]");
    if (b) { if (RP.id === b.dataset.rateOpen) closeRating(false); else openRating(b.dataset.rateOpen, ev.detail === 0); return; }
    if (RP.id && !rp.contains(ev.target)) closeRating(false);
  });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && RP.id) { ev.stopPropagation(); closeRating(true); } }, true);
  window.addEventListener("resize", function () { if (RP.id) place(); });
  window.addEventListener("scroll", function () { if (RP.id) place(); }, { passive: true, capture: true });

  /* ---------- review note pane ---------- */
  var NOTE_MAX = 2000;
  var np = document.createElement("div");
  np.className = "np-pop";
  np.setAttribute("role", "dialog");
  np.setAttribute("aria-labelledby", "np-title");
  np.hidden = true;
  np.innerHTML =
    '<div class="np-head"><p id="np-title" class="np-title">Your review</p><p id="np-anime" class="np-anime"></p></div>' +
    '<label class="sr" for="np-text">Your review</label>' +
    '<textarea id="np-text" class="np-text" rows="5" maxlength="' + NOTE_MAX + '" placeholder="What did you think? Favorite moments, characters, how it made you feel…" aria-describedby="np-count"></textarea>' +
    '<div class="np-foot"><span id="np-count" class="np-count"></span>' +
      '<div class="np-actions"><button type="button" class="np-del" hidden>Delete review</button>' +
      '<button type="button" class="btn btn-secondary np-cancel">Cancel</button>' +
      '<button type="button" class="btn btn-primary np-save">Save</button></div></div>';
  document.body.appendChild(np);
  var npText = np.querySelector("#np-text"), npSave = np.querySelector(".np-save"), npDel = np.querySelector(".np-del");
  var NP = { id: null, drafts: {} }; // unsaved text is kept per anime until saved or cancelled

  function noteAnchor() { return NP.id ? document.querySelector('[data-note-open="' + NP.id + '"]') : null; }
  function syncNote() {
    var saved = S.entry(NP.id).note, v = npText.value;
    np.querySelector("#np-count").textContent = v.length.toLocaleString("en-US") + " / " + NOTE_MAX.toLocaleString("en-US");
    npSave.disabled = v.trim() === saved;
    npDel.hidden = !saved;
  }
  function placeNote() {
    var a = noteAnchor();
    if (!a) { closeNote(false); return; }
    var r = a.getBoundingClientRect(), w = np.offsetWidth, h = np.offsetHeight;
    var left = Math.max(12, Math.min(innerWidth - w - 12, r.right - w + 16));
    var above = r.bottom + 12 + h > innerHeight - 8 && r.top - 12 - h > 8;
    np.style.left = left + "px";
    np.style.top = (above ? r.top - 12 - h : r.bottom + 12) + "px";
    np.style.setProperty("--nub", (r.left + r.width / 2 - left) + "px");
    np.classList.toggle("above", above);
    a.setAttribute("aria-expanded", "true");
  }
  function openNote(id) {
    if (NP.id && NP.id !== id) closeNote(false);
    NP.id = id;
    var e = S.entry(id);
    np.querySelector("#np-anime").textContent = e.title;
    npText.value = NP.drafts[id] != null ? NP.drafts[id] : e.note;
    np.hidden = false;
    syncNote(); placeNote();
    npText.focus({ preventScroll: true });
    npText.setSelectionRange(npText.value.length, npText.value.length);
  }
  function closeNote(returnFocus, keepDraft) {
    var a = noteAnchor();
    if (NP.id) { if (keepDraft && npText.value.trim() !== S.entry(NP.id).note) NP.drafts[NP.id] = npText.value; else delete NP.drafts[NP.id]; }
    if (a) a.setAttribute("aria-expanded", "false");
    np.hidden = true; NP.id = null;
    if (returnFocus && a) a.focus({ preventScroll: true });
  }
  function saveNote(text) {
    var id = NP.id, e = S.entry(id);
    delete NP.drafts[id];
    closeNote(false);
    var undo = S.setNote(id, text);
    U.toast(text.trim() ? (e.note ? "Review updated for " : "Review saved for ") + e.title : "Review deleted for " + e.title, undo);
    var a = document.querySelector('[data-note-open="' + id + '"]'); if (a) a.focus({ preventScroll: true });
  }

  npText.addEventListener("input", syncNote);
  npText.addEventListener("keydown", function (ev) { if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey) && !npSave.disabled) { ev.preventDefault(); saveNote(npText.value); } });
  npSave.addEventListener("click", function () { saveNote(npText.value); });
  np.querySelector(".np-cancel").addEventListener("click", function () { closeNote(true, false); });
  npDel.addEventListener("click", function () { saveNote(""); });
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-note-open]");
    if (b) { if (NP.id === b.dataset.noteOpen) closeNote(false, true); else openNote(b.dataset.noteOpen); return; }
    if (NP.id && !np.contains(ev.target)) closeNote(false, true); // clicking away keeps the draft
  });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && NP.id) { ev.stopPropagation(); closeNote(true, true); } }, true);
  window.addEventListener("resize", function () { if (NP.id) placeNote(); });
  window.addEventListener("scroll", function () { if (NP.id) placeNote(); }, { passive: true, capture: true });

  S.subscribe(render);
  render();
  var t; NEKAI.jikan.hydrate(S.ids(), function () { clearTimeout(t); t = setTimeout(render, 250); });
})();
