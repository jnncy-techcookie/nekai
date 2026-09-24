/* NEKAI Tenrai client (https://api.tenrai.org/documentation)
 * Tenrai v1 provides MyAnimeList anime data with the response fields NEKAI expects.
 * Requests are spaced ~400ms apart, retried once on HTTP 429, and cached
 * in memory for the session. The backend also queues upstream requests.
 */
(function () {
  "use strict";
  var BASE = "/api/tenrai";
  var GAP = 400;
  var queue = Promise.resolve();
  var last = 0;
  var memo = {};

  function wait(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  function request(path) {
    if (memo[path]) return memo[path];
    var p = (queue = queue
      .then(function () {
        var delay = Math.max(0, last + GAP - Date.now());
        return wait(delay);
      })
      .then(function attempt(retry) {
        last = Date.now();
        return fetch(BASE + path, {
          headers: { Accept: "application/json" },
        }).then(function (res) {
          if (res.status === 429 && retry !== false)
            return wait(1200).then(function () {
              return attempt(false);
            });
          if (!res.ok) throw new Error("Tenrai responded " + res.status);
          return res.json();
        });
      }));
    memo[path] = p;
    p.catch(function () {
      delete memo[path];
    });
    // keep the queue alive even if this request fails
    queue = p.catch(function () {});
    return p;
  }

  function cap(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
  }

  function youtubeId(t) {
    if (!t) return "";
    if (t.youtube_id) return t.youtube_id;
    var m = /embed\/([\w-]{6,})/.exec(t.embed_url || "");
    return m ? m[1] : "";
  }

  /* Map a Tenrai anime object onto NEKAI's shape */
  function normalize(j) {
    var img =
      (j.images &&
        ((j.images.webp && j.images.webp.large_image_url) ||
          (j.images.jpg && j.images.jpg.large_image_url))) ||
      "";
    var year =
      j.year ||
      (j.aired &&
        j.aired.prop &&
        j.aired.prop.from &&
        j.aired.prop.from.year) ||
      "";
    return {
      id: j.mal_id,
      title: j.title_english || j.title,
      jp: j.title_japanese || "",
      type: j.type || "",
      episodes: j.episodes || null,
      studio: (j.studios && j.studios[0] && j.studios[0].name) || "",
      studios: (j.studios || [])
        .map(function (x) {
          return x.name;
        })
        .join(", "),
      members: j.members || null,
      rank: j.rank || null,
      popularity: j.popularity || null,
      duration: j.duration || "",
      ageRating: j.rating || "", // e.g. "PG-13"; not "rating", which is the user's own 1–5 stars
      source: j.source || "",
      season: j.season ? cap(j.season) + " " + year : String(year || ""),
      year: year ? String(year) : "",
      score: j.score != null ? j.score : null,
      genres: (j.genres || []).map(function (g) {
        return g.name;
      }),
      airing: !!j.airing,
      statusText: j.status || "",
      aired: (j.aired && j.aired.string) || "",
      synopsis: (j.synopsis || "").replace(
        /\s*\[Written by MAL Rewrite\]\s*$/,
        "",
      ),
      image: img,
      trailer: youtubeId(j.trailer),
      trailerThumb:
        (j.trailer &&
          j.trailer.images &&
          (j.trailer.images.maximum_image_url ||
            j.trailer.images.large_image_url)) ||
        "",
    };
  }

  NEKAI.tenrai = {
    normalize: normalize,
    /* Search by title; opts.type = ["TV","Movie",...], opts.genre = genre name */
    search: function (q, opts) {
      opts = opts || {};
      var params = [
        "q=" + encodeURIComponent(q),
        "limit=24",
        "sfw=true",
        "order_by=members",
        "sort=desc",
      ];
      if (opts.type && opts.type.length === 1)
        params.push("type=" + opts.type[0].toLowerCase());
      if (opts.genre && NEKAI.data.genreIds[opts.genre])
        params.push("genres=" + NEKAI.data.genreIds[opts.genre]);
      return request("/anime?" + params.join("&")).then(function (r) {
        var list = (r.data || []).map(normalize);
        if (opts.type && opts.type.length > 1)
          list = list.filter(function (a) {
            return opts.type.indexOf(a.type) >= 0;
          });
        return list;
      });
    },
    /* Top-scored titles for a set of genre names (used by the random picker) */
    byGenres: function (names) {
      var idsParam = names
        .map(function (n) {
          return NEKAI.data.genreIds[n];
        })
        .filter(Boolean);
      if (!idsParam.length) return Promise.resolve([]);
      // Query one genre at a time and merge results from all selected genres
      return Promise.all(
        idsParam.map(function (gid) {
          return request(
            "/anime?genres=" +
              gid +
              "&order_by=score&sort=desc&limit=25&sfw=true&min_score=7.5",
          ).then(function (r) {
            return (r.data || []).map(normalize);
          });
        }),
      ).then(function (lists) {
        var seen = {},
          out = [];
        lists.forEach(function (l) {
          l.forEach(function (a) {
            if (!seen[a.id]) {
              seen[a.id] = 1;
              out.push(a);
            }
          });
        });
        return out;
      });
    },
    /* Top-rated shows airing right now (Discover → Popular) */
    popular: function () {
      return request("/top/anime?filter=airing&limit=15&sfw=true").then(
        function (r) {
          return (r.data || []).map(normalize);
        },
      );
    },
    full: function (id) {
      return request("/anime/" + id + "/full").then(function (r) {
        return normalize(r.data);
      });
    },
    episodes: function (id, page) {
      return request("/anime/" + id + "/episodes?page=" + (page || 1)).then(
        function (r) {
          return {
            hasNext: !!(r.pagination && r.pagination.has_next_page),
            items: (r.data || []).map(function (e) {
              return {
                n: e.mal_id,
                title: e.title || "",
                aired: e.aired ? String(e.aired).slice(0, 10) : "",
                filler: !!e.filler,
                recap: !!e.recap,
              };
            }),
          };
        },
      );
    },
    /* Fill in real poster images for titles we only have placeholder art for */
    hydrate: function (ids, onEach) {
      var todo = ids
        .filter(function (id) {
          var a = NEKAI.store.anime(id);
          return a && !a.image;
        })
        .slice(0, 30);
      return todo.reduce(function (p, id) {
        return p.then(function () {
          return request("/anime/" + id)
            .then(function (r) {
              var n = normalize(r.data);
              // keep our curated title/season text, take the poster, score and synopsis
              NEKAI.store.cacheAnime({
                id: n.id,
                image: n.image,
                score: n.score,
                synopsis: n.synopsis,
                trailer: n.trailer,
                statusText: n.statusText,
              });
              if (onEach) onEach(id);
            })
            .catch(function () {});
        });
      }, Promise.resolve());
    },
  };
})();
