/* NEKAI store
 * All user data lives in localStorage under one key. Every change notifies
 * subscribers so pages can re-render, and returns an undo function.
 */
(function () {
  "use strict";
  var KEY = "nekai:v1";
  var D = NEKAI.data;
  var listeners = [];
  var unlockListeners = [];
  var state = load();

  function dayKey(d) {
    var x = d || new Date();
    return (
      x.getFullYear() +
      "-" +
      String(x.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(x.getDate()).padStart(2, "0")
    );
  }
  function daysAgo(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    return dayKey(d);
  }

  function seed() {
    var list = {};
    var now = Date.now();
    D.seedList.forEach(function (s, i) {
      list[s.id] = {
        status: s.status,
        watched: s.watched,
        rating: s.rating * 2, // sample data is written out of 5; ratings are stored out of 10
        updatedAt: now - i * 3600e3,
        completedOnce: s.status === "completed",
      };
    });
    // A believable watch history: a 5-day streak ending yesterday,
    // a 14-day run last month and one 12-episode binge day.
    var log = {};
    for (var i = 1; i <= 5; i++) log[daysAgo(i)] = 2 + (i % 3);
    for (var j = 30; j < 44; j++) log[daysAgo(j)] = 1 + (j % 2);
    log[daysAgo(21)] = 12;
    return {
      v: 1,
      ratingScale: 10,
      list: list,
      anime: {},
      hidden: {},
      recs: null, // AI picks: { at, key, items: [{ id, why, fit }] }
      earned: {}, // achievement name -> time it was unlocked (0: already earned before times were saved)
      log: log,
      ui: { navOpen: true, lolliHidden: false },
      profile: {
        name: "Niko",
        handle: "niko",
        email: "niko@example.com",
        bio: "Fantasy journeys, cooking anime, and anything with a good opening song.",
        since: 2024,
      },
      settings: {
        sound: false,
        confetti: true,
        lolli: true,
        streak: true,
        motion: false,
        text: false,
        contrast: false,
      },
      signedIn: true,
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.v === 1) {
          // Ratings used to be whole stars out of 5; convert once to the 1–10 scale
          if (s.ratingScale !== 10) {
            Object.keys(s.list || {}).forEach(function (id) {
              if (s.list[id].rating) s.list[id].rating = s.list[id].rating * 2;
            });
            s.ratingScale = 10;
          }
          // Preserve the saved view when upgrading to the Library setting name.
          if (s.ui && Object.prototype.hasOwnProperty.call(s.ui, "myAnimeView")) {
            if (s.ui.libraryView == null) s.ui.libraryView = s.ui.myAnimeView;
            delete s.ui.myAnimeView;
          }
          return Object.assign(seed(), s);
        }
      }
    } catch (e) {
      /* storage unavailable: fall back to an in-memory seed */
    }
    return seed();
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      /* quota or privacy mode */
    }
  }
  function emit() {
    var unlocked = recordUnlocks(Date.now());
    save();
    listeners.forEach(function (fn) {
      fn(state);
    });
    if (unlocked.length)
      unlockListeners.forEach(function (fn) {
        fn(unlocked);
      });
  }
  // Saves the time of every achievement that is met but not saved yet, and returns those achievements.
  // Once saved, an achievement stays earned even if its condition stops holding (e.g. a broken streak).
  function recordUnlocks(at) {
    return api.achievements().filter(function (a) {
      if (!a.met || state.earned[a.name] != null) return false;
      state.earned[a.name] = at;
      return true;
    });
  }
  function snapshot() {
    return JSON.stringify(state);
  }
  function undoTo(snap) {
    return function () {
      state = JSON.parse(snap);
      emit();
    };
  }

  /* ---------- anime metadata ---------- */
  function anime(id) {
    id = String(id);
    var base = D.catalog[id] || null;
    var cached = state.anime[id] || null;
    if (!base && !cached) return null;
    var a = Object.assign({}, base || {}, cached || {});
    a.id = Number(id);
    a.art = (base && base.art) || artFor(a.id); // never trust a cached copy: keeps art on the current palette
    a.genres = a.genres || [];
    a.year = a.year || (a.season ? String(a.season).split(" ").pop() : "");
    a.mainGenre = a.genres[0] || a.type || "";
    a.epsText = a.episodes
      ? a.episodes + " eps"
      : a.airing
        ? "Ongoing"
        : "? eps";
    a.scoreText = a.score != null ? Number(a.score).toFixed(1) : "–";
    a.synopsis = a.synopsis || D.synopses[id] || "";
    return a;
  }
  // Brand placeholder art for titles that came from search (deterministic by id)
  function artFor(id) {
    var pal = [
      ["#1F3FA6", "#FAF3E6", "#FFA25C", "#FFFBF2"],
      ["#FFD3B3", "#F25C05", "#1F3FA6", "#0F1F5C"],
      ["#FFA25C", "#F7823A", "#6F8FE8", "#0F1F5C"],
      ["#6F8FE8", "#FAF3E6", "#FFD3B3", "#0F1F5C"],
      ["#F7823A", "#0F1F5C", "#FFA25C", "#0F1F5C"],
      ["#F25C05", "#FFA25C", "#0F1F5C", "#0F1F5C"],
    ];
    var p = pal[id % pal.length];
    return {
      bg: p[0],
      c1: p[1],
      band: p[2],
      ink: p[3],
      cr: id % 2 ? "50%" : "16%",
      rot: id % 2 ? 0 : 45,
    };
  }
  function cacheAnime(a) {
    if (!a || !a.id) return;
    var id = String(a.id);
    var prev = state.anime[id] || {};
    var clean = {};
    Object.keys(a).forEach(function (k) {
      if (a[k] !== undefined && a[k] !== null && a[k] !== "") clean[k] = a[k];
    });
    state.anime[id] = Object.assign(prev, clean);
  }

  /* ---------- list entries ---------- */
  function entry(id) {
    var a = anime(id);
    if (!a) return null;
    var e = state.list[String(id)] || null;
    var watched = e ? e.watched : 0;
    var known = !!a.episodes;
    // Ongoing shows have no final count; use the episodes aired so far when we've fetched it
    var ongoing = !known && !!a.airing;
    var aired = ongoing && a.airedEps ? a.airedEps : 0;
    var pct = known
      ? Math.min(100, Math.round((watched / a.episodes) * 100))
      : aired
        ? Math.min(100, Math.round((watched / aired) * 100))
        : 0;
    return Object.assign(a, {
      inList: !!e,
      status: e ? e.status : null,
      watched: watched,
      rating: e ? e.rating : 0,
      note: (e && e.note) || "",
      updatedAt: e ? e.updatedAt : 0,
      known: known,
      ongoing: ongoing,
      aired: aired,
      pct: pct,
      isDone: !!e && e.status === "completed",
      canInc:
        !!e && e.status !== "completed" && (!known || watched < a.episodes),
      canDec: !!e && e.status !== "completed" && watched > 0,
      askComplete:
        !!e &&
        known &&
        watched >= a.episodes &&
        e.status !== "completed" &&
        e.status !== "dropped",
      stepText: known
        ? watched + " / " + a.episodes
        : aired
          ? watched.toLocaleString("en-US") + " / " + aired.toLocaleString("en-US")
          : watched.toLocaleString("en-US") + " eps",
      progText: known
        ? "Episode " + watched + " of " + a.episodes + " · " + pct + "%"
        : aired
          ? "Episode " + watched.toLocaleString("en-US") + " of " + aired.toLocaleString("en-US") + " aired so far · " + pct + "%"
          : watched.toLocaleString("en-US") + " episodes · total unknown",
    });
  }
  function ids(filterFn) {
    return Object.keys(state.list).filter(function (id) {
      return anime(id) && (!filterFn || filterFn(state.list[id], id));
    });
  }
  function counts() {
    var c = { watching: 0, plan: 0, completed: 0, dropped: 0 };
    Object.keys(state.list).forEach(function (id) {
      var s = state.list[id].status;
      if (c[s] != null) c[s]++;
    });
    return c;
  }
  // Adds n episodes (or removes, when negative) to today's watch log; a day at 0 is dropped
  function logToday(n) {
    var k = dayKey(),
      v = Math.max(0, (state.log[k] || 0) + n);
    if (v) state.log[k] = v;
    else delete state.log[k];
  }
  function touch(id, patch) {
    id = String(id);
    state.list[id] = Object.assign(
      {},
      state.list[id] || { status: "plan", watched: 0, rating: 0 },
      patch,
      { updatedAt: Date.now() },
    );
  }

  // Titles saved with every episode watched but not yet completed (from before
  // completion became automatic) are completed now, quietly, with no confetti
  Object.keys(state.list).forEach(function (id) {
    var e = state.list[id], a = anime(id);
    if (a && a.episodes && e.watched >= a.episodes && (e.status === "watching" || e.status === "plan")) {
      e.status = "completed";
      e.completedOnce = true;
    }
    // Watching with no episodes logged is really Plan to Watch
    if (e.status === "watching" && !e.watched) e.status = "plan";
  });

  var api = {
    get state() {
      return state;
    },
    subscribe: function (fn) {
      listeners.push(fn);
    },
    // fn(achievements) runs after a change unlocks one or more achievements
    onUnlock: function (fn) {
      unlockListeners.push(fn);
    },
    dayKey: dayKey,
    daysAgo: daysAgo,
    anime: anime,
    entry: entry,
    ids: ids,
    counts: counts,
    cacheAnime: function (a) {
      cacheAnime(a);
      save();
    },
    cacheMany: function (arr) {
      arr.forEach(cacheAnime);
      save();
    },

    add: function (id, status, meta) {
      var snap = snapshot();
      if (meta) cacheAnime(meta);
      var a = anime(id);
      var st = status || "plan";
      touch(id, {
        status: st,
        watched: st === "completed" && a && a.episodes ? a.episodes : 0,
        rating: 0,
        completedOnce: false,
      });
      var first = false;
      if (st === "completed") {
        first = !state.list[String(id)].completedOnce;
        state.list[String(id)].completedOnce = true;
      }
      emit();
      return { undo: undoTo(snap), firstCompletion: first };
    },
    remove: function (id) {
      var snap = snapshot();
      delete state.list[String(id)];
      emit();
      return undoTo(snap);
    },
    setStatus: function (id, status) {
      var snap = snapshot();
      var a = anime(id),
        e = state.list[String(id)] || {};
      var patch = { status: status };
      var first = false,
        wasLogged = !!state.log[dayKey()];
      // Starting a planned show or rewatching a completed one begins at episode 1; Plan to Watch means nothing watched yet
      if (
        status === "watching" &&
        (e.status === "completed" || (e.status === "plan" && !e.watched))
      )
        patch.watched = 1;
      if (status === "plan") patch.watched = 0;
      if (status === "completed") {
        if (a && a.episodes) patch.watched = a.episodes;
        first = !e.completedOnce;
        patch.completedOnce = true;
        // Finishing a show you were watching counts the remaining episodes as watched today.
        // Plan to Watch -> Completed is treated as backfilling history, so it doesn't touch the streak.
        if (e.status === "watching" && patch.watched > (e.watched || 0))
          logToday(patch.watched - (e.watched || 0));
      }
      touch(id, patch);
      emit();
      return {
        undo: undoTo(snap),
        firstCompletion: first,
        streakUp: !wasLogged && !!state.log[dayKey()],
      };
    },
    inc: function (id) {
      var snap = snapshot();
      var e = entry(id);
      if (!e || !e.canInc) return null;
      var finished = e.known && e.watched + 1 === e.episodes;
      var patch = { watched: e.watched + 1 };
      if (e.status === "plan") patch.status = "watching";
      // Logging the last episode completes the anime; there is no separate "Mark completed" step
      var first = false;
      if (finished) {
        patch.status = "completed";
        first = !state.list[String(id)].completedOnce;
        patch.completedOnce = true;
      }
      touch(id, patch);
      var wasLogged = !!state.log[dayKey()];
      logToday(1);
      emit();
      return {
        undo: undoTo(snap),
        watched: e.watched + 1,
        finished: finished,
        firstCompletion: first,
        streakUp: !wasLogged, // first episode today: the streak just grew by a day
      };
    },
    dec: function (id) {
      var snap = snapshot();
      var e = entry(id);
      if (!e || !e.canDec) return null;
      var patch = { watched: e.watched - 1 };
      // Nothing watched any more, so it belongs back in Plan to Watch
      if (patch.watched === 0 && e.status === "watching") patch.status = "plan";
      touch(id, patch);
      // Take back one of today's logged episodes (an episode from an earlier day stays in history)
      logToday(-1);
      emit();
      return undoTo(snap);
    },
    complete: function (id) {
      return api.setStatus(id, "completed");
    },
    // n: 1–10 with at most one decimal (0 clears the rating)
    // Personal review / note (plain text, trimmed, up to 2000 characters; empty removes it)
    setNote: function (id, text) {
      var snap = snapshot();
      touch(id, { note: String(text || "").trim().slice(0, 2000) });
      emit();
      return undoTo(snap);
    },
    rate: function (id, n) {
      var snap = snapshot();
      n = Math.round(Math.min(10, Math.max(0, Number(n) || 0)) * 10) / 10;
      touch(id, { rating: n });
      emit();
      return undoTo(snap);
    },
    hide: function (id) {
      var snap = snapshot();
      state.hidden[String(id)] = true;
      emit();
      return undoTo(snap);
    },
    setRecs: function (recs) {
      state.recs = recs;
      emit();
    },
    setUi: function (patch) {
      Object.assign(state.ui, patch);
      save();
    },
    setSettings: function (patch) {
      Object.assign(state.settings, patch);
      emit();
    },
    setProfile: function (patch) {
      Object.assign(state.profile, patch);
      emit();
    },
    setSignedIn: function (v) {
      state.signedIn = v;
      save();
    },
    reset: function () {
      try {
        localStorage.removeItem(KEY);
      } catch (e) {}
      state = seed();
      state.signedIn = false;
      recordUnlocks(0); // the sample list's badges count as already earned, with no toast
      save();
    },

    /* ---------- derived stats ---------- */
    streak: function () {
      var n = 0,
        i = state.log[dayKey()] ? 0 : 1; // today not logged yet keeps yesterday's streak alive
      while (state.log[daysAgo(i)]) {
        n++;
        i++;
      }
      return { current: n, loggedToday: !!state.log[dayKey()] };
    },
    longestStreak: function () {
      var days = Object.keys(state.log)
        .filter(function (k) {
          return state.log[k] > 0;
        })
        .sort();
      var best = 0,
        run = 0,
        prev = null;
      days.forEach(function (k) {
        var d = new Date(k + "T00:00:00");
        run = prev && (d - prev) / 864e5 === 1 ? run + 1 : 1;
        best = Math.max(best, run);
        prev = d;
      });
      return best;
    },
    maxDay: function () {
      return Object.keys(state.log).reduce(function (m, k) {
        return Math.max(m, state.log[k]);
      }, 0);
    },
    totals: function () {
      var eps = 0,
        rated = 0,
        sum = 0;
      Object.keys(state.list).forEach(function (id) {
        var e = state.list[id];
        eps += e.watched || 0;
        if (e.rating) {
          rated++;
          sum += e.rating;
        }
      });
      return {
        episodes: eps,
        rated: rated,
        mean: rated ? Math.round((sum / rated) * 10) / 10 : 0,
      };
    },
    xp: function () {
      var t = api.totals(),
        c = counts();
      var xp = t.episodes * 2 + c.completed * 50 + t.rated * 5;
      return {
        xp: xp,
        level: Math.floor(xp / 500) + 1,
        into: xp % 500,
        need: 500,
      };
    },
    achievements: function () {
      var c = counts(),
        t = api.totals(),
        st = api.streak().current,
        list = state.list;
      var genres = {};
      var longHaul = false;
      Object.keys(list).forEach(function (id) {
        var a = anime(id);
        if (!a || list[id].status === "plan") return;
        a.genres.forEach(function (g) {
          genres[g] = 1;
        });
        if (list[id].status === "completed" && a.episodes >= 100)
          longHaul = true;
      });
      var ng = Object.keys(genres).length,
        n = Object.keys(list).length,
        maxDay = api.maxDay(),
        saved = state.earned || {};
      // met: the condition holds right now. earned: met now or unlocked before (saved in state.earned)
      function A(glyph, name, desc, bg, ok, progress) {
        var at = saved[name];
        return {
          glyph: glyph,
          name: name,
          desc: desc,
          bg: bg,
          met: ok,
          earned: ok || at != null,
          earnedAt: at || 0,
          progress: ok || at != null ? "" : progress,
        };
      }
      return [
        A(
          "始",
          "First Steps",
          "Added your first anime",
          "#FFA25C",
          n >= 1,
          "0 / 1 added",
        ),
        A(
          "完",
          "Finisher",
          "Completed 5 anime",
          "#F25C05",
          c.completed >= 5,
          c.completed + " / 5 completed",
        ),
        A(
          "★",
          "Critic",
          "Rated 10 anime",
          "#FFD3B3",
          t.rated >= 10,
          t.rated + " / 10 rated",
        ),
        A(
          "12",
          "Binge Mode",
          "12 episodes in one day",
          "#6F8FE8",
          maxDay >= 12,
          "Best day: " + maxDay + " / 12",
        ),
        A(
          "探",
          "Explorer",
          "Watched 5 genres",
          "#1F3FA6",
          ng >= 5,
          ng + " / 5 genres",
        ),
        A(
          "7",
          "Week Streak",
          "Watch 7 days in a row",
          "#F7823A",
          api.longestStreak() >= 7, // any 7-day run counts, not only the current one
          st + " / 7 days",
        ),
        A(
          "10",
          "Finisher II",
          "Complete 10 anime",
          "#FFA25C",
          c.completed >= 10,
          c.completed + " / 10 completed",
        ),
        A(
          "∞",
          "Long Haul",
          "Finish a 100+ episode series",
          "#FFD3B3",
          longHaul,
          "Keep going on a long one",
        ),
      ];
    },
    genreMix: function () {
      var g = {},
        tot = 0;
      Object.keys(state.list).forEach(function (id) {
        var e = state.list[id],
          a = anime(id);
        if (!a || e.status === "plan") return;
        a.genres.forEach(function (x) {
          g[x] = (g[x] || 0) + 1;
          tot++;
        });
      });
      var top = Object.keys(g)
        .sort(function (a, b) {
          return g[b] - g[a];
        })
        .slice(0, 6);
      var out = top.map(function (n) {
        return { name: n, pct: Math.round((100 * g[n]) / tot) };
      });
      var rest =
        100 -
        out.reduce(function (s, x) {
          return s + x.pct;
        }, 0);
      if (rest > 0) out.push({ name: "Other", pct: rest });
      return out;
    },
    /* Match %: genre overlap (60%), genres you rated highly (30%), finish vs drop history (10%) */
    match: function (a) {
      var count = {},
        ratingSum = {},
        ratingN = {},
        drops = {},
        total = 0;
      Object.keys(state.list).forEach(function (id) {
        var e = state.list[id],
          x = anime(id);
        if (!x || e.status === "plan") return;
        x.genres.forEach(function (g) {
          count[g] = (count[g] || 0) + 1;
          total++;
          if (e.status === "dropped") drops[g] = (drops[g] || 0) + 1;
          if (e.rating) {
            ratingSum[g] = (ratingSum[g] || 0) + e.rating;
            ratingN[g] = (ratingN[g] || 0) + 1;
          }
        });
      });
      if (!total) return 50;
      // Overlap: how much of your viewing the title's genres cover, relative to your top three genres
      var top3 = Object.keys(count)
        .map(function (g) {
          return count[g];
        })
        .sort(function (x, y) {
          return y - x;
        })
        .slice(0, 3)
        .reduce(function (s, n) {
          return s + n;
        }, 0);
      var gs = a.genres && a.genres.length ? a.genres : [];
      var covered = gs.reduce(function (s, g) {
        return s + (count[g] || 0);
      }, 0);
      var overlap = Math.min(1, covered / top3);
      var rated = 0,
        hist = 0;
      gs.forEach(function (g) {
        rated += ratingN[g] ? ratingSum[g] / ratingN[g] / 10 : 0.5;
        hist += count[g] ? 1 - (drops[g] || 0) / count[g] : 0.5;
      });
      rated = gs.length ? rated / gs.length : 0.5;
      hist = gs.length ? hist / gs.length : 0.5;
      return Math.round(35 + 60 * (0.6 * overlap + 0.3 * rated + 0.1 * hist));
    },
    /* AI picks: the history-based match above (60%) blended with the AI's own fit estimate (40%) */
    blendMatch: function (a, fit) {
      var f = Math.min(100, Math.max(0, Number(fit) || 0));
      return Math.round(0.6 * api.match(a) + 0.4 * f);
    },
    /* The most recently unlocked achievement (list order breaks ties between ones earned before times were saved) */
    latestAchievement: function () {
      return api
        .achievements()
        .filter(function (a) {
          return a.earned;
        })
        .reduce(function (best, a) {
          return !best || a.earnedAt >= best.earnedAt ? a : best;
        }, null);
    },
  };
  // Achievements already met when the page loads (older saves, the sample list) are recorded without a toast
  if (recordUnlocks(0).length) save();
  NEKAI.store = api;
})();
