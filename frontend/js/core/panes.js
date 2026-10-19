/* NEKAI rating pane + review shortcut, shared by Library and Home.
 * NEKAI.ui.ratingBtn(e) makes the "★ 8.4 ⌄" button that opens the rating pane (drag across
 * five stars or type 1–10, one decimal). It's one pane per page, so it survives the page
 * re-rendering after a change. NEKAI.ui.reviewBtn(e) opens the details panel at "Your review".
 */
(function () {
  "use strict";
  var S = NEKAI.store, U = NEKAI.ui, esc = U.esc, icon = U.icon;

  // 8 → "8.0", 8.45 → "8.5", 10 → "10"
  function fmtRating(n) { return (Math.round(n * 10) / 10).toFixed(1).replace(/^10\.0$/, "10"); }
  // The "★ 8.4 ⌄" button that opens the rating pane
  function ratingBtn(e) {
    return '<button type="button" class="rp-btn" data-rate-open="' + e.id + '" aria-haspopup="dialog" aria-expanded="false" aria-label="Your rating for ' + esc(e.title) + ": " + (e.rating ? fmtRating(e.rating) + " out of 10" : "not rated") + '. Change rating">' +
        U.star(16, e.rating ? "#F25C05" : "#E6DCC7") + (e.rating ? "<span>" + fmtRating(e.rating) + "</span>" : '<span class="rp-none">Rate</span>') + icon("chevD", 16, 2.6) + "</button>";
  }
  // Reviews are written in the details panel; this jumps straight to that box. Filled when a review exists.
  function reviewBtn(e) {
    var label = (e.note ? "Edit your review of " : "Write a review of ") + e.title;
    return '<button type="button" class="review-btn' + (e.note ? " has-note" : "") + '" data-review-open="' + e.id + '" aria-label="' + esc(label) + '" title="' + (e.note ? "Edit your review" : "Write a review") + '">' + icon("note", 18, 2.2) + "</button>";
  }
  U.fmtRating = fmtRating;
  U.ratingBtn = ratingBtn;
  U.reviewBtn = reviewBtn;

  document.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-review-open]");
    if (!b || !NEKAI.panel) return;
    NEKAI.panel.open(Number(b.dataset.reviewOpen), b);
    // the panel renders synchronously; bring the review box into view and focus it
    setTimeout(function () {
      var t = document.getElementById("dp-review");
      if (!t) return;
      t.scrollIntoView({ block: "center", behavior: "smooth" });
      t.focus({ preventScroll: true });
    }, 60);
  });

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
  var RP = { id: null, preview: 0, keyTimer: null, btn: null, inPanel: false };

  // The same anime can have two Rate buttons on screen (a Library row and the details panel):
  // anchor to the one that was clicked, or after a re-render, its replacement in the same place
  function anchor() {
    if (!RP.id) return null;
    if (RP.btn && document.contains(RP.btn)) return RP.btn;
    var all = Array.prototype.slice.call(document.querySelectorAll('[data-rate-open="' + RP.id + '"]'));
    RP.btn = all.filter(function (b) { return !!b.closest(".dp") === RP.inPanel; })[0] || all[0] || null;
    return RP.btn;
  }
  // Shows rating v on the stars (partly filled) and in the box. fromTyping leaves the box as typed.
  function paint(v, fromTyping) {
    RP.preview = v;
    Array.prototype.forEach.call(rpStars.children, function (s, i) {
      s.style.setProperty("--f", Math.max(0, Math.min(1, v / 2 - i)) * 100 + "%");
    });
    rpStars.setAttribute("aria-valuenow", v || 1);
    rpStars.setAttribute("aria-valuetext", v ? fmtRating(v) + " out of 10" : "Not rated");
    if (!fromTyping) { rpInput.value = v ? fmtRating(v) : ""; showErr(""); }
  }
  // Shows or clears the message under the box
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
  // Positions the pane under its button (above it when there's no room), inside the window
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
  // viaKeyboard: move focus into the stars (a click leaves focus on the button)
  function openRating(id, viaKeyboard) {
    if (RP.id && RP.id !== id) closeRating(false);
    RP.id = id;
    rp.hidden = false;
    paint(S.entry(id).rating || 0);
    place();
    if (viaKeyboard) rpStars.focus({ preventScroll: true }); // mouse users keep focus on the button (no stray focus ring)
  }
  // returnFocus: put focus back on the Rate button (Esc, Clear)
  function closeRating(returnFocus) {
    var a = anchor();
    clearTimeout(RP.keyTimer);
    if (a) a.setAttribute("aria-expanded", "false");
    rp.hidden = true; RP.id = null; RP.btn = null;
    if (returnFocus && a) a.focus({ preventScroll: true });
  }
  // Saves rating v if it changed, with an Undo toast
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
  // Letting go saves the value under the pointer
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
    if (b) {
      if (RP.id === b.dataset.rateOpen && RP.btn === b) closeRating(false);
      else {
        if (RP.id) closeRating(false);
        RP.btn = b;
        RP.inPanel = !!b.closest(".dp");
        openRating(b.dataset.rateOpen, ev.detail === 0);
      }
      return;
    }
    if (RP.id && !rp.contains(ev.target)) closeRating(false);
  });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && RP.id) { ev.stopPropagation(); closeRating(true); } }, true);
  window.addEventListener("resize", function () { if (RP.id) place(); });
  window.addEventListener("scroll", function () { if (RP.id) place(); }, { passive: true, capture: true });
})();
