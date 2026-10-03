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

  // The page's content column (beside the panel)
  function mainEl() {
    return document.querySelector(".app > .main");
  }
  // Remembers where the page was, so closing the panel returns there
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

  // Panel state for a newly opened anime: loading flags, episode paging and toggles
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
  // 1234567 → "1.2M", 45200 → "45K"
  function compact(n) {
    return n >= 1e6
      ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
      : n >= 1e3
        ? Math.round(n / 1e3) + "K"
        : String(n);
  }

  /* ---------- sections ---------- */
  // The four stat tiles under the header: score, type, episodes, year
  function stats(e) {
    var status = e.airing
      ? "Airing"
      : e.statusText === "Not yet aired"
        ? "Upcoming"
        : e.statusText
          ? "Finished"
          : "";
    // Four quiet fields: a small label, the value with its icon beside it, and a detail line
    // (kept even when empty, so every value sits at the same height)
    var cell = function (label, value, sub, extra, prefix) {
      return (
        '<div class="dp-stat' + (extra ? " " + extra : "") + '">' +
        '<span class="dp-label">' + esc(label) + "</span>" +
        '<strong class="dp-val">' + (prefix || "") + esc(value) + "</strong>" +
        '<span class="dp-sub">' + (sub ? esc(sub) : "&nbsp;") + "</span>" +
        "</div>"
      );
    };
    return (
      '<div class="dp-stats">' +
      cell("Score", e.scoreText, e.members ? compact(e.members) + " members" : "Not rated yet", "is-score", U.star(16, "#F25C05")) +
      cell("Type", e.type || "TV", "", "", icon("tv", 14, 2.4)) +
      cell("Episodes", e.episodes ? e.episodes.toLocaleString("en-US") : e.ongoing && e.aired ? e.aired.toLocaleString("en-US") : "?", e.episodes ? "" : e.airing ? "so far" : "", "", icon("film", 14, 2.4)) +
      cell("Year", e.year || "–", status, e.airing ? "is-airing" : "", icon("calendar", 14, 2.4)) +
      "</div>"
    );
  }
  // Seasons: one chip per season in order. The one you're viewing is orange; seasons you've
  // completed are muted grey with a check; one you're watching (not this one) has an orange dot
  function seasons(e) {
    var ids = e.seasonIds || [];
    var chips = ids.map(function (sid, i) {
      var s = S.entry(sid) || {};
      var here = Number(sid) === Number(e.id);
      var cls = here ? " is-current" : s.status === "completed" ? " is-done" : "";
      var mark = s.status === "completed" ? icon("check", 14, 3)
        : s.status === "watching" && !here ? '<span class="dp-season-dot" aria-hidden="true"></span>' : "";
      var said = s.status === "completed" ? ", completed" : s.status === "watching" ? ", watching" : "";
      return '<a class="dp-season' + cls + '" href="#anime-' + sid + '"' + (here ? ' aria-current="true"' : "") +
        ' title="' + esc(s.title || "Season " + (i + 1)) + '" aria-label="Season ' + (i + 1) + said + '">' + mark + "Season " + (i + 1) + "</a>";
    }).join("");
    // "Also: Side Story · Summary · Summary 2": numbered when a kind repeats; the real name shows on hover
    var seen = {};
    var also = ((e.rel && e.rel.other) || []).slice(0, 4).map(function (o) {
      seen[o.relation] = (seen[o.relation] || 0) + 1;
      var label = o.relation + (seen[o.relation] > 1 ? " " + seen[o.relation] : "");
      return '<a href="#anime-' + o.id + '" title="' + esc(o.name) + '">' + esc(label) + "</a>";
    });
    return '<div class="dp-seasons">' + chips + "</div>" +
      (also.length ? '<p class="dp-also">Also: ' + also.join('<span aria-hidden="true"> · </span>') + "</p>" : "");
  }
  // The synopsis, clamped with Read more when long; skeleton lines while loading
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
  // Not on the list: an Add to Library control. On the list: status, rating, episodes and review.
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
    // Status and your rating side by side, then episodes, then your review
    return (
      '<div class="dp-lib-row">' +
        '<div class="dp-field dp-grow"><label class="dp-field-label" for="dp-st">Status</label>' +
        '<div class="l-status" data-status="' + e.status + '">' + U.statusSelect(e, "dp-st") + "</div></div>" +
        '<div class="dp-field"><span class="dp-field-label">Rating</span>' + U.ratingBtn(e) + "</div>" +
      "</div>" +
      '<div class="dp-field"><span class="dp-field-label" id="dp-eps-label">Episodes</span>' +
      '<div class="dp-prog" role="group" aria-labelledby="dp-eps-label">' + U.stepper(e) + "</div></div>" +
      review(e)
    );
  }
  // The "Your library" card: your own space, softly raised, headed like the panel's other sections
  function libraryCard(e) {
    return (
      '<section class="dp-lib" aria-labelledby="dp-lib-h">' +
      '<h3 id="dp-lib-h" class="dp-h">Your library</h3>' +
      watchlist(e) +
      "</section>"
    );
  }
  // Review text box: holds the saved review until you type (st.reviewDraft stays null until then)
  function reviewDraft(e) {
    return st.reviewDraft != null ? st.reviewDraft : e.note || "";
  }
  // True when the box differs from the saved review (enables Save and Cancel)
  function reviewChanged(e) {
    return reviewDraft(e).trim() !== (e.note || "");
  }
  // "123 / 2,000" above the review box
  function reviewCount(text) {
    return text.length.toLocaleString("en-US") + " / 2,000";
  }
  // Personal review: always an editable box under the rating (plain text, up to 2000 characters).
  // Save review saves a new review or an edit; saving an empty box deletes it.
  function review(e) {
    var draft = reviewDraft(e),
      off = reviewChanged(e) ? "" : " disabled";
    return (
      '<div class="dp-field"><div class="dp-field-head"><label class="dp-field-label" for="dp-review">Your review</label>' +
      '<span id="dp-review-count" class="dp-count">' + reviewCount(draft) + "</span></div>" +
      '<textarea id="dp-review" class="dp-review-text" rows="4" maxlength="2000" aria-describedby="dp-review-count" placeholder="What did you think? Favorite moments, characters, how it made you feel…">' +
      esc(draft) +
      "</textarea>" +
      // Save / Cancel are dimmed until the review differs from what's saved
      '<div class="dp-review-actions">' +
      '<button type="button" id="dp-review-cancel" class="btn btn-ghost"' + off + ">Cancel</button>" +
      '<button type="button" id="dp-review-save" class="btn btn-primary"' + off + ">Save review</button></div></div>"
    );
  }
  // The Details list; rows with no value are left out
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
  var FULLSCREEN_ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"></path></svg>';
  // A thumbnail button first; the YouTube player (youtube-nocookie) only loads once it's clicked
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
    var yt = "https://www.youtube.com/watch?v=" + encodeURIComponent(e.trailer);
    if (st.trailerOn)
      return (
        '<div class="dp-trailer">' +
        // fullscreen is granted to the player; our own Full screen button works even where YouTube's is blocked
        '<div class="trailer" id="dp-trailer-frame"><iframe src="https://www.youtube-nocookie.com/embed/' +
        encodeURIComponent(e.trailer) +
        '?autoplay=1&rel=0" title="' +
        esc(e.title) +
        ' trailer" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>' +
        '<div class="dp-trailer-bar">' +
        '<button type="button" class="dp-trailer-btn" id="dp-trailer-fs">' + FULLSCREEN_ICON + "Full screen</button>" +
        '<a class="dp-trailer-btn" href="' + yt + '" target="_blank" rel="noopener">' + icon("external", 16, 2.2) + "Watch on YouTube</a>" +
        "</div></div>"
      );
    return (
      '<button type="button" class="trailer" id="dp-play" aria-label="Play the official trailer for ' +
      esc(e.title) +
      '">' +
      (e.trailerThumb
        ? '<img class="trailer-thumb" src="' + esc(e.trailerThumb) + '" alt="">'
        : "") +
      '<span class="dp-play-btn" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"></path></svg></span>' +
      '<span class="dp-trailer-cap" aria-hidden="true"><strong>Official trailer</strong><span>YouTube</span></span></button>'
    );
  }
  // Episodes: 5 at first; Show all lists them, and long shows page through 50 at a time
  var EPISODE_PAGE_SIZE = 50;
  // True when Show all is on and the show has more than one page of episodes
  function pagedEpisodes(e) {
    return st.showAll && (e.episodes > EPISODE_PAGE_SIZE || st.eps.length > EPISODE_PAGE_SIZE || st.epsNext);
  }
  // Previous / Next buttons for a paged episode list
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
  // The episode list, marking watched episodes and the next one.
  // Placeholder rows (Episode n) stand in until the titles arrive.
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
          (watched ? " watched" : next ? " next" : "") +
          '"><span class="dp-ep-n" aria-hidden="true">E' +
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
            ? '<span class="dp-ep-check" role="img" aria-label="Watched">' + icon("check", 14, 3) + "</span>"
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
  // A panel section with its heading; controls sit beside the heading
  function section(title, html, controls) {
    return (
      '<section class="dp-sec">' + (controls ? '<div class="dp-ep-head">' : '') + '<h3 class="dp-h">' +
      title +
      "</h3>" + (controls ? controls + '</div>' : '') +
      html +
      "</section>"
    );
  }

  // Draws the whole panel for st.id. Runs again after every store change while the panel is open.
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
        // poster overlapping the banner, title beside it (the AniList / Letterboxd header pattern)
        '<div class="dp-head"><div class="dp-poster" aria-hidden="true">' +
        (e.image ? '<img src="' + esc(e.image) + '" alt="">' : U.art(e, { noImg: true })) +
        '</div><div class="dp-head-text"><h2 id="dp-title" class="dp-title">' +
        esc(e.title) +
        "</h2>" +
        (e.jp ? '<p class="dp-jp">' + esc(e.jp) + "</p>" : "") +
        (e.seasonCount > 1 ? '<p class="dp-season-of">Season ' + e.seasonNo + " of " + e.seasonCount + "</p>" : "") +
        "</div></div>" +
        stats(e) +
        (e.seasonIds && e.seasonIds.length > 1 ? section("Seasons", seasons(e)) : "") +
        (e.genres.length
          ? '<div class="dp-genres"><h3 class="dp-h">Genres</h3><div class="dp-tags">' +
            e.genres
              .map(function (g) {
                return '<span class="dp-tag">' + esc(g) + "</span>";
              })
              .join("") +
            "</div></div>"
          : "") +
        section("Synopsis", synopsis(e)) +
        libraryCard(e) +
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
  // Fetches full details, then seasons; the first page of episodes loads alongside
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
        return J.seasons(id).then(function () {
          if (st && st.id === id) render();
        }).catch(function () {});
      });
    var current = st;
    loadEpisodes(id, 1).then(function (ok) {
      if (ok && st === current && st.showAll && pagedEpisodes(S.entry(id))) changeEpisodePage(1);
    });
  }
  // Appends one page of episodes from Tenrai and resolves true on success.
  // The answer is ignored if another anime was opened meanwhile (st !== current).
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
  // Shows page n of the episode list, fetching Tenrai pages until enough episodes are loaded
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
  // Opens anime id in the panel (or switches to it) and adds a history entry, so Back closes it.
  // from: the element that gets focus back on close.
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
  // fromHistory: Back already left the panel's history entry, so don't step back again
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
    if (t.id === "dp-trailer-fs") {
      var frame = document.getElementById("dp-trailer-frame");
      var go = frame && (frame.requestFullscreen || frame.webkitRequestFullscreen);
      if (go) go.call(frame);
      return;
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
