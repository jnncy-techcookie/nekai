/* NEKAI shared UI: icons, app shell, toasts, confetti, sound and
 * reusable components (poster art, stepper, stars, pick cards).
 * Plain JavaScript, no framework. Pages call NEKAI.ui.* to render.
 */
(function () {
  "use strict";
  var S = NEKAI.store, D = NEKAI.data;

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var P = {
    search: '<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"></path>',
    plus: '<path d="M12 5v14M5 12h14"></path>',
    minus: '<path d="M5 12h14"></path>',
    home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"></path>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"></path><circle cx="4.5" cy="6" r="1"></circle><circle cx="4.5" cy="12" r="1"></circle><circle cx="4.5" cy="18" r="1"></circle>',
    compass: '<circle cx="12" cy="12" r="9"></circle><path d="M15.5 8.5l-2 5-5 2 2-5z"></path>',
    user: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"></path>',
    alert: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7.5v5.5M12 16.5v.5"></path>',
    shuffle: '<path d="M4 7h3c5 0 5 10 10 10h3M4 17h3c1.5 0 2.5-.9 3.3-2.2M13.7 9.2C14.5 7.9 15.5 7 17 7h3"></path><path d="M18 4.5L20.5 7 18 9.5M18 14.5l2.5 2.5-2.5 2.5"></path>',
    inbox: '<path d="M4 13l2.5-8h11L20 13v6H4z"></path><path d="M4 13h5l1 2h4l1-2h5"></path>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V8a4 4 0 018 0v3"></path>',
    share: '<path d="M12 15V4M8 8l4-4 4 4"></path><path d="M5 13v6h14v-6"></path>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"></path><path d="M13 7l4 4"></path>',
    gear: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"></path>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"></path>',
    flame: '<path d="M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3.5 2-4.5.3 2 1.5 3 2.5 3-1-3 .5-6 .5-8.5z"></path>',
    trophy: '<path d="M8 4h8v5a4 4 0 01-8 0z"></path><path d="M8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4M12 13v4M8 20h8M10 17h4"></path>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"></path><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"></path>',
    back: '<path d="M15 5l-7 7 7 7"></path>',
    chevL: '<path d="M15 5l-7 7 7 7"></path>',
    chevR: '<path d="M9 5l7 7-7 7"></path>',
    playc: '<circle cx="12" cy="12" r="10"></circle><path d="M10 8l6 4-6 4z"></path>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>',
    info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 8v.5"></path>',
    x: '<path d="M6 6l12 12M18 6L6 18"></path>',
    panel: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"></rect><path d="M9.5 4.5v15"></path>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0112 7.3a4.3 4.3 0 017.5 2.5C19.5 15.4 12 20 12 20z"></path>',
    dots: '<circle cx="6" cy="12" r="1.6" fill="currentColor" stroke="none"></circle><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"></circle><circle cx="18" cy="12" r="1.6" fill="currentColor" stroke="none"></circle>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"></path>',
    smile: '<circle cx="12" cy="12" r="9"></circle><path d="M8 14q4 4 8 0M9 9.5h.01M15 9.5h.01"></path>',
    arrow: '<path d="M4 12h14"></path><path d="M13 6l6 6-6 6"></path>',
    moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"></path>',
    wifiOff: '<path d="M2 8.5a15 15 0 0120 0M5 12a10 10 0 0114 0M8.5 15.5a5 5 0 017 0M12 19h.01M3 3l18 18"></path>'
  };
  function icon(name, size, sw) {
    return '<svg width="' + (size || 24) + '" height="' + (size || 24) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 2.4) +
      '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[name] + '</svg>';
  }
  var STAR = "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z";
  function star(size, fill, stroke) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + STAR + '" fill="' + fill + '"' +
      (stroke ? ' stroke="#0F1F5C" stroke-width="1.5" stroke-linejoin="round"' : "") + '></path></svg>';
  }
  var AVATAR = '<svg width="32" height="32" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="16" r="11" fill="#FAF3E6" stroke="#0F1F5C" stroke-width="2.2"></circle><path d="M5 13c2-7 16-9 20-1c-5-1-8-4-9-5c-2 3-6 5-11 6z" fill="#0F1F5C"></path><circle cx="11.5" cy="17" r="1.4" fill="#0F1F5C"></circle><circle cx="18.5" cy="17" r="1.4" fill="#0F1F5C"></circle><path d="M12.5 21.5q2.5 2 5 0" stroke="#0F1F5C" stroke-width="1.8" fill="none" stroke-linecap="round"></path></svg>';
  function lolliSvg(n) {
    return '<svg width="' + n + '" height="' + n + '" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 28v10" stroke="#0F1F5C" stroke-width="2.5" stroke-linecap="round"></path><circle cx="20" cy="16" r="13" fill="#FFD3B3" stroke="#0F1F5C" stroke-width="1.5"></circle><path d="M20 16a4 4 0 118 0 8 8 0 11-16 0" fill="none" stroke="#FFFBF2" stroke-width="2.2" stroke-linecap="round"></path><circle cx="15" cy="17" r="1.6" fill="#0F1F5C"></circle><circle cx="25" cy="17" r="1.6" fill="#0F1F5C"></circle><path d="M18 21q2 1.6 4 0" stroke="#0F1F5C" stroke-width="1.5" fill="none" stroke-linecap="round"></path></svg>';
  }

  /* ---------- settings applied to <html> ---------- */
  function applySettings() {
    var st = S.state.settings, h = document.documentElement;
    h.classList.toggle("opt-large-text", !!st.text);
    h.classList.toggle("opt-strong", !!st.contrast);
    h.classList.toggle("opt-reduce-motion", !!st.motion);
  }
  function reducedMotion() {
    return S.state.settings.motion || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  /* ---------- app shell ---------- */
  var NAV = [["index.html", "Home", "home"], ["my-anime.html", "My Anime", "list"], ["discover.html", "Discover", "compass"], ["profile.html", "Profile", "user"]];

  function shell(opts) {
    // opts: { page: "index.html", lolli: "message", lolliCta: [href, label] }
    applySettings();
    var app = $(".app");
    var ui = S.state.ui, st = S.state.settings, pr = S.state.profile, lv = S.xp();
    var here = opts.page;
    var navLinks = NAV.map(function (n) {
      return '<a class="side-link" href="' + n[0] + '"' + (n[0] === here ? ' aria-current="page"' : "") + ' title="' + n[1] + '">' + icon(n[2]) + '<span class="side-label">' + n[1] + "</span></a>";
    }).join("");
    var cta = opts.lolliCta ? '<a class="btn btn-accent self-start" href="' + opts.lolliCta[0] + '" style="padding:0 16px">' + esc(opts.lolliCta[1]) + "</a>" : "";
    var lolliOn = st.lolli !== false;
    var side = document.createElement("aside");
    side.className = "side" + (ui.navOpen === false ? " is-collapsed" : "") + (ui.lolliHidden ? " lolli-hidden" : "");
    side.setAttribute("aria-label", "Sidebar");
    side.innerHTML =
      '<div class="side-head">' +
        '<a class="brand" href="index.html" aria-label="NEKAI home"><span class="brand-mark">ネ</span><span class="brand-word">NEKAI</span></a>' +
        '<button type="button" class="side-toggle" data-act="nav" aria-expanded="' + (ui.navOpen !== false) + '" aria-label="' + (ui.navOpen !== false ? "Collapse sidebar" : "Expand sidebar") + '">' + icon("panel", 20, 2) + "</button>" +
      "</div>" +
      '<nav class="side-nav" aria-label="Main">' + navLinks + "</nav>" +
      '<div class="side-foot">' +
        (lolliOn ? '<section class="lolli" aria-label="Lolli, your watch buddy"><div class="row gap-8" style="flex-wrap:nowrap">' + lolliSvg(40) +
          '<div class="grow"><div class="h3">Lolli</div><div class="caption muted">Your watch buddy</div></div>' +
          '<button type="button" class="btn btn-ghost btn-icon" data-act="lolli-hide" aria-label="Hide Lolli">' + icon("x", 16) + "</button></div>" +
          '<p class="small semibold">' + esc(opts.lolli || "") + "</p>" + cta + "</section>" +
          '<button type="button" class="side-link lolli-mini" data-act="lolli-show" title="Lolli has a tip">' + lolliSvg(32) + '<span class="side-label">Lolli</span></button>' : "") +
        '<a class="side-link" href="settings.html"' + (here === "settings.html" ? ' aria-current="page"' : "") + ' title="Settings">' + icon("gear") + '<span class="side-label">Settings</span></a>' +
        '<a class="side-link side-me" href="profile.html" title="Your profile"><span class="avatar">' + AVATAR + '</span><span class="side-label"><span>' + esc(pr.name) + '</span><span class="small muted">Level ' + lv.level + "</span></span></a>" +
      "</div>";
    app.insertBefore(side, app.firstChild);

    var top = document.createElement("header");
    top.className = "mtop";
    top.innerHTML = '<a class="brand" href="index.html" aria-label="NEKAI home"><span class="brand-mark">ネ</span><span class="brand-word">NEKAI</span></a>' +
      '<a class="btn btn-secondary btn-icon ml-auto" href="discover.html#q" aria-label="Search">' + icon("search") + "</a>" +
      '<a class="avatar" href="profile.html" aria-label="Your profile">' + AVATAR + "</a>";
    var tabs = document.createElement("nav");
    tabs.className = "mtabs"; tabs.setAttribute("aria-label", "Main");
    tabs.innerHTML = NAV.map(function (n) {
      return '<a class="mtab" href="' + n[0] + '"' + (n[0] === here ? ' aria-current="page"' : "") + '><span class="mtab-icon">' + icon(n[2]) + "</span>" + n[1] + "</a>";
    }).join("");
    var main = $(".main");
    app.insertBefore(top, main);
    document.body.appendChild(tabs);

    var toasts = document.createElement("div");
    toasts.className = "toast-region"; toasts.setAttribute("role", "status"); toasts.setAttribute("aria-live", "polite");
    document.body.appendChild(toasts);

    var skip = document.createElement("a");
    skip.className = "skip"; skip.href = "#main"; skip.textContent = "Skip to content";
    document.body.insertBefore(skip, document.body.firstChild);
  }

  /* ---------- toast with optional Undo ---------- */
  var toastTimer;
  function toast(msg, undo) {
    var region = $(".toast-region"); if (!region) return;
    clearTimeout(toastTimer);
    region.innerHTML = '<div class="toast"><span class="toast-icon">' + icon("check", 16, 3) + "</span><span>" + esc(msg) + "</span>" +
      (undo ? '<button type="button" class="btn btn-ghost" data-toast="undo">Undo</button>' : "") +
      '<button type="button" class="btn btn-ghost btn-icon" data-toast="close" aria-label="Dismiss">' + icon("x", 20) + "</button></div>";
    var close = function () { region.innerHTML = ""; };
    region.onclick = function (e) {
      var b = e.target.closest("[data-toast]"); if (!b) return;
      if (b.dataset.toast === "undo" && undo) undo();
      close();
    };
    toastTimer = setTimeout(close, 5000);
  }

  /* ---------- confetti (first completion only) + sound ---------- */
  function confetti() {
    if (!S.state.settings.confetti || reducedMotion()) return;
    var box = document.createElement("div");
    box.className = "confetti"; box.setAttribute("aria-hidden", "true");
    var cols = ["#F25C05", "#FFA25C", "#6F8FE8", "#FFD3B3", "#1F3FA6", "#F7823A"], html = "";
    for (var i = 0; i < 36; i++) {
      html += '<span class="bit" style="left:' + ((i * 37) % 100) + "%;background:" + cols[i % 6] + ";animation-delay:" + ((i * 7) % 10) / 20 +
        "s;width:" + (8 + (i % 3) * 4) + "px;height:" + (8 + ((i + 1) % 2) * 8) + 'px"></span>';
    }
    box.innerHTML = html;
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 3200);
  }
  var audio;
  function sound(kind) {
    if (!S.state.settings.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var notes = kind === "done" ? [660, 880, 1320] : [880];
      notes.forEach(function (f, i) {
        var o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + i * 0.09;
        o.type = "triangle"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.2);
      });
    } catch (e) { /* audio not available */ }
  }

  /* ---------- components ---------- */
  function art(a, opts) {
    opts = opts || {};
    var x = a.art || {};
    var cls = "art" + (opts.lg ? " lg" : "") + (opts.thumb ? " thumb" : "") + (a.image && !opts.noImg ? " has-img" : "");
    return '<div class="' + cls + '" aria-hidden="true" style="background:' + x.bg + (opts.width ? ";width:" + opts.width + "px" : "") + '">' +
      '<span class="motif" style="background:' + x.c1 + ";border-radius:" + x.cr + ";transform:rotate(" + x.rot + 'deg)"></span>' +
      '<span class="band" style="background:' + x.band + '"></span>' +
      (opts.ep ? '<span class="ep">' + esc(opts.ep) + "</span>" : "") +
      '<span class="jp" style="color:' + x.ink + '">' + esc(a.jp) + "</span>" +
      (a.image && !opts.noImg ? '<img src="' + esc(a.image) + '" alt="" loading="lazy" decoding="async" onerror="this.remove()">' : "") +
      "</div>";
  }
  function detailsHref(a) { return "anime.html?id=" + a.id; }

  function stepper(e) {
    return '<div class="stepper" role="group" aria-label="Episodes watched, ' + esc(e.title) + '">' +
      '<button type="button" class="step" data-act="dec" data-id="' + e.id + '"' + (e.canDec ? "" : " disabled") + ' aria-label="One episode fewer">' + icon("minus", 20, 2.6) + "</button>" +
      '<span class="step-val" aria-live="polite">' + esc(e.stepText) + "</span>" +
      '<button type="button" class="step" data-act="inc" data-id="' + e.id + '"' + (e.canInc ? "" : " disabled") + ' aria-label="One more episode watched">' + icon("plus", 20, 2.6) + "</button></div>";
  }
  function stars(e) {
    var h = '<div class="stars" role="group" aria-label="Your rating for ' + esc(e.title) + '">';
    for (var i = 1; i <= 5; i++) {
      h += '<button type="button" class="star" data-act="rate" data-id="' + e.id + '" data-n="' + i + '" aria-label="Rate ' + esc(e.title) + " " + i + ' out of 5" aria-pressed="' + (i === e.rating) + '">' +
        star(24, i <= e.rating ? "#FFA25C" : "#FFFBF2", true) + "</button>";
    }
    return h + "</div>";
  }
  function statusSelect(e, id) {
    return '<select id="' + id + '" class="input select status-select" data-act="status" data-id="' + e.id + '" style="color:' + (e.status ? D.statuses[e.status].color : "#0F1F5C") + '">' +
      Object.keys(D.statuses).map(function (k) { return '<option value="' + k + '"' + (k === e.status ? " selected" : "") + ">" + D.statuses[k].label + "</option>"; }).join("") + "</select>";
  }
  function scoreBadge(a) {
    return '<span class="score" title="Community score from Jikan (MyAnimeList)">' + star(16, "#0F1F5C") + esc(a.scoreText) + '<span class="caption muted">Jikan</span></span>';
  }
  function emptyState(pill, title, body, actionHtml) {
    return '<div class="card empty"><div class="empty-top"><span class="pill pill-yellow">' + esc(pill) + '</span></div><div class="empty-body">' +
      '<span class="empty-icon">' + icon("inbox", 32) + '</span><h2 class="h2">' + esc(title) + '</h2><p class="body muted" style="max-width:448px">' + esc(body) + "</p>" + (actionHtml || "") + "</div></div>";
  }

  /* ---------- shared actions (event delegation) ---------- */
  function afterComplete(res, a) {
    if (res && res.firstCompletion) { confetti(); sound("done"); }
    var c = S.counts().completed;
    toast(a.title + " completed! Finisher badge " + Math.min(c, 10) + " / 10", res && res.undo);
  }
  var actions = {
    nav: function () {
      var side = $(".side"), open = side.classList.toggle("is-collapsed") === false;
      S.setUi({ navOpen: open });
      var b = $("[data-act=nav]"); b.setAttribute("aria-expanded", open); b.setAttribute("aria-label", open ? "Collapse sidebar" : "Expand sidebar");
    },
    "lolli-hide": function () { $(".side").classList.add("lolli-hidden"); S.setUi({ lolliHidden: true }); },
    "lolli-show": function () {
      var side = $(".side"); side.classList.remove("lolli-hidden", "is-collapsed"); S.setUi({ lolliHidden: false, navOpen: true });
    },
    inc: function (id) {
      var a = S.anime(id), r = S.inc(id); if (!r) return;
      sound("tick");
      if (r.finished) toast(a.title + ": all " + a.episodes + " episodes watched");
      else toast(a.title + ": episode " + r.watched + " marked as watched", r.undo);
    },
    dec: function (id) { S.dec(id); },
    complete: function (id) { afterComplete(S.complete(id), S.anime(id)); },
    rate: function (id, el) {
      var n = Number(el.dataset.n), a = S.anime(id), undo = S.rate(id, n);
      toast("Rated " + a.title + " " + n + " out of 5", undo);
    },
    remove: function (id) { var a = S.anime(id); toast(a.title + " removed from your list", S.remove(id)); },
    toggle: function (id) {
      var e = S.entry(id);
      if (e.inList) toast(e.title + " removed from your list", S.remove(id));
      else { var r = S.add(id, "plan"); toast(e.title + " added to Plan to Watch", r.undo); }
    },
    fav: function (id) { var a = S.anime(id), r = S.toggleFav(id); toast(a.title + (r.on ? " added to favorites" : " removed from favorites"), r.undo); },
    dismiss: function (id) { var a = S.anime(id); closePanel(true); toast("Got it. We’ll show fewer picks like " + a.title, S.hide(id)); }
  };
  document.addEventListener("click", function (ev) {
    var el = ev.target.closest("[data-act]");
    if (!el || el.tagName === "SELECT") return;
    var fn = actions[el.dataset.act];
    if (fn) { ev.preventDefault(); fn(el.dataset.id, el); }
  });
  document.addEventListener("change", function (ev) {
    var el = ev.target;
    if (el.dataset && el.dataset.act === "status") {
      var id = el.dataset.id, a = S.anime(id), next = el.value;
      var r = S.setStatus(id, next);
      if (next === "completed") afterComplete(r, a);
      else toast(a.title + " moved to " + D.statuses[next].label, r.undo);
    }
  });

  /* ---------- re-render that keeps keyboard focus ---------- */
  function keyOf(el) {
    if (!el || !el.dataset) return null;
    if (el.id) return "#" + el.id;
    if (el.dataset.act) return '[data-act="' + el.dataset.act + '"][data-id="' + el.dataset.id + '"]' + (el.dataset.n ? '[data-n="' + el.dataset.n + '"]' : "");
    return null;
  }
  function render(container, html) {
    var k = container.contains(document.activeElement) ? keyOf(document.activeElement) : null;
    container.innerHTML = html;
    if (k) {
      var t = container.querySelector(k);
      if (t && !t.disabled) t.focus({ preventScroll: true });
      else if (t) { var sib = t.parentElement.querySelector("button:not([disabled])"); if (sib) sib.focus({ preventScroll: true }); }
    }
  }

  /* ---------- Picked for you row ---------- */
  function pickCard(a) {
    var e = S.entry(a.id);
    var tags = (a.genres || []).slice(0, 3).map(function (g) {
      var c = D.genreColors[g] || { bg: "#EDE4D2", fg: "#4A5378" };
      return '<span role="listitem" class="gtag" style="background:' + c.bg + ";color:" + c.fg + '">' + esc(g) + "</span>";
    }).join("");
    return '<article class="pick" data-pick="' + a.id + '">' +
      '<div class="pick-card">' +
        '<div class="pick-media"><a class="pick-hit" href="' + detailsHref(a) + '" tabindex="-1" aria-hidden="true">' + art(a) + "</a>" +
          '<span class="match-green">' + a.match + "% match</span>" +
          '<button type="button" class="pick-fav' + (e.fav ? " on" : "") + '" data-act="fav" data-id="' + a.id + '" aria-pressed="' + e.fav + '" aria-label="Favorite ' + esc(a.title) + '" title="' + (e.fav ? "Remove from favorites" : "Add to favorites") + '">' + icon("heart", 18, 2) + "</button></div>" +
        '<h3 class="pick-title"><a class="title-link" href="' + detailsHref(a) + '">' + esc(a.title) + "</a></h3>" +
        '<div class="pick-stats"><span class="pick-score" aria-label="Community score ' + a.scoreText + ' out of 10">' + star(16, "#FFA25C", true) + '<span aria-hidden="true">' + a.scoreText + "</span></span>" +
          '<span class="pick-sep" aria-hidden="true"></span><span class="pick-chip">' + esc(a.type || "TV") + '</span><span class="pick-sep" aria-hidden="true"></span><span class="pick-chip">' + esc(a.epsText) + "</span></div>" +
        '<div class="pick-tags" role="list" aria-label="Genres">' + tags + "</div>" +
        '<div class="pick-foot">' +
          '<button type="button" class="btn ' + (e.inList ? "btn-accent" : "btn-primary") + '" data-act="toggle" data-id="' + a.id + '" aria-pressed="' + e.inList + '" aria-label="' + (e.inList ? "Remove " + esc(a.title) + " from your list" : "Add " + esc(a.title) + " to Plan to Watch") + '">' +
            (e.inList ? icon("check", 20, 2.6) + "Added" : icon("plus", 20, 2.6) + "Add") + "</button>" +
          '<button type="button" class="btn btn-secondary btn-icon pick-more" data-more="' + a.id + '" aria-expanded="false" aria-controls="qi-' + a.id + '" aria-label="Quick info for ' + esc(a.title) + '" title="Quick info">' + icon("dots", 20) + "</button>" +
        "</div></div>" +
      '<div class="qi" id="qi-' + a.id + '" role="group" aria-label="Quick info: ' + esc(a.title) + '">' +
        '<div class="qi-head"><p class="qi-title">' + esc(a.title) + "</p>" +
          '<div class="qi-chips"><span class="qi-chip hl" aria-label="Community score ' + a.scoreText + ' out of 10">' + star(16, "currentColor") + a.scoreText + '</span><span class="qi-chip">' + esc(a.type || "TV") + '</span><span class="qi-chip">' + esc(a.epsText) + "</span></div></div>" +
        '<p class="qi-syn">' + esc(a.synopsis || "Synopsis loads from Jikan.") + "</p>" +
        '<dl class="qi-dl"><dt>Japanese</dt><dd>' + esc(a.jp || "–") + "</dd><dt>Aired</dt><dd>" + esc(a.season || "–") + "</dd><dt>Status</dt><dd>" +
          esc(a.statusText || (a.airing ? "Currently airing" : "Finished airing")) + "</dd><dt>Genres</dt><dd>" + esc((a.genres || []).join(", ") || "–") + "</dd></dl>" +
        (a.why ? '<p class="qi-why">' + icon("spark", 16) + "<span>" + esc(a.why) + "</span></p>" : "") +
        '<div class="qi-foot"><a class="btn btn-see" href="' + detailsHref(a) + '" style="flex-grow:1">See full details</a>' +
          '<button type="button" class="btn btn-secondary btn-icon" data-act="dismiss" data-id="' + a.id + '" style="width:44px;height:44px" aria-label="Not interested in ' + esc(a.title) + '" title="Not interested">' + icon("x", 20) + "</button></div>" +
      "</div></article>";
  }

  var openKey = null, openTimer, closeTimer;
  function closePanel(now) {
    clearTimeout(openTimer); clearTimeout(closeTimer);
    var go = function () {
      $$(".pick.is-open").forEach(function (p) { p.classList.remove("is-open"); var m = p.querySelector("[data-more]"); if (m) m.setAttribute("aria-expanded", "false"); });
      openKey = null;
    };
    if (now) go(); else closeTimer = setTimeout(go, 120);
  }
  function openPanel(card, delay) {
    clearTimeout(openTimer); clearTimeout(closeTimer);
    var go = function () {
      if (openKey && openKey !== card.dataset.pick) closePanel(true);
      var row = card.closest(".pick-row"), r = card.getBoundingClientRect();
      card.classList.toggle("flip", !!row && r.right + r.width * 1.54 > row.getBoundingClientRect().right);
      card.classList.add("is-open");
      var m = card.querySelector("[data-more]"); if (m) m.setAttribute("aria-expanded", "true");
      openKey = card.dataset.pick;
    };
    if (openKey || !delay) go(); else openTimer = setTimeout(go, delay);
  }

  function pickRow(host, items, label) {
    var keep = host.querySelector(".pick-row");
    var scroll = keep ? keep.scrollLeft : 0, wasOpen = openKey;
    host.innerHTML = '<div class="pick-wrap"><div class="pick-row" role="region" aria-label="' + esc(label) + '" tabindex="0">' + items.map(pickCard).join("") + "</div>" +
      '<span class="fade fade-l" aria-hidden="true" hidden></span><span class="fade fade-r" aria-hidden="true"></span>' +
      '<button type="button" class="pick-arrow prev" aria-label="Show previous picks" hidden>' + icon("chevL", 24, 2.6) + "</button>" +
      '<button type="button" class="pick-arrow next" aria-label="Show more picks" hidden>' + icon("chevR", 24, 2.6) + "</button></div>";
    var row = host.querySelector(".pick-row");
    var fl = host.querySelector(".fade-l"), fr = host.querySelector(".fade-r"), prev = host.querySelector(".prev"), next = host.querySelector(".next");
    var scrolled = !!scroll;
    function sync() {
      var left = row.scrollLeft > 8, end = row.scrollLeft + row.clientWidth >= row.scrollWidth - 8;
      fl.hidden = !left; fr.hidden = end;
      prev.hidden = !(scrolled && left); next.hidden = !(scrolled && !end);
    }
    row.scrollLeft = scroll;
    row.addEventListener("scroll", function () { scrolled = true; if (openKey) closePanel(true); sync(); }, { passive: true });
    var step = function () { return Math.max(row.clientWidth - 120, 280); };
    prev.onclick = function () { row.scrollBy({ left: -step(), behavior: reducedMotion() ? "auto" : "smooth" }); };
    next.onclick = function () { row.scrollBy({ left: step(), behavior: reducedMotion() ? "auto" : "smooth" }); };
    if (host._onResize) window.removeEventListener("resize", host._onResize);
    host._onResize = sync; window.addEventListener("resize", sync);
    sync();

    // Hover intent: a quick pass tilts/lifts (CSS); resting ~450ms opens the panel
    $$(".pick", row).forEach(function (card) {
      card.addEventListener("mouseenter", function () { if (matchMedia("(hover: hover)").matches) openPanel(card, 450); });
      card.addEventListener("mouseleave", function () { if (matchMedia("(hover: hover)").matches) closePanel(false); });
      card.addEventListener("focusin", function (e) { if (e.target.matches(":focus-visible") && !e.target.closest(".qi")) openPanel(card, 0); });
      card.addEventListener("focusout", function (e) { if (!card.contains(e.relatedTarget)) closePanel(true); });
      card.addEventListener("keydown", function (e) { if (e.key === "Escape" && openKey) { e.stopPropagation(); closePanel(true); card.querySelector("[data-more]").focus(); } });
      card.querySelector("[data-more]").addEventListener("click", function () { if (openKey === card.dataset.pick) closePanel(true); else openPanel(card, 0); });
    });
    if (wasOpen) { var again = row.querySelector('[data-pick="' + wasOpen + '"]'); if (again) { openKey = null; openPanel(again, 0); } }
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && openKey) closePanel(true); });
  document.addEventListener("click", function (e) { if (openKey && !e.target.closest(".pick")) closePanel(true); });

  /* Picks = curated candidates the user hasn't hidden, sorted by live match % */
  function picks() {
    return D.picks.filter(function (p) { return !S.state.hidden[String(p.id)]; }).map(function (p) {
      var a = S.anime(p.id);
      a.why = p.why; a.synopsis = a.synopsis || p.synopsis; a.match = S.match(a);
      return a;
    }).sort(function (x, y) { return y.match - x.match; });
  }

  NEKAI.ui = {
    esc: esc, $: $, $$: $$, icon: icon, star: star, AVATAR: AVATAR,
    shell: shell, toast: toast, confetti: confetti, sound: sound, render: render, applySettings: applySettings,
    art: art, stepper: stepper, stars: stars, statusSelect: statusSelect, scoreBadge: scoreBadge, emptyState: emptyState,
    detailsHref: detailsHref, pickRow: pickRow, picks: picks, afterComplete: afterComplete
  };
})();
