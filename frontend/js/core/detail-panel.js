/* NEKAI detail side panel
 * Any link to anime.html?id=… opens that anime in a panel on the right instead of
 * leaving the page (like Chrome's image side panel). Ctrl/⌘/middle-click still
 * opens the full page. Closes with the X, Esc, the backdrop or the browser Back button.
 */
(function () {
  "use strict";
  var S = NEKAI.store,
    U = NEKAI.ui,
    D = NEKAI.data,
    J = NEKAI.jikan,
    esc = U.esc,
    icon = U.icon;

  var host = document.createElement("div");
  host.innerHTML =
    '<div class="dp-scrim" data-dp-close></div>' +
    '<aside class="dp" role="dialog" aria-modal="true" aria-labelledby="dp-title" tabindex="-1">' +
    '<button type="button" class="dp-close" data-dp-close aria-label="Close details" title="Close (Esc)">' +
    icon("x", 20, 2.6) +
    "</button>" +
    '<div class="dp-scroll my-list"><div id="dp-body"></div></div>' +
    "</aside>";
  document.body.appendChild(host);
  var panel = host.querySelector(".dp"),
    body = host.querySelector("#dp-body"),
    scroller = host.querySelector(".dp-scroll");

  var st = null; // state for the anime currently shown
  var opener = null; // element to return focus to
  var pushed = false; // whether we added a history entry

  function fresh(id) {
    return {
      id: id,
      loading: true,
      failed: false,
      eps: [],
      epsPage: 1,
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
    var cell = function (ic, top, sub) {
      return (
        '<div class="dp-stat">' +
        ic +
        "<div><strong>" +
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
        e.scoreText,
        e.members ? "(" + compact(e.members) + ")" : "Score",
      ) +
      cell(icon("tv", 20, 2.2), e.type || "TV", "") +
      cell(
        icon("film", 20, 2.2),
        e.episodes ? String(e.episodes) : "?",
        "Episodes",
      ) +
      cell(icon("calendar", 20, 2.2), e.year || "–", status) +
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
        "Add to watchlist</button></div>"
      );
    }
    return (
      '<div class="dp-prog">' +
      U.stepper(e) +

      (e.askComplete
        ? '<button type="button" class="btn btn-accent l-complete" data-act="complete" data-id="' +
          e.id +
          '">Mark completed</button>'
        : "") +
      "</div>" +
      '<div class="m-rate"><span class="m-rate-label">Your rating</span>' +
      U.stars(e) +
      "</div>" +
      '<div class="ac-foot"><div class="l-status" data-status="' +
      e.status +
      '"><label class="sr" for="dp-st">Status</label>' +
      U.statusSelect(e, "dp-st") +
      "</div>" +
      '<button type="button" class="m-del" data-act="remove" data-id="' +
      e.id +
      '" aria-label="Remove ' +
      esc(e.title) +
      ' from your list" title="Remove from list">' +
      icon("trash", 18) +
      "</button></div>"
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
  function episodes(e) {
    var list = st.eps.slice();
    if (!list.length && e.episodes && !st.epsLoading)
      for (var i = 1; i <= Math.min(e.episodes, 24); i++)
        list.push({ n: i, title: "", aired: "" });
    if (st.epsLoading && !st.eps.length)
      return (
        '<div class="stack gap-8" aria-busy="true">' +
        '<div class="skel" style="height:56px"></div>'.repeat(3) +
        "</div>"
      );
    if (!list.length)
      return '<p class="small muted">No episode list yet. It usually appears once the show starts airing.</p>';
    var shown = st.showAll ? list : list.slice(0, 5);
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
        : st.epsNext
          ? '<button type="button" class="dp-link" id="dp-more-eps">' +
            (st.epsLoading ? "Loading…" : "Load more episodes") +
            "</button>"
          : '<button type="button" class="dp-link" id="dp-fewer-eps">Show fewer</button>';
    }
    return '<ol class="dp-eps">' + items + "</ol>" + more;
  }
  function section(title, html) {
    return (
      '<section class="dp-sec"><h3 class="dp-h">' +
      title +
      "</h3>" +
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
          ? '<div class="dp-tags">' +
            e.genres
              .map(function (g) {
                return '<span class="dp-tag">' + esc(g) + "</span>";
              })
              .join("") +
            "</div>"
          : "") +
        section("Synopsis", synopsis(e)) +
        section("Your watchlist", watchlist(e)) +
        section("Details", info(e)) +
        section("Trailer", trailer(e)) +
        section(
          "Episodes" +
            (e.episodes
              ? ' <span class="muted">· ' + e.episodes + "</span>"
              : ""),
          episodes(e),
        ) +
        (st.failed
          ? '<p class="notice small" role="status">' +
            icon("wifiOff", 18) +
            "<span>Couldn’t reach MyAnimeList, so some details may be missing.</span></p>"
          : "") +
        '<a class="dp-full" href="anime.html?id=' +
        e.id +
        '" data-dp-skip>' +
        icon("external", 18) +
        "Open full page</a>" +
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
    loadEpisodes(id, 1);
  }
  function loadEpisodes(id, page) {
    st.epsLoading = true;
    render();
    J.episodes(id, page)
      .then(function (r) {
        if (!st || st.id !== id) return;
        st.eps = st.eps.concat(r.items);
        st.epsNext = r.hasNext;
        st.epsPage = page;
      })
      .catch(function () {
        if (st && st.id === id) st.epsFailed = true;
      })
      .then(function () {
        if (st && st.id === id) {
          st.epsLoading = false;
          render();
        }
      });
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
      document.documentElement.classList.add("dp-open");
      host.classList.add("is-open");
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

  // Intercept every "details" link on the page (titles, posters, See full details, View details)
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest('a[href^="anime.html?id="]');
    if (
      !a ||
      a.hasAttribute("data-dp-skip") ||
      ev.defaultPrevented ||
      ev.button !== 0 ||
      ev.metaKey ||
      ev.ctrlKey ||
      ev.shiftKey ||
      ev.altKey
    )
      return;
    var id = Number(new URL(a.href, location.href).searchParams.get("id"));
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
    if (!t || !st) return;
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
      render();
    }
    if (t.id === "dp-fewer-eps") {
      st.showAll = false;
      render();
    }
    if (t.id === "dp-more-eps" && !st.epsLoading)
      loadEpisodes(st.id, st.epsPage + 1);
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
  host.addEventListener("change", function (ev) {
    if (ev.target.id === "dp-add-as" && st) st.addAs = ev.target.value;
  });

  // Esc closes; Tab stays inside the panel while it's open
  document.addEventListener(
    "keydown",
    function (ev) {
      if (!isOpen()) return;
      if (ev.key === "Escape") {
        ev.stopPropagation();
        close();
        return;
      }
      if (ev.key !== "Tab") return;
      var f = Array.prototype.filter.call(
        panel.querySelectorAll(
          'a[href],button:not([disabled]),select,iframe,[tabindex]:not([tabindex="-1"])',
        ),
        function (x) {
          return x.offsetParent !== null;
        },
      );
      if (!f.length) return;
      var first = f[0],
        last = f[f.length - 1];
      if (
        ev.shiftKey &&
        (document.activeElement === first || document.activeElement === panel)
      ) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
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
