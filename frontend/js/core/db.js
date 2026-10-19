/* NEKAI data connection
 * Signs users in and keeps their data in NEKAI's PostgreSQL database, through the
 * backend's API (/api/auth, /api/me, /api/catalog). The session is an HttpOnly cookie,
 * so this file never sees or stores a token; the server only ever returns the
 * signed-in user's own rows.
 *
 * load() reads everything the pages need into the store's state shape, and sync()
 * compares the state with what was last saved and sends only what changed.
 */
(function () {
  "use strict";
  window.NEKAI = window.NEKAI || {};

  var user = null;
  var saved = null; // JSON copy of the state as last saved to the database
  var writes = Promise.resolve(); // writes run one after another, in order
  var pending = 0; // batches of writes not finished yet
  var failListeners = [];
  var TZ = (function () {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Manila"; } catch (e) { return "Asia/Manila"; }
  })();

  // Achievement names in the app <-> achievement_id values allowed by the database
  var ACHIEVEMENTS = ["First Steps", "Finisher", "Critic", "Binge Mode", "Explorer", "Week Streak", "Finisher II", "Long Haul"];
  function achievementId(name) { return String(name).toLowerCase().replace(/\s+/g, "_"); }
  var ACHIEVEMENT_NAMES = {};
  ACHIEVEMENTS.forEach(function (n) { ACHIEVEMENT_NAMES[achievementId(n)] = n; });

  // Calls the backend: resolves with the JSON answer, or rejects with an Error carrying the
  // server's message and HTTP status. A body that is a Blob (a picture) is sent as it is.
  // When the session has run out, the page goes to sign-in instead of failing quietly.
  function api(method, url, body) {
    var init = { method: method, credentials: "same-origin", headers: {} };
    if (body instanceof Blob) {
      init.body = body;
      init.headers["Content-Type"] = body.type;
    } else if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers["Content-Type"] = "application/json";
    }
    return fetch(url, init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.ok) return data;
        var err = new Error(data.error || "Something went wrong. Please try again.");
        err.status = res.status;
        if (res.status === 401 && user && url.indexOf("/api/auth/") !== 0) {
          user = null;
          forget();
          location.replace("signin.html");
        }
        throw err;
      });
    });
  }

  function chunks(list, n) {
    var out = [];
    for (var i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
    return out;
  }
  function time(iso) { return iso ? Date.parse(iso) : 0; }
  function iso(ms) { return new Date(ms || Date.now()).toISOString(); }

  /* ---------- reading ---------- */
  // Loads the account's data and makes it the saved copy that sync() compares against
  function load() {
    return fetchState().then(function (state) {
      adopt(state);
      return state;
    });
  }
  // Takes freshly loaded data as the saved copy (and this tab's copy, below)
  function adopt(state) {
    saved = JSON.parse(JSON.stringify(state));
    writeCache(state, true);
  }

  /* ---------- this tab's copy of the account data ----------
     Kept in sessionStorage (this tab only, gone when it closes) so the next page can draw at once
     instead of waiting for the server; start.js then refreshes it in the background. It holds the
     latest data and the saved copy sync() compares against, so saving carries on exactly where
     the last page left off. Cleared on sign-out. */
  var CACHE = "nekai:cache", cacheTimer = null, cacheState = null;
  function writeCache(state, now) {
    cacheState = state;
    clearTimeout(cacheTimer);
    if (now) flushCache();
    else cacheTimer = setTimeout(flushCache, 250); // many quick changes (+1, +1, +1) write once
  }
  function flushCache() {
    clearTimeout(cacheTimer);
    if (!cacheState || !user || !saved) return;
    try {
      sessionStorage.setItem(CACHE, JSON.stringify({ uid: user.id, at: Date.now(), state: cacheState, saved: saved }));
    } catch (e) {
      /* storage full or unavailable: the next page just loads from the server */
    }
  }
  // the tab is being left: write any change still waiting
  window.addEventListener("pagehide", flushCache);
  // This tab's copy for the signed-in user, or null
  function cached() {
    try {
      var c = JSON.parse(sessionStorage.getItem(CACHE));
      return c && user && c.uid === user.id && c.state && c.saved ? c : null;
    } catch (e) {
      return null;
    }
  }
  // Starts this page from the tab's copy: its saved copy becomes sync()'s starting point
  function useCache(c) {
    saved = c.saved;
    cacheState = c.state;
    return c.state;
  }
  // Signed out (here or in another tab): forget this tab's copy and the sidebar snapshot (ui.js)
  function forget() {
    try {
      sessionStorage.removeItem(CACHE);
      localStorage.removeItem("nekai:shell");
    } catch (e) { /* storage unavailable */ }
  }
  // Signing out writes nekai:signout; the other open tabs hear it and forget their copies too
  var SIGNOUT = "nekai:signout";
  window.addEventListener("storage", function (e) {
    if (e.key === SIGNOUT) forget();
  });
  function announceSignOut() {
    try { localStorage.setItem(SIGNOUT, String(Date.now())); } catch (e) { /* storage unavailable */ }
  }

  function fetchState() {
    return api("GET", "/api/me").then(function (r) {
      user = r.user || user;
      var p = r.profile || {}, s = r.settings || {};
      var state = {
        list: {},
        log: {},
        logBy: {},
        earned: {},
        hidden: {},
        recs: null,
        anime: {},
        profile: {
          name: p.display_name || "",
          email: user.email || "",
          bio: p.bio || "",
          avatar: p.avatar_url || "", // the uploaded picture's URL (/avatars/…), or none
          since: new Date(p.created_at || user.created_at || Date.now()).getFullYear(),
        },
        favGenres: p.favorite_genres || [],
        onboarding: !p.onboarding_completed,
        firstHome: !p.first_home_seen,
        settings: {
          sound: !!s.sound, confetti: s.confetti !== false, neko: s.neko !== false, streak: s.streak !== false,
          motion: !!s.motion, text: !!s.text, contrast: !!s.contrast, dark: !!s.dark,
        },
        ui: {
          navOpen: s.nav_open !== false,
          nekoHidden: !!s.neko_hidden,
          libraryView: s.library_view || "list",
          streakNudged: s.streak_nudged_on || undefined,
        },
        signedIn: true,
      };
      r.anime.forEach(function (row) {
        state.list[String(row.anime_id)] = {
          status: row.status,
          watched: row.watched,
          rating: Number(row.rating) || 0,
          note: row.note || "",
          completedOnce: !!row.completed_once,
          updatedAt: time(row.updated_at),
        };
      });
      // History is stored as individual events; the app works with per-day totals
      r.events.forEach(function (ev) {
        var day = ev.activity_date, id = String(ev.anime_id || 0);
        var byDay = (state.logBy[day] = state.logBy[day] || {});
        byDay[id] = (byDay[id] || 0) + ev.episode_delta;
      });
      Object.keys(state.logBy).forEach(function (day) {
        var total = 0;
        Object.keys(state.logBy[day]).forEach(function (id) {
          if (!state.logBy[day][id]) delete state.logBy[day][id];
          else total += state.logBy[day][id];
        });
        if (total > 0) state.log[day] = total;
      });
      r.achievements.forEach(function (a) {
        var name = ACHIEVEMENT_NAMES[a.achievement_id];
        if (name) state.earned[name] = time(a.earned_at);
      });
      r.hidden.forEach(function (h) { state.hidden[String(h.anime_id)] = true; });
      if (r.recs) state.recs = { at: time(r.recs.generated_at), key: r.recs.input_key, items: r.recs.items || [] };
      // Settings remember the user's time zone for their watch history
      if (r.settings && s.timezone !== TZ) api("POST", "/api/me/changes", { settings: { timezone: TZ } }).catch(function () {});
      return loadAnime(state).then(function () {
        return state;
      });
    });
  }

  // Titles, posters and details for every anime the user's data mentions
  function loadAnime(state) {
    var ids = {};
    Object.keys(state.list).concat(Object.keys(state.hidden)).forEach(function (id) { ids[id] = true; });
    ((state.recs && state.recs.items) || []).forEach(function (x) { ids[String(x.id)] = true; });
    var all = Object.keys(ids);
    return Promise.all(chunks(all, 150).map(function (part) {
      return api("GET", "/api/catalog?ids=" + part.join(","));
    })).then(function (parts) {
      parts.forEach(function (found) {
        Object.keys(found).forEach(function (id) {
          state.anime[id] = Object.assign({}, found[id], { id: Number(id) });
        });
      });
      // Not in the catalog yet: a placeholder until Tenrai fills it in (tenrai.hydrate)
      var curated = (NEKAI.data && NEKAI.data.catalog) || {};
      all.forEach(function (id) {
        if (!state.anime[id] && !curated[id]) state.anime[id] = { id: Number(id), title: "Loading…", stub: true };
      });
    });
  }

  /* ---------- writing ---------- */
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  // Everything that changed between two states, as one POST /api/me/changes body (or null).
  // The server saves it in a single transaction: all of it, or none of it.
  function changes(prev, next) {
    var out = {}, any = false;
    function put(key, value) { out[key] = value; any = true; }
    function animeRow(id, e, deleted) {
      return {
        anime_id: Number(id), status: e.status, watched: e.watched || 0, rating: e.rating || 0,
        note: e.note || "", completed_once: !!e.completedOnce, deleted: deleted,
      };
    }

    // Library (a removed title is kept, marked deleted)
    var anime = [];
    Object.keys(next.list).forEach(function (id) {
      if (!same(prev.list[id], next.list[id])) anime.push(animeRow(id, next.list[id], false));
    });
    Object.keys(prev.list).forEach(function (id) {
      if (!next.list[id]) anime.push(animeRow(id, prev.list[id], true));
    });
    if (anime.length) put("anime", anime);

    // Watch history: one event per day and anime whose episode count changed
    var events = [];
    Object.keys(Object.assign({}, prev.logBy, next.logBy)).forEach(function (day) {
      var a = prev.logBy[day] || {}, b = next.logBy[day] || {};
      Object.keys(Object.assign({}, a, b)).forEach(function (id) {
        var delta = (b[id] || 0) - (a[id] || 0);
        if (!delta || !Number(id)) return;
        events.push({ anime_id: Number(id), episode_delta: delta, activity_date: day, timezone: TZ });
      });
    });
    if (events.length) put("events", events);

    // Achievements (kept once earned)
    var earned = Object.keys(next.earned).filter(function (n) {
      return prev.earned[n] == null && ACHIEVEMENT_NAMES[achievementId(n)];
    }).map(function (n) {
      return { achievement_id: achievementId(n), earned_at: next.earned[n] ? iso(next.earned[n]) : null };
    });
    if (earned.length) put("achievements", earned);

    // Not interested
    var hidden = [];
    Object.keys(Object.assign({}, prev.hidden, next.hidden)).forEach(function (id) {
      if (!!prev.hidden[id] !== !!next.hidden[id]) hidden.push({ anime_id: Number(id), hidden: !!next.hidden[id] });
    });
    if (hidden.length) put("hidden", hidden);

    // AI picks
    if (next.recs && !same(prev.recs, next.recs)) {
      put("recs", { input_key: next.recs.key || "", generated_at: iso(next.recs.at), items: next.recs.items || [] });
    }

    // Settings and layout
    var set = {};
    ["sound", "confetti", "neko", "streak", "motion", "text", "contrast", "dark"].forEach(function (k) {
      if (!!prev.settings[k] !== !!next.settings[k]) set[k] = !!next.settings[k];
    });
    var pu = prev.ui || {}, nu = next.ui || {};
    if (pu.navOpen !== nu.navOpen) set.nav_open = nu.navOpen !== false;
    if (pu.nekoHidden !== nu.nekoHidden) set.neko_hidden = !!nu.nekoHidden;
    if (pu.libraryView !== nu.libraryView) set.library_view = nu.libraryView === "cards" ? "cards" : "list";
    if (pu.streakNudged !== nu.streakNudged) set.streak_nudged_on = nu.streakNudged || null;
    if (Object.keys(set).length) put("settings", set);

    // Profile
    var prof = {};
    if (prev.profile.name !== next.profile.name) prof.display_name = String(next.profile.name || "").slice(0, 100);
    if (prev.profile.bio !== next.profile.bio) prof.bio = String(next.profile.bio || "").slice(0, 160);
    if (!same(prev.favGenres, next.favGenres)) prof.favorite_genres = (next.favGenres || []).slice(0, 3);
    if (prev.onboarding !== next.onboarding) prof.onboarding_completed = !next.onboarding;
    if (prev.firstHome !== next.firstHome) prof.first_home_seen = !next.firstHome;
    if ((prev.profile.avatar || "") !== (next.profile.avatar || "")) prof.avatar_url = next.profile.avatar || null;
    if (Object.keys(prof).length) put("profile", prof);

    return any ? out : null;
  }

  // Saves what changed since the last sync. Runs after every store change.
  function sync(state) {
    if (!user || !saved) return writes;
    var next = JSON.parse(JSON.stringify(state));
    var body = changes(saved, next);
    saved = next;
    writeCache(state);
    if (!body) return writes;
    pending++;
    writes = writes.then(function () {
      return api("POST", "/api/me/changes", body);
    }).catch(function (err) {
      console.error("Saving your changes failed:", err);
      failListeners.forEach(function (fn) { fn(err); });
    }).then(function () {
      pending--;
    });
    return writes;
  }
  // Leaving the page while a change is still saving would lose it: ask first
  window.addEventListener("beforeunload", function (e) {
    if (pending) e.preventDefault();
  });

  /* ---------- profile picture ----------
     The server keeps one picture per user and gives each upload a new file name,
     so browsers never show a cached old picture. */
  // Uploads a picture (a Blob) and resolves with its URL
  function uploadAvatar(blob) {
    return api("PUT", "/api/me/avatar", blob).then(function (r) { return r.url; });
  }
  // Deletes the user's picture (the profile's avatar_url is cleared too)
  function removeAvatar() {
    return api("DELETE", "/api/me/avatar");
  }

  /* ---------- Neko chats ---------- */
  var neko = {
    // The latest open conversation and its messages: { id, messages: [{ id, role, text }] }
    latest: function () {
      if (!user) return Promise.resolve({ id: null, messages: [] });
      return api("GET", "/api/me/neko");
    },
    // Starts a conversation and resolves with its id
    start: function (title) {
      return api("POST", "/api/me/neko", { title: String(title || "Neko chat").trim().slice(0, 120) || "Neko chat" })
        .then(function (r) { return r.id; });
    },
    add: function (conversationId, msg) {
      return api("POST", "/api/me/neko/" + encodeURIComponent(conversationId) + "/messages", { id: msg.id, role: msg.role, text: msg.text });
    },
    // Clearing a chat keeps it in history, marked deleted
    clear: function (conversationId) {
      if (!conversationId) return Promise.resolve();
      return api("DELETE", "/api/me/neko/" + encodeURIComponent(conversationId));
    },
  };

  /* ---------- accounts ----------
     Each resolves with the signed-in user (the server sets the session cookie),
     or rejects with an Error holding a message that's ready to show. */
  function signedIn(r) {
    user = r.user;
    return user;
  }
  var auth = {
    register: function (name, email, password) {
      return api("POST", "/api/auth/register", { name: name, email: email, password: password }).then(signedIn);
    },
    login: function (email, password) {
      return api("POST", "/api/auth/login", { email: email, password: password }).then(signedIn);
    },
    // Emails a reset link (the server answers the same whether or not the email has an account)
    forgot: function (email) {
      return api("POST", "/api/auth/forgot", { email: email });
    },
    // Sets a new password from the reset link's token, and signs in
    reset: function (token, password) {
      return api("POST", "/api/auth/reset", { token: token, password: password }).then(signedIn);
    },
    changeEmail: function (email) {
      return api("PUT", "/api/auth/email", { email: email }).then(signedIn);
    },
  };

  NEKAI.db = {
    get user() { return user; },
    // Resolves with the signed-in user, or null
    session: function () {
      return api("GET", "/api/auth/session").then(function (r) {
        user = r.user || null;
        return user;
      });
    },
    load: load,
    // the page-to-page fast path (start.js): this tab's copy, and a background refresh
    cached: cached,
    useCache: useCache,
    refresh: fetchState, // fresh data from the server, without touching the saved copy
    adopt: adopt,
    forget: forget,
    sync: sync,
    // fn(error) runs when a save fails
    onSaveError: function (fn) { failListeners.push(fn); },
    flush: function () { return writes; },
    uploadAvatar: uploadAvatar,
    removeAvatar: removeAvatar,
    neko: neko,
    auth: auth,
    // Deletes the account and everything in it, then forgets this browser's copies
    deleteAccount: function () {
      return writes.then(function () { return api("DELETE", "/api/account"); }).then(function () {
        user = null;
        forget();
        announceSignOut();
      });
    },
    signOut: function () {
      return writes.then(function () {
        forget();
        announceSignOut();
        return api("POST", "/api/auth/logout").catch(function () {});
      }).then(function () {
        user = null;
      });
    },
  };
})();
