/* NEKAI detail side panel
 * Every details link (href="#anime-<id>", built by NEKAI.ui.detailsHref) opens that anime
 * in a split view beside the content (in its place on narrow screens). Ctrl/⌘/middle-click
 * opens the same page in a new tab with the panel already open. Closes with the X, Esc or Back.
 */
(function () {
  "use strict";
  var S = NEKAI.store,
    U = NEKAI.ui,
    D = NEKAI.data,
    J = NEKAI.tenrai,
    esc = U.esc,
    icon = U.icon;

  // The panel is part of the page layout: a flex sibling of .main inside .app (split view),
  // not an overlay. CSS decides whether it sits beside the content or replaces it.
  var host = document.createElement("div");
  host.className = "dp-host";
  host.innerHTML =
    '<aside class="dp" role="region" aria-labelledby="dp-title" tabindex="-1">' +
    '<button type="button" class="dp-close" data-dp-close aria-label="Close details" title="Close (Esc)">' +
    icon("x", 20, 2.6) +
    "</button>" +
    '<div class="dp-scroll library-list"><div id="dp-body"></div></div>' +
    "</aside>";
  var app = document.querySelector(".app");
  (app || document.body).appendChild(host);
  var panel = host.querySelector(".dp"),
    body = host.querySelector("#dp-body"),
    scroller = host.querySelector(".dp-scroll");

  var st = null; // state for the anime currently shown
  var opener = null; // element to return focus to
  var pushed = false; // whether we added a history entry
  var saved = null; // page + content scroll positions from before opening

  function mainEl() {
    return document.querySelector(".app > .main");
  }
  function saveScroll() {
    var m = mainEl();
    saved = { win: window.scrollY, main: m ? m.scrollTop : 0 };
  }
  function restoreScroll() {
    if (!saved) return;
    var m = mainEl(),
      s = saved;
    saved = null;
    // jump, don't smooth-scroll back
    if (m) {
      m.style.scrollBehavior = "auto";
      m.scrollTop = s.main;
      m.style.scrollBehavior = "";
    }
    window.scrollTo({ top: s.win, behavior: "instant" });
  }

  function fresh(id) {
    return {
      id: id,
      loading: true,
      failed: false,
      eps: [],
      epsPage: 1,
      epsViewPage: 1,
      epsRetryPage: 1,
      epsNext: false,
      epsLoading: false,
      epsFailed: false,
      showAll: false,
      trailerOn: false,
      more: false,
      addAs: "plan",
    };
  }
  function compact(n) {
    return n >= 1e6
      ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
      : n >= 1e3
        ? Math.round(n / 1e3) + "K"
        : String(n);
  }

  /* ---------- sections ---------- */
  function stats(e) {
    var status = e.airing
      ? "Airing"
      : e.statusText === "Not yet aired"
        ? "Upcoming"
        : e.statusText
          ? "Finished"
          : "";
    // Each cell: a small label (what the number is), the value, and optional detail underneath
    var cell = function (ic, label, top, sub) {
      return (
        '<div class="dp-stat">' +
        ic +
        '<div><span class="dp-label">' +
        esc(label) +
        "</span><strong>" +
        esc(top) +
        "</strong>" +
        (sub ? "<span>" + esc(sub) + "</span>" : "") +
        "</div></div>"
      );
    };
    return (
      '<div class="dp-stats">' +
      cell(
        U.star(22, "#F25C05"),
        "Score",
        e.scoreText,
        e.members ? compact(e.members) + " members" : "",
      ) +
      cell(icon("tv", 20, 2.2), "Type", e.type || "TV", "") +
      cell(
        icon("film", 20, 2.2),
        "Episodes",
        e.episodes ? String(e.episodes) : "?",
        "",
      ) +
      cell(icon("calendar", 20, 2.2), "Year", e.year || "–", status) +
      "</div>"
    );
  }
  function synopsis(e) {
    if (!e.synopsis)
      return st.loading
        ? '<div class="stack gap-8"><div class="skel" style="height:18px"></div><div class="skel" style="height:18px;width:85%"></div><div class="skel" style="height:18px;width:60%"></div></div>'
        : '<p class="small muted">No synopsis available yet.</p>';
    var long = e.synopsis.length > 360;
    return (
      '<p class="dp-syn' +
      (long && !st.more ? " clamp" : "") +
      '">' +
      esc(e.synopsis) +
      "</p>" +
      (long
        ? '<button type="button" class="dp-link" id="dp-more" aria-expanded="' +
          st.more +
          '">' +
          (st.more ? "Show less" : "Read more") +
          "</button>"
        : "")
    );
  }
  function watchlist(e) {
    if (!e.inList) {
      return (
        '<div class="dp-add"><label class="sr" for="dp-add-as">Add as</label>' +
        '<select id="dp-add-as" class="input select">' +
        Object.keys(D.statuses)
          .map(function (k) {
            return (
              '<option value="' +
              k +
              '"' +
              (k === st.addAs ? " selected" : "") +
              ">" +
              D.statuses[k].label +
              "</option>"
            );
          })
          .join("") +
        "</select>" +
        '<button type="button" id="dp-add" class="btn btn-primary btn-add">' +
        icon("plus", 20) +
        "Add to Library</button></div>"
      );
    }
    // Episodes, then Status, then Your rating, then the review
    return (
      '<div class="dp-field"><span class="dp-field-label" id="dp-eps-label">Episodes</span>' +
      '<div class="dp-prog" role="group" aria-labelledby="dp-eps-label">' +
      U.stepper(e) +
      "</div></div>" +
      '<div class="dp-field"><label class="dp-field-label" for="dp-st">Status</label>' +
      '<div class="ac-foot"><div class="l-status" data-status="' +
      e.status +
      '">' +
      U.statusSelect(e, "dp-st") +
      "</div>" +
      '<button type="button" class="m-del" data-act="remove" data-id="' +
      e.id +
      '" aria-label="Remove ' +
      esc(e.title) +
      ' from your list" title="Remove from list">' +
      icon("trash", 18) +
      "</button></div></div>" +
      '<div class="m-rate"><span class="m-rate-label">Your rating</span>' +
      U.stars(e) +
      "</div>" +
      review(e)
    );
  }
  // Review text box: holds the saved review until you type (st.reviewDraft stays null until then)
  function reviewDraft(e) {
    return st.reviewDraft != null ? st.reviewDraft : e.note || "";
  }
  function reviewChanged(e) {
    return reviewDraft(e).trim() !== (e.note || "");
  }
  function reviewCount(text) {
    return text.length.toLocaleString("en-US") + " / 2,000";
  }
  // Personal review: always an editable box under the rating (plain text, up to 2000 characters).
  // Save review saves a new review or an edit; saving an empty box deletes it.
  function review(e) {
    var draft = reviewDraft(e),
      off = reviewChanged(e) ? "" : " disabled";
    return (
      '<div class="dp-field"><label class="dp-field-label" for="dp-review">Your review</label>' +
      '<textarea id="dp-review" class="input dp-review-text" rows="4" maxlength="2000" aria-describedby="dp-review-count" placeholder="What did you think? Favorite moments, characters, how it made you feel…">' +
      esc(draft) +
      "</textarea>" +
      '<span id="dp-review-count" class="small muted semibold">' +
      reviewCount(draft) +
      "</span>" +
      '<div class="row gap-8"><button type="button" id="dp-review-save" class="btn btn-primary"' +
      off +
      ">Save review</button>" +
      '<button type="button" id="dp-review-cancel" class="btn btn-ghost"' +
      off +
      ">Cancel</button></div></div>"
    );
  }
  function info(e) {
    var rows = [
      ["Japanese", e.jp],
      ["Aired", e.aired || e.season],
      ["Status", e.statusText],
      ["Studio", e.studios || e.studio],
      ["Source", e.source],
      ["Duration", e.duration],
      ["Age rating", e.ageRating],
      ["Rank", e.rank ? "#" + e.rank.toLocaleString("en-US") : ""],
      [
        "Popularity",
        e.popularity ? "#" + e.popularity.toLocaleString("en-US") : "",
      ],
    ].filter(function (r) {
      return r[1];
    });
    return (
      '<dl class="dp-info">' +
      rows
        .map(function (r) {
          return "<dt>" + r[0] + "</dt><dd>" + esc(r[1]) + "</dd>";
        })
        .join("") +
      "</dl>"
    );
  }
  function trailer(e) {
    if (!e.trailer)
      return (
        '<p class="small muted">' +
        (st.loading
          ? "Checking for a trailer…"
          : st.failed
            ? "Trailer unavailable offline."
            : "No trailer on MyAnimeList yet.") +
        "</p>"
      );
    if (st.trailerOn)
      return (
        '<div class="trailer"><iframe src="https://www.youtube-nocookie.com/embed/' +
        encodeURIComponent(e.trailer) +
        '?autoplay=1&rel=0" title="' +
        esc(e.title) +
        ' trailer" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>'
      );
    return (
      '<button type="button" class="trailer" id="dp-play" aria-label="Play the official trailer for ' +
      esc(e.title) +
      '">' +
      (e.trailerThumb
        ? '<img class="trailer-thumb" src="' + esc(e.trailerThumb) + '" alt="">'
        : "") +
      '<span class="trailer-play">' +
      icon("playc", 28, 2) +
      "Play trailer</span></button>"
    );
  }
  var EPISODE_PAGE_SIZE = 50;
  function pagedEpisodes(e) {
    return st.showAll && (e.episodes > EPISODE_PAGE_SIZE || st.eps.length > EPISODE_PAGE_SIZE || st.epsNext);
  }
  function episodePagination(e) {
    if (!pagedEpisodes(e)) return "";
    var start = (st.epsViewPage - 1) * EPISODE_PAGE_SIZE;
    var count = st.eps.length || Math.min(e.episodes || 0, EPISODE_PAGE_SIZE);
    var end = Math.min(start + EPISODE_PAGE_SIZE, count);
    return '<nav class="dp-ep-pagination" aria-label="Episode pages">' +
      '<button type="button" class="btn btn-secondary" data-ep-page="' + (st.epsViewPage - 1) + '" aria-label="Previous episodes" title="Previous episodes"' + (st.epsLoading || st.epsViewPage === 1 ? ' disabled' : '') + '>' + icon("chevL", 18, 2.6) + '</button>' +
      '<span class="small semibold" aria-live="polite">' + (end ? (start + 1) + ' - ' + end : 'Loading…') + '</span>' +
      '<button type="button" class="btn btn-secondary" data-ep-page="' + (st.epsViewPage + 1) + '" aria-label="Next episodes" title="Next episodes"' + (st.epsLoading || (!st.epsNext && count <= start + EPISODE_PAGE_SIZE) ? ' disabled' : '') + '>' + icon("chevR", 18, 2.6) + '</button></nav>';
  }
  function episodes(e) {
    var list = st.eps.slice();
    if (!list.length && e.episodes && !st.epsLoading)
      for (var i = 1; i <= Math.min(e.episodes, pagedEpisodes(e) ? EPISODE_PAGE_SIZE : 24); i++)
        list.push({ n: i, title: "", aired: "" });
    if (st.epsLoading && !st.eps.length)
      return (
        '<div class="stack gap-8" aria-busy="true">' +
        '<div class="skel" style="height:56px"></div>'.repeat(3) +
        "</div>"
      );
    if (!list.length)
      return '<p class="small muted">No episode list yet. It usually appears once the show starts airing.</p>';
    var start = (st.epsViewPage - 1) * EPISODE_PAGE_SIZE;
    var shown = pagedEpisodes(e) ? list.slice(start, start + EPISODE_PAGE_SIZE) : st.showAll ? list : list.slice(0, 5);
    var items = shown
      .map(function (x) {
        var watched = e.inList && e.watched >= x.n,
          next = e.inList && !watched && x.n === e.watched + 1;
        return (
          '<li class="dp-ep' +
          (watched ? " watched" : "") +
          '"><span class="dp-ep-n" aria-hidden="true">' +
          x.n +
          "</span>" +
          '<div style="min-width:0"><p class="dp-ep-t">' +
          (x.title ? esc(x.title) : "Episode " + x.n) +
          "</p>" +
          (function (sub) {
            return sub ? '<p class="caption muted">' + esc(sub) + "</p>" : "";
          })(
            [
              x.aired
                ? "Aired " + x.aired
                : st.epsFailed && !x.title
                  ? "Title unavailable offline"
                  : "",
              x.filler ? "Filler" : "",
              x.recap ? "Recap" : "",
            ]
              .filter(Boolean)
              .join(" · "),
          ) +
          "</div>" +
          (watched
            ? '<span class="dp-ep-tag done">✓ Watched</span>'
            : next
              ? '<span class="dp-ep-tag">Up next</span>'
              : "") +
          "</li>"
        );
      })
      .join("");
    var more = "";
    if (list.length > 5 || st.epsNext) {
      more = !st.showAll
        ? '<button type="button" class="dp-link" id="dp-all-eps">Show all episodes</button>'
        : st.epsNext && !pagedEpisodes(e)
          ? '<button type="button" class="dp-link" id="dp-more-eps">' +
            (st.epsLoading ? "Loading…" : "Load more episodes") +
            "</button>"
          : '<button type="button" class="dp-link" id="dp-fewer-eps">Show fewer</button>';
    }
    var failure = st.epsFailed ? '<p class="small muted" role="status">Couldn’t load episode details. <button type="button" class="dp-link" id="dp-retry-eps"' + (st.epsLoading ? ' disabled' : '') + '>Try again</button></p>' : '';
    return '<ol class="dp-eps" aria-busy="' + st.epsLoading + '">' + items + "</ol>" + failure + more;
  }
  function section(title, html, controls) {
    return (
      '<section class="dp-sec">' + (controls ? '<div class="dp-ep-head">' : '') + '<h3 class="dp-h">' +
      title +
      "</h3>" + (controls ? controls + '</div>' : '') +
      html +
      "</section>"
    );
  }

  function render() {
    if (!st) return;
    var e = S.entry(st.id);
    if (!e) {
      U.render(
        body,
        st.loading
          ? '<div class="dp-hero skel"></div><div class="dp-pad stack gap-16"><div class="skel" style="height:32px;width:70%"></div><div class="skel" style="height:80px"></div></div>'
          : '<div class="dp-pad" style="padding-top:72px"><h2 id="dp-title" class="h2">We couldn’t load this anime</h2><p class="body muted">Check your connection and try again.</p></div>',
      );
      return;
    }
    U.render(
      body,
      '<div class="dp-hero">' +
        (e.image
          ? '<img src="' + esc(e.image) + '" alt="">'
          : U.art(e, { noImg: true })) +
        "</div>" +
        '<div class="dp-pad">' +
        '<div class="dp-head"><h2 id="dp-title" class="dp-title">' +
        esc(e.title) +
        "</h2>" +
        (e.jp ? '<p class="dp-jp">' + esc(e.jp) + "</p>" : "") +
        "</div>" +
        stats(e) +
        (e.genres.length
          ? '<div class="dp-genres"><span class="dp-label">Genres</span><div class="dp-tags">' +
            e.genres
              .map(function (g) {
                return '<span class="dp-tag">' + esc(g) + "</span>";
              })
              .join("") +
            "</div></div>"
          : "") +
        section("Synopsis", synopsis(e)) +
        section("Your Library", watchlist(e)) +
        section("Details", info(e)) +
        section("Trailer", trailer(e)) +
        section(
          "Episodes" +
            (e.episodes
              ? ' <span class="muted">· ' + e.episodes + "</span>"
              : ""),
          episodes(e),
          episodePagination(e),
        ) +
        (st.failed
          ? '<p class="notice small" role="status">' +
            icon("wifiOff", 18) +
            "<span>Couldn’t reach MyAnimeList, so some details may be missing.</span></p>"
          : "") +
        "</div>",
    );
  }

  /* ---------- loading ---------- */
  function load(id) {
    J.full(id)
      .then(function (a) {
        var keep = D.catalog[String(id)];
        if (keep) {
          delete a.title;
          delete a.season;
          delete a.genres;
        } // keep curated names for sample titles
        S.cacheAnime(a);
      })
      .catch(function () {
        if (st && st.id === id) st.failed = true;
      })
      .then(function () {
        if (st && st.id === id) {
          st.loading = false;
          render();
        }
      });
    var current = st;
    loadEpisodes(id, 1).then(function (ok) {
      if (ok && st === current && st.showAll && pagedEpisodes(S.entry(id))) changeEpisodePage(1);
    });
  }
  function loadEpisodes(id, page) {
    var current = st;
    current.epsLoading = true;
    current.epsFailed = false;
    render();
    return J.episodes(id, page)
      .then(function (r) {
        if (st !== current) return false;
        current.eps = current.eps.concat(r.items);
        current.epsNext = r.hasNext;
        current.epsPage = page;
        return true;
      })
      .catch(function () {
        if (st === current) current.epsFailed = true;
        return false;
      })
      .then(function (ok) {
        if (st === current) {
          current.epsLoading = false;
          render();
        }
        return ok;
      });
  }
  function changeEpisodePage(page) {
    if (!st || st.epsLoading || page < 1) return;
    st.epsRetryPage = page;
    var current = st, e = S.entry(st.id);
    var start = (page - 1) * EPISODE_PAGE_SIZE;
    var target = Math.min(page * EPISODE_PAGE_SIZE, e.episodes || Infinity);
    function finish() {
      if (st !== current) return;
      if (current.eps.length > start || page === 1) current.epsViewPage = page;
      render();
      var heading = body.querySelector('.dp-ep-head');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    }
    function ensure() {
      if (st !== current) return;
      if (current.eps.length >= target || (current.eps.length && !current.epsNext)) { finish(); return; }
      return loadEpisodes(current.id, current.eps.length ? current.epsPage + 1 : 1).then(function (ok) {
        if (st !== current || !ok) return;
        if (current.epsNext && current.eps.length < target) return ensure();
        finish();
      });
    }
    return ensure();
  }

  /* ---------- open / close ---------- */
  function open(id, from) {
    var same = st && st.id === id && isOpen();
    opener = from || document.activeElement;
    if (!same) {
      st = fresh(id);
      scroller.scrollTop = 0;
      render();
      load(id);
    }
    if (!isOpen()) {
      saveScroll();
      // Push the history entry before the layout changes, so the browser records the
      // page's real scroll position and Back returns to it
      if (!pushed) {
        history.pushState(
          { nekaiPanel: id },
          "",
          location.pathname + location.search + "#anime-" + id,
        );
        pushed = true;
      } else
        history.replaceState(
          { nekaiPanel: id },
          "",
          location.pathname + location.search + "#anime-" + id,
        );
      document.documentElement.classList.add("dp-open");
      host.classList.add("is-open");
      // Narrow screens swap the content for the details, so start the page at the top
      if (getComputedStyle(mainEl() || host).display === "none")
        window.scrollTo({ top: 0, behavior: "instant" });
      setTimeout(function () {
        panel.focus({ preventScroll: true });
      }, 30);
    } else
      history.replaceState(
        { nekaiPanel: id },
        "",
        location.pathname + location.search + "#anime-" + id,
      );
  }
  function isOpen() {
    return host.classList.contains("is-open");
  }
  function close(fromHistory) {
    if (!isOpen()) return;
    host.classList.remove("is-open");
    document.documentElement.classList.remove("dp-open");
    restoreScroll();
    st && (st.trailerOn = false);
    render(); // stop any playing trailer
    if (pushed && !fromHistory) {
      pushed = false;
      history.back();
    } else {
      pushed = false;
      if (location.hash.indexOf("#anime-") === 0)
        history.replaceState(null, "", location.pathname + location.search);
    }
    if (opener && document.contains(opener))
      opener.focus({ preventScroll: true });
  }

  // Intercept every details link on the page (titles, posters, View details)
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest('a[href^="#anime-"]');
    if (
      !a ||
      ev.defaultPrevented ||
      ev.button !== 0 ||
      ev.metaKey ||
      ev.ctrlKey ||
      ev.shiftKey ||
      ev.altKey
    )
      return;
    var id = Number(a.getAttribute("href").slice(7)); // "#anime-".length
    if (!id) return;
    ev.preventDefault();
    open(
      id,
      a.getAttribute("tabindex") === "-1"
        ? (a.closest("article") &&
            a.closest("article").querySelector(".title-link")) ||
            a
        : a,
    );
  });

  host.addEventListener("click", function (ev) {
    if (ev.target.closest("[data-dp-close]")) {
      close();
      return;
    }
    var t = ev.target.closest("button");
    if (!t || !st || t.disabled) return;
    if (t.hasAttribute("data-ep-page")) {
      changeEpisodePage(Number(t.dataset.epPage));
      return;
    }
    if (t.id === "dp-retry-eps") {
      changeEpisodePage(st.epsRetryPage);
      return;
    }
    if (t.id === "dp-more") {
      st.more = !st.more;
      render();
    }
    if (t.id === "dp-play") {
      st.trailerOn = true;
      render();
    }
    if (t.id === "dp-all-eps") {
      st.showAll = true;
      st.epsViewPage = 1;
      render();
      if (pagedEpisodes(S.entry(st.id))) changeEpisodePage(1);
    }
    if (t.id === "dp-fewer-eps") {
      st.showAll = false;
      st.epsViewPage = 1;
      render();
    }
    if (t.id === "dp-more-eps" && !st.epsLoading)
      loadEpisodes(st.id, st.epsPage + 1);
    if (t.id === "dp-review-cancel") {
      st.reviewDraft = null; // back to the saved review
      render();
      document.getElementById("dp-review").focus();
      return;
    }
    if (t.id === "dp-review-save") {
      var had = S.entry(st.id).note,
        text = st.reviewDraft || "";
      st.reviewDraft = null;
      var undo = S.setNote(st.id, text);
      U.toast(
        (text.trim() ? (had ? "Review updated for " : "Review saved for ") : "Review deleted for ") +
          S.anime(st.id).title,
        undo,
      );
      document.getElementById("dp-review").focus();
      return;
    }
    if (t.id === "dp-add") {
      var a = S.anime(st.id),
        r = S.add(st.id, st.addAs);
      if (r.firstCompletion) {
        U.confetti();
        U.sound("done");
      }
      U.toast(a.title + " added to " + D.statuses[st.addAs].label, r.undo);
    }
  });
  // Keep the review draft in state so a re-render (e.g. logging an episode) doesn't lose it
  host.addEventListener("input", function (ev) {
    if (ev.target.id === "dp-review" && st) {
      st.reviewDraft = ev.target.value;
      var off = !reviewChanged(S.entry(st.id));
      document.getElementById("dp-review-count").textContent = reviewCount(st.reviewDraft);
      document.getElementById("dp-review-save").disabled = off;
      document.getElementById("dp-review-cancel").disabled = off;
    }
  });
  host.addEventListener("change", function (ev) {
    if (ev.target.id === "dp-add-as" && st) st.addAs = ev.target.value;
  });

  // Esc closes. There's no focus trap: the content beside the panel stays usable.
  document.addEventListener(
    "keydown",
    function (ev) {
      if (!isOpen() || ev.key !== "Escape") return;
      ev.stopPropagation();
      close();
    },
    true,
  );

  window.addEventListener("popstate", function (ev) {
    var id = ev.state && ev.state.nekaiPanel;
    if (id) {
      pushed = true;
      open(id);
    } else close(true);
  });
  S.subscribe(function () {
    if (isOpen()) render();
  });

  // Deep link: page.html#anime-52991 opens straight into the panel (on load, or when only the hash changes)
  var m = /^#anime-(\d+)$/.exec(location.hash);
  if (m) {
    history.replaceState(null, "", location.pathname + location.search);
    open(Number(m[1]));
  }
  window.addEventListener("hashchange", function () {
    var h = /^#anime-(\d+)$/.exec(location.hash);
    if (h && !(isOpen() && st && st.id === Number(h[1]))) {
      pushed = true;
      open(Number(h[1]));
    } // this entry already exists, so Back closes it
  });

  NEKAI.panel = { open: open, close: close };
})();
