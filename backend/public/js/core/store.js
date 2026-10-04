/* NEKAI store
 * The signed-in user's data, loaded from Supabase by start.js before the page runs.
 * Every change is saved back to Supabase (NEKAI.db.sync), notifies subscribers so
 * pages can re-render, and returns an undo function.
 */
(function () {
  "use strict";
  var DISPLAY_KEY = "nekai:display"; // this device's layout and theme, read by boot.js before the first paint
  var D = NEKAI.data;
  var listeners = [];
  var unlockListeners = [];
  var version = 0; // counts the user's changes on this page (start.js checks it before a background refresh)
  var state = load();
  // Keep this device's copy of the theme in step with the account as soon as it loads (not only after
  // a change): otherwise dark mode set on another device, or before accounts, would paint light first
  // on every page, then switch to dark. Signed out (the sign-in page) there's no account to copy.
  if (NEKAI.startState) saveDisplay();

  // "YYYY-MM-DD" in local time: the key for a day in the watch log
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
  // The day key for n days before today
  function daysAgo(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    return dayKey(d);
  }

  // An empty state (signed out). Signed-in pages start from NEKAI.startState instead.
  function seed() {
    return {
      list: {},
      anime: {},
      hidden: {},
      recs: null, // AI picks: { at, key, items: [{ id, why, fit }] }
      earned: {}, // achievement name -> time it was unlocked (0: unlock time unknown)
      log: {}, // day -> episodes watched that day
      logBy: {}, // day -> { anime id -> episodes }: what the log is made of, saved as watch events
      ui: { navOpen: true, nekoHidden: false },
      profile: { name: "", handle: "", email: "", bio: "", since: new Date().getFullYear() },
      settings: {
        sound: false,
        confetti: true,
        neko: true,
        streak: true,
        motion: false,
        text: false,
        contrast: false,
        dark: false,
      },
      signedIn: false,
      favGenres: [], // the 3 genres picked at sign-up: the AI's starting point before any history
      onboarding: false, // true from sign-up until those genres are picked
      firstHome: false, // Home greets a new account with "Welcome" once, then "Welcome back"
    };
  }

  // The signed-in user's data that start.js loaded from Supabase, or an empty state when signed out
  function load() {
    return NEKAI.startState ? Object.assign(seed(), NEKAI.startState) : seed();
  }
  // Saves the changes to Supabase (NEKAI.db.sync), and this device's layout and theme to
  // localStorage so boot.js can apply them before the next page paints
  function save() {
    if (NEKAI.db) NEKAI.db.sync(state);
    saveDisplay();
  }
  // This device's copy of the layout and theme, for boot.js to apply before the first paint
  function saveDisplay() {
    try {
      localStorage.setItem(DISPLAY_KEY, JSON.stringify({
        navOpen: state.ui.navOpen !== false,
        motion: !!state.settings.motion,
        dark: !!state.settings.dark,
      }));
    } catch (e) {
      /* storage unavailable: the page just paints with default layout first */
    }
  }
  // After every change: record newly met achievements, save, re-render subscribers, then announce unlocks
  function emit() {
    version++;
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
  // Undo works by snapshot: an action saves the state as JSON first, and undo restores it whole
  function snapshot() {
    return JSON.stringify(state);
  }
  function undoTo(snap) {
    return function () {
      var earned = state.earned; // achievements stay earned (they are saved for good)
      state = JSON.parse(snap);
      state.earned = earned;
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
  // Merges anime metadata (from Tenrai) into state.anime. Empty values are skipped,
  // so a partial answer never wipes fields we already have.
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
  // Ids on the list that have metadata, optionally filtered by filterFn(listEntry, id)
  function ids(filterFn) {
    return Object.keys(state.list).filter(function (id) {
      return anime(id) && (!filterFn || filterFn(state.list[id], id));
    });
  }
  // How many titles are in each status
  function counts() {
    var c = { watching: 0, plan: 0, completed: 0, dropped: 0 };
    Object.keys(state.list).forEach(function (id) {
      var s = state.list[id].status;
      if (c[s] != null) c[s]++;
    });
    return c;
  }
  // Adds n episodes of anime id (or removes, when negative) to today's watch log; a day at 0 is dropped.
  // Only episodes logged today for that anime can be taken back.
  function logToday(n, id) {
    var k = dayKey();
    id = String(id);
    var byDay = (state.logBy[k] = state.logBy[k] || {});
    var before = byDay[id] || 0,
      v = Math.max(0, before + n);
    if (v) byDay[id] = v;
    else delete byDay[id];
    if (!Object.keys(byDay).length) delete state.logBy[k];
    var total = Math.max(0, (state.log[k] || 0) + (v - before));
    if (total) state.log[k] = total;
    else delete state.log[k];
  }
  // The status change itself, without saving: adjusts episodes and the watch log to match.
  // Returns true when this is the title's first completion. Used by setStatus and setStatusMany.
  function applyStatus(id, status) {
    var a = anime(id),
      e = state.list[String(id)] || {};
    var patch = { status: status };
    var first = false;
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
        logToday(patch.watched - (e.watched || 0), id);
    }
    touch(id, patch);
    return first;
  }
  // Updates (or creates) a list entry and stamps updatedAt. New entries start as Plan to Watch.
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

  /* ---------- XP, levels and titles ---------- */
  var XP_RULES = {
    episode: 2,
    completed: 50,
    rating: 5,
    review: 10, // a rated show with a written review earns both
    badge: 25,
    streakDay: 5, // × the day of the streak it continues (day 1: 5, day 2: 10, …)
    streakCap: 10, // … up to 50 XP a day from day 10 on
  };
  // XP needed to go from level n to n + 1
  function levelCost(n) {
    return 500 + 100 * (n - 1);
  }
  // [first level, title]: each title covers the levels up to the next one.
  // After Legend, a new rank every 10 levels, ending at Legend X (Legendary).
  var LEVEL_TITLES = [
    [1, "Newcomer"],
    [3, "Casual Viewer"],
    [5, "Regular"],
    [8, "Weekend Binger"],
    [11, "Enthusiast"],
    [15, "Seasoned Viewer"],
    [19, "Otaku in Training"],
    [23, "Veteran"],
    [27, "Sensei"],
    [30, "Legend"],
  ];
  ["II", "III", "IV", "V", "VI", "VII", "VIII", "IX"].forEach(function (r, i) {
    LEVEL_TITLES.push([40 + 10 * i, "Legend " + r]);
  });
  LEVEL_TITLES.push([120, "Legendary"]);
  // The title for a level: the last LEVEL_TITLES entry it has reached
  function levelTitle(level) {
    return LEVEL_TITLES.reduce(function (t, x) {
      return level >= x[0] ? x[1] : t;
    }, LEVEL_TITLES[0][1]);
  }

  // ---------- public API: NEKAI.store ----------
  // List actions return an undo function (or { undo, … }) for the toast's Undo button.
  var api = {
    get state() {
      return state;
    },
    get version() {
      return version;
    },
    // Swaps in newer account data (a background refresh, see start.js) and redraws the page.
    // Nothing is saved: the data came from Supabase. Anime details already loaded here are kept.
    replace: function (next) {
      var anime = Object.assign({}, next.anime || {}, state.anime);
      state = Object.assign(seed(), next, { anime: anime });
      saveDisplay();
      listeners.forEach(function (fn) {
        fn(state);
      });
    },
    // fn(state) runs after every change
    subscribe: function (fn) {
      listeners.push(fn);
    },
    // fn(achievements) runs after a change unlocks one or more achievements
    onUnlock: function (fn) {
      unlockListeners.push(fn);
    },
    xpRules: XP_RULES,
    levelTitles: LEVEL_TITLES,
    dayKey: dayKey,
    daysAgo: daysAgo,
    anime: anime,
    entry: entry,
    ids: ids,
    counts: counts,
    // Saves metadata without notifying subscribers (no re-render)
    cacheAnime: function (a) {
      cacheAnime(a);
      save();
    },
    cacheMany: function (arr) {
      arr.forEach(cacheAnime);
      save();
    },

    // Adds a title as status (Plan to Watch by default). meta: anime data to cache first,
    // for titles from search. Adding as Completed counts every episode as watched.
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
    // Removes a title from the list (its cached metadata stays)
    remove: function (id) {
      var snap = snapshot();
      delete state.list[String(id)];
      emit();
      return undoTo(snap);
    },
    // Moves a title to another status, adjusting episodes and the watch log to match.
    // Returns { undo, firstCompletion, streakUp }.
    setStatus: function (id, status) {
      var snap = snapshot();
      var wasLogged = !!state.log[dayKey()];
      var first = applyStatus(id, status);
      emit();
      return {
        undo: undoTo(snap),
        firstCompletion: first,
        streakUp: !wasLogged && !!state.log[dayKey()],
      };
    },
    // Bulk versions for the Library's multi-select: one change, one save and one Undo for the lot.
    // setStatusMany returns { undo, firstCompletion, moved } (moved: how many actually changed status).
    setStatusMany: function (ids, status) {
      var snap = snapshot();
      var first = false, moved = 0;
      ids.forEach(function (id) {
        var e = state.list[String(id)];
        if (!e || e.status === status) return;
        if (applyStatus(id, status)) first = true;
        moved++;
      });
      emit();
      return { undo: undoTo(snap), firstCompletion: first, moved: moved };
    },
    removeMany: function (ids) {
      var snap = snapshot();
      ids.forEach(function (id) {
        delete state.list[String(id)];
      });
      emit();
      return undoTo(snap);
    },
    // +1 episode: logs it for today (streak), starts a planned show and completes it on the last episode.
    // Returns null when it can't go up, else { undo, watched, finished, firstCompletion, streakUp }.
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
      logToday(1, id);
      emit();
      return {
        undo: undoTo(snap),
        watched: e.watched + 1,
        finished: finished,
        firstCompletion: first,
        streakUp: !wasLogged, // first episode today: the streak just grew by a day
      };
    },
    // −1 episode: takes one back from today's log. Back at 0, Watching returns to Plan to Watch.
    dec: function (id) {
      var snap = snapshot();
      var e = entry(id);
      if (!e || !e.canDec) return null;
      var patch = { watched: e.watched - 1 };
      // Nothing watched any more, so it belongs back in Plan to Watch
      if (patch.watched === 0 && e.status === "watching") patch.status = "plan";
      touch(id, patch);
      // Take back one of today's logged episodes (an episode from an earlier day stays in history)
      logToday(-1, id);
      emit();
      return undoTo(snap);
    },
    // Same as setStatus(id, "completed")
    complete: function (id) {
      return api.setStatus(id, "completed");
    },
    // Personal review / note (plain text, trimmed, up to 2000 characters; empty removes it)
    setNote: function (id, text) {
      var snap = snapshot();
      touch(id, { note: String(text || "").trim().slice(0, 2000) });
      emit();
      return undoTo(snap);
    },
    // n: 1–10 with at most one decimal (0 clears the rating)
    rate: function (id, n) {
      var snap = snapshot();
      n = Math.round(Math.min(10, Math.max(0, Number(n) || 0)) * 10) / 10;
      touch(id, { rating: n });
      emit();
      return undoTo(snap);
    },
    // "Not interested": hides a title from picks and Popular, and the AI is told to avoid it
    hide: function (id) {
      var snap = snapshot();
      state.hidden[String(id)] = true;
      emit();
      return undoTo(snap);
    },
    // Saves the AI picks (from services/recommend.js)
    setRecs: function (recs) {
      state.recs = recs;
      emit();
    },
    // Layout preferences (sidebar, Library view…): saved quietly, no re-render
    setUi: function (patch) {
      Object.assign(state.ui, patch);
      save();
    },
    // Settings switches (sound, confetti, Neko, dark mode…)
    setSettings: function (patch) {
      Object.assign(state.settings, patch);
      emit();
    },
    // Name, handle, email and bio
    setProfile: function (patch) {
      Object.assign(state.profile, patch);
      emit();
    },
    // Home has greeted a new account once
    seenHome: function () {
      if (!state.firstHome) return;
      state.firstHome = false;
      save();
    },
    // The genres picked at sign-up (finishes onboarding)
    setFavGenres: function (list) {
      state.favGenres = list.slice(0, 3);
      state.onboarding = false;
      emit();
    },

    /* ---------- derived stats ---------- */
    // The current streak: consecutive logged days up to today, or up to yesterday while
    // today has nothing logged yet (today stays open until midnight)
    streak: function () {
      var n = 0,
        i = state.log[dayKey()] ? 0 : 1; // today not logged yet keeps yesterday's streak alive
      while (state.log[daysAgo(i)]) {
        n++;
        i++;
      }
      return { current: n, loggedToday: !!state.log[dayKey()] };
    },
    // The longest run of consecutive logged days ever (Week Streak, Profile)
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
    // The most episodes logged on one day (Binge Mode)
    maxDay: function () {
      return Object.keys(state.log).reduce(function (m, k) {
        return Math.max(m, state.log[k]);
      }, 0);
    },
    // Episodes watched, how many titles are rated and the mean rating
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
    /* XP from every source (see XP_RULES), the level it reaches and that level's title.
       Level n costs 500 + 100 × (n − 1) XP to finish, so each level takes a little longer. */
    xp: function () {
      var t = api.totals(),
        c = counts(),
        R = XP_RULES;
      var reviews = Object.keys(state.list).filter(function (id) {
        return String(state.list[id].note || "").trim();
      }).length;
      var badges = Object.keys(state.earned || {}).length;
      // Streak bonus: each day you watch earns more the longer the run it continues, up to day STREAK_CAP
      var streakXp = 0,
        run = 0,
        prev = null;
      Object.keys(state.log)
        .filter(function (k) {
          return state.log[k] > 0;
        })
        .sort()
        .forEach(function (k) {
          var d = new Date(k + "T00:00:00");
          run = prev && Math.round((d - prev) / 864e5) === 1 ? run + 1 : 1;
          streakXp += R.streakDay * Math.min(run, R.streakCap);
          prev = d;
        });
      var from = {
        episodes: t.episodes * R.episode,
        completed: c.completed * R.completed,
        ratings: t.rated * R.rating,
        reviews: reviews * R.review,
        badges: badges * R.badge,
        streaks: streakXp,
      };
      var xp = Object.keys(from).reduce(function (s, k) {
        return s + from[k];
      }, 0);
      var level = 1,
        into = xp;
      while (into >= levelCost(level)) {
        into -= levelCost(level);
        level++;
      }
      var next = LEVEL_TITLES.filter(function (x) {
        return x[0] > level;
      })[0];
      return {
        xp: xp,
        level: level,
        into: into,
        need: levelCost(level),
        title: levelTitle(level),
        nextTitle: next ? { level: next[0], title: next[1] } : null,
        from: from,
      };
    },
    // Every achievement with met / earned / earnedAt, and a progress line while locked.
    // To add one, add an A(glyph, name, description, badge color, condition, progress) entry below.
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
    // Each genre's share of the titles you've started (top 6, the rest as "Other"), in percent
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
      if (!total) {
        var fav = state.favGenres || [];
        if (!fav.length) return 50;
        var hits = (a.genres || []).filter(function (g) { return fav.indexOf(g) >= 0; }).length;
        return [48, 68, 80, 90][Math.min(3, hits)];
      }
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
  // Achievements already met when the page loads (e.g. one not saved yet) are recorded without a toast
  if (recordUnlocks(0).length) save();
  NEKAI.store = api;
})();
