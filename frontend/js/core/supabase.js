/* NEKAI Supabase connection
 * Signs users in and keeps their data in Supabase. The publishable key is meant for
 * browsers: row level security only lets each user read and write their own rows.
 *
 * load() reads everything the pages need into the store's state shape, and sync()
 * compares the state with what was last saved and writes only the rows that changed.
 */
(function () {
  "use strict";
  window.NEKAI = window.NEKAI || {};

  var SUPABASE_URL = "https://vhusawbkfjwowxjsyfud.supabase.co";
  var SUPABASE_KEY = "sb_publishable_bTgixw_0O4hCQm0T0XE8XA_VIP5IE_n";

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  var user = null;
  var saved = null; // JSON copy of the state as last written to Supabase
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

  function must(res) {
    if (res.error) throw res.error;
    return res.data;
  }
  // Reads every row of a query, 1000 at a time (Supabase's default page size)
  function readAll(build) {
    var rows = [], size = 1000;
    function page(from) {
      return build().range(from, from + size - 1).then(must).then(function (data) {
        rows = rows.concat(data || []);
        return data && data.length === size ? page(from + size) : rows;
      });
    }
    return page(0);
  }
  function chunks(list, n) {
    var out = [];
    for (var i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
    return out;
  }
  function time(iso) { return iso ? Date.parse(iso) : 0; }
  function iso(ms) { return new Date(ms || Date.now()).toISOString(); }

  /* ---------- reading ---------- */
  function load() {
    var uid = user.id;
    var eq = function (table, cols) { return function () { return sb.from(table).select(cols).eq("user_id", uid); }; };
    return Promise.all([
      sb.from("profiles").select("*").eq("user_id", uid).maybeSingle().then(must),
      sb.from("user_settings").select("*").eq("user_id", uid).maybeSingle().then(must),
      readAll(eq("user_anime", "*")),
      readAll(eq("watch_events", "anime_id, episode_delta, activity_date")),
      readAll(eq("user_achievements", "achievement_id, earned_at")),
      readAll(eq("hidden_recommendations", "anime_id, deleted_at")),
      sb.from("user_recommendations").select("*").eq("user_id", uid).maybeSingle().then(must),
    ]).then(function (r) {
      var p = r[0] || {}, s = r[1] || {};
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
          handle: p.handle || "",
          email: user.email || "",
          bio: p.bio || "",
          since: new Date(p.created_at || user.created_at || Date.now()).getFullYear(),
        },
        favGenres: p.favorite_genres || [],
        onboarding: !p.onboarding_completed,
        firstHome: !p.first_home_seen,
        settings: {
          sound: !!s.sound, confetti: s.confetti !== false, lolli: s.lolli !== false, streak: s.streak !== false,
          motion: !!s.motion, text: !!s.text, contrast: !!s.contrast, dark: !!s.dark,
        },
        ui: {
          navOpen: s.nav_open !== false,
          lolliHidden: !!s.lolli_hidden,
          libraryView: s.library_view || "list",
          streakNudged: s.streak_nudged_on || undefined,
        },
        signedIn: true,
      };
      r[2].forEach(function (row) {
        if (row.deleted_at) return;
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
      r[3].forEach(function (ev) {
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
      r[4].forEach(function (a) {
        var name = ACHIEVEMENT_NAMES[a.achievement_id];
        if (name) state.earned[name] = time(a.earned_at);
      });
      r[5].forEach(function (h) { if (!h.deleted_at) state.hidden[String(h.anime_id)] = true; });
      if (r[6]) state.recs = { at: time(r[6].generated_at), key: r[6].input_key, items: r[6].items || [] };
      // Settings remember the user's time zone for their watch history
      if (s.user_id && s.timezone !== TZ) sb.from("user_settings").update({ timezone: TZ }).eq("user_id", uid).then(function () {});
      return loadAnime(state).then(function () {
        saved = JSON.parse(JSON.stringify(state));
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
      return sb.from("anime_catalog").select("anime_id, metadata").in("anime_id", part).then(must);
    })).then(function (parts) {
      parts.forEach(function (rows) {
        rows.forEach(function (row) {
          state.anime[String(row.anime_id)] = Object.assign({}, row.metadata, { id: Number(row.anime_id) });
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

  function changes(prev, next) {
    var uid = user.id, ops = [], now = iso();

    // Library
    var anime = [];
    Object.keys(next.list).forEach(function (id) {
      if (same(prev.list[id], next.list[id])) return;
      var e = next.list[id];
      anime.push({
        user_id: uid, anime_id: Number(id), status: e.status, watched: e.watched || 0,
        rating: e.rating || 0, note: e.note || "", completed_once: !!e.completedOnce, deleted_at: null,
      });
    });
    Object.keys(prev.list).forEach(function (id) {
      if (next.list[id]) return;
      var e = prev.list[id];
      anime.push({
        user_id: uid, anime_id: Number(id), status: e.status, watched: e.watched || 0,
        rating: e.rating || 0, note: e.note || "", completed_once: !!e.completedOnce, deleted_at: now,
      });
    });
    if (anime.length) ops.push(function () { return sb.from("user_anime").upsert(anime, { onConflict: "user_id,anime_id" }); });

    // Watch history: one event per day and anime whose episode count changed
    var events = [];
    var days = Object.keys(Object.assign({}, prev.logBy, next.logBy));
    days.forEach(function (day) {
      var a = prev.logBy[day] || {}, b = next.logBy[day] || {};
      Object.keys(Object.assign({}, a, b)).forEach(function (id) {
        var delta = (b[id] || 0) - (a[id] || 0);
        if (!delta || !Number(id)) return;
        events.push({
          user_id: uid, anime_id: Number(id), event_type: delta > 0 ? "watch" : "correction",
          episode_delta: delta, activity_date: day, timezone: TZ, occurred_at: now,
        });
      });
    });
    if (events.length) ops.push(function () { return sb.from("watch_events").insert(events); });

    // Achievements (kept once earned)
    var earned = Object.keys(next.earned).filter(function (n) {
      return prev.earned[n] == null && ACHIEVEMENT_NAMES[achievementId(n)];
    }).map(function (n) {
      return { user_id: uid, achievement_id: achievementId(n), earned_at: next.earned[n] ? iso(next.earned[n]) : null };
    });
    if (earned.length) ops.push(function () {
      return sb.from("user_achievements").upsert(earned, { onConflict: "user_id,achievement_id", ignoreDuplicates: true });
    });

    // Not interested
    var hidden = [];
    Object.keys(Object.assign({}, prev.hidden, next.hidden)).forEach(function (id) {
      if (!!prev.hidden[id] === !!next.hidden[id]) return;
      hidden.push({ user_id: uid, anime_id: Number(id), deleted_at: next.hidden[id] ? null : now });
    });
    if (hidden.length) ops.push(function () { return sb.from("hidden_recommendations").upsert(hidden, { onConflict: "user_id,anime_id" }); });

    // AI picks
    if (next.recs && !same(prev.recs, next.recs)) {
      var recs = { user_id: uid, input_key: next.recs.key || "", generated_at: iso(next.recs.at), items: next.recs.items || [] };
      ops.push(function () { return sb.from("user_recommendations").upsert(recs, { onConflict: "user_id" }); });
    }

    // Settings and layout
    var set = {};
    ["sound", "confetti", "lolli", "streak", "motion", "text", "contrast", "dark"].forEach(function (k) {
      if (!!prev.settings[k] !== !!next.settings[k]) set[k] = !!next.settings[k];
    });
    var pu = prev.ui || {}, nu = next.ui || {};
    if (pu.navOpen !== nu.navOpen) set.nav_open = nu.navOpen !== false;
    if (pu.lolliHidden !== nu.lolliHidden) set.lolli_hidden = !!nu.lolliHidden;
    if (pu.libraryView !== nu.libraryView) set.library_view = nu.libraryView === "cards" ? "cards" : "list";
    if (pu.streakNudged !== nu.streakNudged) set.streak_nudged_on = nu.streakNudged || null;
    if (Object.keys(set).length) ops.push(function () { return sb.from("user_settings").update(set).eq("user_id", uid); });

    // Profile
    var prof = {};
    if (prev.profile.name !== next.profile.name) prof.display_name = String(next.profile.name || "").slice(0, 100);
    if (prev.profile.bio !== next.profile.bio) prof.bio = String(next.profile.bio || "").slice(0, 160);
    if (!same(prev.favGenres, next.favGenres)) prof.favorite_genres = (next.favGenres || []).slice(0, 3);
    if (prev.onboarding !== next.onboarding) prof.onboarding_completed = !next.onboarding;
    if (prev.firstHome !== next.firstHome) prof.first_home_seen = !next.firstHome;
    if (Object.keys(prof).length) ops.push(function () { return sb.from("profiles").update(prof).eq("user_id", uid); });

    return ops;
  }

  // Writes what changed since the last sync. Runs after every store change.
  function sync(state) {
    if (!user || !saved) return writes;
    var next = JSON.parse(JSON.stringify(state));
    var ops = changes(saved, next);
    saved = next;
    if (!ops.length) return writes;
    pending++;
    writes = writes.then(function () {
      return ops.reduce(function (p, op) {
        return p.then(function () { return op().then(must); });
      }, Promise.resolve());
    }).catch(function (err) {
      console.error("Saving to Supabase failed:", err);
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

  /* ---------- account ---------- */
  // Handles are 3–30 of a–z, 0–9 and _, and unique; add digits until one is free
  function claimHandle(name) {
    var base = String(name || "").toLowerCase().replace(/[^a-z0-9_]+/g, "").slice(0, 24);
    if (!base) base = "nekaifan";
    else if (base.length < 3) base += "_fan";
    function attempt(n) {
      var handle = n ? base + Math.floor(1000 + Math.random() * 9000) : base;
      return sb.from("profiles").update({ handle: handle }).eq("user_id", user.id).then(function (res) {
        if (!res.error) return handle;
        if (res.error.code === "23505" && n < 5) return attempt(n + 1); // taken
        throw res.error;
      });
    }
    return attempt(0);
  }

  // The access token the backend checks before account actions
  function token() {
    return sb.auth.getSession().then(function (r) { return r.data.session ? r.data.session.access_token : ""; });
  }

  /* ---------- Lolli chats ---------- */
  var lolli = {
    // The latest open conversation and its messages: { id, messages: [{ id, role, text }] }
    latest: function () {
      if (!user) return Promise.resolve({ id: null, messages: [] });
      return sb.from("lolli_conversations").select("conversation_id").eq("user_id", user.id).is("deleted_at", null)
        .order("updated_at", { ascending: false }).limit(1).then(must).then(function (rows) {
          if (!rows.length) return { id: null, messages: [] };
          var id = rows[0].conversation_id;
          return readAll(function () {
            return sb.from("lolli_messages").select("message_id, role, content, created_at")
              .eq("user_id", user.id).eq("conversation_id", id).is("deleted_at", null)
              .order("created_at", { ascending: true }).order("message_id", { ascending: true });
          }).then(function (msgs) {
            return { id: id, messages: msgs.map(function (m) { return { id: m.message_id, role: m.role, text: m.content }; }) };
          });
        });
    },
    start: function (title) {
      var id = crypto.randomUUID();
      return sb.from("lolli_conversations").insert({
        user_id: user.id, conversation_id: id, title: String(title || "Lolli chat").trim().slice(0, 120) || "Lolli chat",
      }).then(must).then(function () { return id; });
    },
    add: function (conversationId, msg) {
      return sb.from("lolli_messages").upsert({
        user_id: user.id, conversation_id: conversationId, message_id: msg.id,
        role: msg.role, content: msg.text, sent_at: iso(),
      }, { onConflict: "user_id,message_id", ignoreDuplicates: true }).then(must);
    },
    // Clearing a chat keeps it in history, marked deleted
    clear: function (conversationId) {
      if (!conversationId) return Promise.resolve();
      return sb.from("lolli_conversations").update({ deleted_at: iso() })
        .eq("user_id", user.id).eq("conversation_id", conversationId).then(must);
    },
  };

  NEKAI.db = {
    client: sb,
    get user() { return user; },
    // Resolves with the signed-in user, or null
    session: function () {
      return sb.auth.getSession().then(function (r) {
        user = r.data.session ? r.data.session.user : null;
        return user;
      });
    },
    load: load,
    sync: sync,
    // fn(error) runs when a save fails
    onSaveError: function (fn) { failListeners.push(fn); },
    flush: function () { return writes; },
    claimHandle: claimHandle,
    token: token,
    lolli: lolli,
    signOut: function () {
      return writes.then(function () { return sb.auth.signOut(); });
    },
  };
})();
