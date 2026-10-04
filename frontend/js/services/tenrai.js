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
  // path → Promise for this page load (a failed request is forgotten, so it can be retried)
  var memo = {};
  var seasonJobs = {}; // season chains being worked out, so two callers share one walk

  function wait(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  // GET /api/tenrai + path, queued GAP ms apart and retried once on a 429. The same path gets the same Promise.
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

  // The YouTube video id from Tenrai's trailer object (youtube_id, or taken from embed_url)
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
      ageRating: j.rating || "", // e.g. "PG-13"; not "rating", which is the user's own 1–10 score
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
      rel: relations(j.relations),
    };
  }
  // MyAnimeList keeps each season as its own entry, linked by Prequel / Sequel; the other
  // anime links (side stories, spin-offs, movies…) are kept for the panel's "Also" line
  function relations(list) {
    if (!list || !list.length) return undefined;
    var out = { prequel: [], sequel: [], other: [] };
    list.forEach(function (r) {
      (r.entry || []).forEach(function (x) {
        if (x.type !== "anime") return;
        if (r.relation === "Prequel") out.prequel.push(x.mal_id);
        else if (r.relation === "Sequel") out.sequel.push(x.mal_id);
        else if (r.relation !== "Character" && r.relation !== "Other")
          out.other.push({ id: x.mal_id, name: x.name, relation: r.relation });
      });
    });
    return out;
  }

  NEKAI.tenrai = {
    normalize: normalize,
    /* Search by title; opts.type = ["TV","Movie",...], opts.genres = Tenrai genre ids (all must match), opts.page = page number */
    search: function (q, opts) {
      opts = opts || {};
      var params = [
        "q=" + encodeURIComponent(q),
        "limit=24",
        "page=" + (opts.page || 1),
        "sfw=true",
        "order_by=members",
        "sort=desc",
      ];
      if (opts.type && opts.type.length === 1)
        params.push("type=" + opts.type[0].toLowerCase());
      if (opts.genres && opts.genres.length)
        params.push("genres=" + opts.genres.join(","));
      return request("/anime?" + params.join("&")).then(function (r) {
        var list = (r.data || []).map(normalize);
        if (opts.type && opts.type.length > 1)
          list = list.filter(function (a) {
            return opts.type.indexOf(a.type) >= 0;
          });
        return { items: list, hasNext: !!(r.pagination && r.pagination.has_next_page) };
      });
    },
    /* One page (25) of anime that have ALL the given genre ids, most popular first; no ids = every anime.
       Used by the spin wheel, which picks a random page. */
    browse: function (genreIds, page) {
      var params = ["limit=25", "page=" + (page || 1), "sfw=true", "order_by=members", "sort=desc"];
      if (genreIds && genreIds.length) params.push("genres=" + genreIds.join(","));
      return request("/anime?" + params.join("&")).then(function (r) {
        var pg = r.pagination || {};
        return {
          items: (r.data || []).map(normalize),
          lastPage: pg.last_visible_page || 1,
          total: (pg.items && pg.items.total) || (r.data || []).length,
        };
      });
    },
    /* Every anime genre on MyAnimeList with its title count: [{ id, name, count }] */
    genres: function () {
      return request("/genres/anime").then(function (r) {
        return (r.data || []).map(function (g) {
          return { id: g.mal_id, name: g.name, count: g.count || 0 };
        });
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
    // Full details (normalized) for the detail panel
    full: function (id) {
      return request("/anime/" + id + "/full").then(function (r) {
        return normalize(r.data);
      });
    },
    // One page of episodes: { items: [{ n, title, aired, filler, recap }], hasNext, lastPage }
    episodes: function (id, page) {
      return request("/anime/" + id + "/episodes?page=" + (page || 1)).then(
        function (r) {
          return {
            hasNext: !!(r.pagination && r.pagination.has_next_page),
            lastPage: (r.pagination && r.pagination.last_visible_page) || 1,
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
    /* Episodes aired so far, for ongoing shows with no final count: the episode list
       comes 100 per page, so the latest episode is the highest number on the last page */
    airedCount: function (id) {
      var self = this;
      return self.episodes(id, 1).then(function (first) {
        var last = first.lastPage > 1 ? self.episodes(id, first.lastPage) : Promise.resolve(first);
        return last.then(function (p) {
          return p.items.reduce(function (m, ep) { return Math.max(m, ep.n || 0); }, 0);
        });
      });
    },
    /* Seasons: walk the Prequel / Sequel links from a show and number the TV (and ONA)
       entries in order. Movies and specials in between are stepped over. The chain is
       saved on every season (seasonNo, seasonCount, seasonIds) and reused for a week. */
    seasons: function (id) {
      var self = this, S = NEKAI.store, D = NEKAI.data;
      var cached = S.anime(id);
      if (cached && cached.seasonsAt && Date.now() - cached.seasonsAt < 7 * 864e5)
        return Promise.resolve(cached.seasonIds || [Number(id)]);
      if (seasonJobs[id]) return seasonJobs[id];
      var isSeason = function (a) { return a.type === "TV" || a.type === "ONA"; };
      var keepBits = function (a) {
        // remember enough to show a chip (title, poster, type); curated sample titles keep their names
        var bits = { id: a.id, type: a.type, image: a.image, year: a.year, rel: a.rel };
        if (!D.catalog[String(a.id)]) bits.title = a.title;
        S.cacheAnime(bits);
      };
      // Follows the first prequel (or sequel) link, up to 10 hops, collecting season ids in order
      function walk(start, dir, acc, hops) {
        var next = start.rel && start.rel[dir][0];
        if (!next || hops >= 10) return Promise.resolve(acc);
        return self.full(next).then(function (a) {
          keepBits(a);
          if (isSeason(a)) dir === "prequel" ? acc.unshift(a.id) : acc.push(a.id);
          return walk(a, dir, acc, hops + 1);
        }).catch(function () { return acc; });
      }
      var job = self.full(id).then(function (start) {
        keepBits(start);
        if (!isSeason(start)) return [];
        return walk(start, "prequel", [], 0).then(function (before) {
          return walk(start, "sequel", [], 0).then(function (after) {
            var ids = before.concat([start.id], after);
            ids.forEach(function (sid, i) {
              S.cacheAnime({ id: sid, seasonNo: i + 1, seasonCount: ids.length, seasonIds: ids, seasonsAt: Date.now() });
            });
            return ids;
          });
        });
      });
      seasonJobs[id] = job;
      job.then(function () { delete seasonJobs[id]; }, function () { delete seasonJobs[id]; });
      return job;
    },
    /* Find seasons for a list of shows, one at a time (for the S2 / S3 badges) */
    fillSeasons: function (ids, onEach) {
      var self = this;
      var todo = ids.filter(function (id) {
        var a = NEKAI.store.anime(id);
        return a && !(a.seasonsAt && Date.now() - a.seasonsAt < 7 * 864e5);
      }).slice(0, 25);
      return todo.reduce(function (p, id) {
        return p.then(function () {
          return self.seasons(id).then(function () { if (onEach) onEach(id); }).catch(function () {});
        });
      }, Promise.resolve());
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
              // a placeholder (not in anime_catalog yet) takes everything
              if (NEKAI.store.anime(id).stub) {
                NEKAI.store.cacheAnime(Object.assign(n, { stub: false }));
                if (onEach) onEach(id);
                return;
              }
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
