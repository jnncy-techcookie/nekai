/* /api/me/*: the signed-in user's own data in PostgreSQL. Every route needs a session,
 * and every query is limited to req.user.id, so a user can only reach their own rows.
 *   GET    /                    everything the pages need (profile, settings, list, history…)
 *   POST   /changes             what changed since the last save, applied in one transaction
 *   PUT    /avatar              a new profile picture (raw image body, up to 1 MB)
 *   DELETE /avatar              removes the profile picture
 *   GET    /neko                the latest Neko chat and its messages
 *   POST   /neko                { title } starts a chat
 *   POST   /neko/:id/messages   { id, role, text } adds a message
 *   DELETE /neko/:id            clears a chat (kept in history, marked deleted)
 */
const express = require("express");
const db = require("../services/db");
const { requireUser } = require("../services/auth");
const avatars = require("../services/avatars");

const router = express.Router();
router.use(requireUser);

const STATUSES = new Set(["watching", "plan", "completed", "dropped"]);
const ACHIEVEMENTS = new Set(["first_steps", "finisher", "critic", "binge_mode", "explorer", "week_streak", "finisher_ii", "long_haul"]);
const BOOL_SETTINGS = ["sound", "confetti", "neko", "streak", "motion", "text", "contrast", "dark", "nav_open", "neko_hidden"];
const MAX_ROWS = 5000; // rows of one kind in one save
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// A rejected save: answered with 400 and this message
class Invalid extends Error {}
const check = (ok, message) => {
  if (!ok) throw new Invalid(message);
};

const isId = (v) => Number.isInteger(v) && v > 0 && v < 2 ** 31;
const isText = (v, max) => typeof v === "string" && v.length <= max;
const isDay = (v) => typeof v === "string" && DAY.test(v) && !Number.isNaN(Date.parse(v));
const isTime = (v) => v === null || (typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v)));
const list = (v, name) => {
  if (v === undefined) return [];
  check(Array.isArray(v) && v.length <= MAX_ROWS, `${name} must be a list of up to ${MAX_ROWS} rows`);
  return v;
};
// One row per key (the last one wins): a batch may not touch the same row twice
const lastPerKey = (rows, key) => [...new Map(rows.map((r) => [r[key], r])).values()];

// Wraps a handler: a rejected save answers 400, a database error 503
const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (res.headersSent) return;
    if (err instanceof Invalid) return res.status(400).json({ error: err.message });
    // 22xxx data exceptions and 23xxx constraint violations: values the schema refused
    if (/^2[23]/.test(err.code || "")) return res.status(400).json({ error: "Some of the data couldn’t be saved: it didn’t pass the database’s checks." });
    console.error(`${req.method} /api/me${req.path} failed:`, err.message);
    res.status(503).json({ error: "NEKAI’s database isn’t reachable right now. Please try again." });
  }
};

/* ---------- reading ---------- */
router.get("/", handle(async (req, res) => {
  const uid = req.user.id;
  const q = (sql) => db.query(sql, [uid]).then((r) => r.rows);
  const [profile, settings, anime, events, achievements, hidden, recs] = await Promise.all([
    q(`select display_name, bio, avatar_url, favorite_genres, onboarding_completed, first_home_seen, created_at
       from profiles where user_id = $1`),
    q(`select sound, confetti, neko, streak, motion, text, contrast, dark, nav_open, neko_hidden,
              library_view, streak_nudged_on, timezone
       from user_settings where user_id = $1`),
    q(`select anime_id, status, watched, rating, note, completed_once, updated_at
       from user_anime where user_id = $1 and deleted_at is null`),
    q("select anime_id, episode_delta, activity_date from watch_events where user_id = $1 order by event_id"),
    q("select achievement_id, earned_at from user_achievements where user_id = $1"),
    q("select anime_id from hidden_recommendations where user_id = $1 and deleted_at is null"),
    q("select input_key, generated_at, items from user_recommendations where user_id = $1"),
  ]);
  res.json({
    user: req.user,
    profile: profile[0] || null,
    settings: settings[0] || null,
    anime,
    events,
    achievements,
    hidden,
    recs: recs[0] || null,
  });
}));

/* ---------- writing ---------- */
// Checks a save's body and returns it in the shape the queries below expect
function validChanges(body) {
  check(body && typeof body === "object", "Send the changes as a JSON object");
  const out = {};

  out.anime = lastPerKey(list(body.anime, "anime").map((r) => {
    check(r && isId(r.anime_id), "Each title needs a valid anime_id");
    check(STATUSES.has(r.status), `Unknown status for anime ${r.anime_id}`);
    check(Number.isInteger(r.watched) && r.watched >= 0 && r.watched <= 100000, `Bad episode count for anime ${r.anime_id}`);
    check(typeof r.rating === "number" && r.rating >= 0 && r.rating <= 10, `Ratings go from 0 to 10 (anime ${r.anime_id})`);
    check(r.note === undefined || isText(r.note, 2000), "Notes are up to 2000 characters");
    return {
      anime_id: r.anime_id,
      status: r.status,
      watched: r.watched,
      rating: Math.round(r.rating * 10) / 10,
      note: r.note || "",
      completed_once: !!r.completed_once,
      deleted: !!r.deleted,
    };
  }), "anime_id");

  out.events = list(body.events, "events").map((e) => {
    check(e && isId(e.anime_id), "Each watch event needs a valid anime_id");
    check(Number.isInteger(e.episode_delta) && e.episode_delta !== 0 && Math.abs(e.episode_delta) <= 100000, "Bad episode_delta");
    check(isDay(e.activity_date), "activity_date must be YYYY-MM-DD");
    check(isText(e.timezone, 64) && e.timezone, "Each watch event needs its timezone");
    return { anime_id: e.anime_id, episode_delta: e.episode_delta, activity_date: e.activity_date, timezone: e.timezone };
  });

  out.achievements = lastPerKey(list(body.achievements, "achievements").map((a) => {
    check(a && ACHIEVEMENTS.has(a.achievement_id), "Unknown achievement");
    check(a.earned_at === undefined || isTime(a.earned_at), "Bad earned_at");
    return { achievement_id: a.achievement_id, earned_at: a.earned_at || null };
  }), "achievement_id");

  out.hidden = lastPerKey(list(body.hidden, "hidden").map((h) => {
    check(h && isId(h.anime_id), "Each hidden title needs a valid anime_id");
    return { anime_id: h.anime_id, hidden: !!h.hidden };
  }), "anime_id");

  if (body.recs !== undefined && body.recs !== null) {
    const r = body.recs;
    check(typeof r === "object" && isText(r.input_key || "", 2000), "Bad AI picks");
    check(isTime(r.generated_at) && r.generated_at, "AI picks need generated_at");
    check(Array.isArray(r.items) && r.items.length <= 50, "AI picks are a list of up to 50 items");
    out.recs = { input_key: r.input_key || "", generated_at: r.generated_at, items: r.items };
  }

  if (body.settings !== undefined) {
    const s = body.settings;
    check(s && typeof s === "object", "Bad settings");
    const set = {};
    for (const [k, v] of Object.entries(s)) {
      if (BOOL_SETTINGS.includes(k)) {
        check(typeof v === "boolean", `${k} must be true or false`);
        set[k] = v;
      } else if (k === "library_view") {
        check(v === "list" || v === "cards", "library_view is list or cards");
        set[k] = v;
      } else if (k === "streak_nudged_on") {
        check(v === null || isDay(v), "streak_nudged_on must be YYYY-MM-DD or null");
        set[k] = v;
      } else if (k === "timezone") {
        check(isText(v, 64) && v, "Bad timezone");
        set[k] = v;
      } else {
        check(false, `Unknown setting ${k}`);
      }
    }
    if (Object.keys(set).length) out.settings = set;
  }

  if (body.profile !== undefined) {
    const p = body.profile;
    check(p && typeof p === "object", "Bad profile");
    const set = {};
    for (const [k, v] of Object.entries(p)) {
      if (k === "display_name") { check(isText(v, 100), "Names are up to 100 characters"); set[k] = v; }
      else if (k === "bio") { check(isText(v, 160), "Bios are up to 160 characters"); set[k] = v; }
      else if (k === "favorite_genres") {
        check(Array.isArray(v) && v.length <= 3 && v.every((g) => isText(g, 40)), "Pick up to 3 genres");
        set[k] = v;
      } else if (k === "onboarding_completed" || k === "first_home_seen") {
        check(typeof v === "boolean", `${k} must be true or false`);
        set[k] = v;
      } else if (k === "avatar_url") {
        set[k] = v; // checked against the user's own folder in applyChanges
      } else {
        check(false, `Unknown profile field ${k}`);
      }
    }
    if (Object.keys(set).length) out.profile = set;
  }
  return out;
}

// "update <table> set a = $2, b = $3, updated_at = now() where user_id = $1" for the given fields.
// Column names only ever come from the allow-lists above, never from the request itself.
async function updateRow(c, table, uid, fields) {
  const cols = Object.keys(fields);
  const sets = cols.map((col, i) => `${col} = $${i + 2}`).join(", ");
  await c.query(`update ${table} set ${sets}, updated_at = now() where user_id = $1`, [uid, ...cols.map((k) => fields[k])]);
}

async function applyChanges(c, uid, ch) {
  if (ch.anime.length) {
    await c.query(
      `insert into user_anime (user_id, anime_id, status, watched, rating, note, completed_once, deleted_at)
       select $1, x.anime_id, x.status, x.watched, x.rating, x.note, x.completed_once,
              case when x.deleted then now() end
       from jsonb_to_recordset($2::jsonb)
         as x(anime_id int, status text, watched int, rating numeric, note text, completed_once boolean, deleted boolean)
       on conflict (user_id, anime_id) do update set
         status = excluded.status, watched = excluded.watched, rating = excluded.rating, note = excluded.note,
         completed_once = excluded.completed_once, deleted_at = excluded.deleted_at, updated_at = now()`,
      [uid, JSON.stringify(ch.anime)],
    );
  }
  if (ch.events.length) {
    await c.query(
      `insert into watch_events (user_id, anime_id, event_type, episode_delta, activity_date, timezone)
       select $1, x.anime_id, case when x.episode_delta > 0 then 'watch' else 'correction' end,
              x.episode_delta, x.activity_date, x.timezone
       from jsonb_to_recordset($2::jsonb) as x(anime_id int, episode_delta int, activity_date date, timezone text)`,
      [uid, JSON.stringify(ch.events)],
    );
  }
  if (ch.achievements.length) {
    // kept once earned: an achievement already saved is left as it is
    await c.query(
      `insert into user_achievements (user_id, achievement_id, earned_at)
       select $1, x.achievement_id, x.earned_at
       from jsonb_to_recordset($2::jsonb) as x(achievement_id text, earned_at timestamptz)
       on conflict (user_id, achievement_id) do nothing`,
      [uid, JSON.stringify(ch.achievements)],
    );
  }
  if (ch.hidden.length) {
    await c.query(
      `insert into hidden_recommendations (user_id, anime_id, deleted_at)
       select $1, x.anime_id, case when x.hidden then null else now() end
       from jsonb_to_recordset($2::jsonb) as x(anime_id int, hidden boolean)
       on conflict (user_id, anime_id) do update set deleted_at = excluded.deleted_at`,
      [uid, JSON.stringify(ch.hidden)],
    );
  }
  if (ch.recs) {
    await c.query(
      `insert into user_recommendations (user_id, input_key, generated_at, items) values ($1, $2, $3, $4::jsonb)
       on conflict (user_id) do update set
         input_key = excluded.input_key, generated_at = excluded.generated_at, items = excluded.items`,
      [uid, ch.recs.input_key, ch.recs.generated_at, JSON.stringify(ch.recs.items)],
    );
  }
  if (ch.settings) await updateRow(c, "user_settings", uid, ch.settings);
  if (ch.profile) {
    const url = ch.profile.avatar_url;
    // A picture can only point at the user's own uploaded file, or be cleared
    check(url === undefined || url === null || (typeof url === "string" && avatars.OWN_URL(uid).test(url)), "That profile picture isn’t one you uploaded");
    await updateRow(c, "profiles", uid, ch.profile);
  }
}

router.post("/changes", express.json({ limit: "2mb" }), handle(async (req, res) => {
  const changes = validChanges(req.body);
  await db.transaction((c) => applyChanges(c, req.user.id, changes));
  res.json({ saved: true });
}));

/* ---------- profile picture ---------- */
router.put(
  "/avatar",
  express.raw({ type: ["image/webp", "image/jpeg", "image/png"], limit: avatars.MAX_BYTES }),
  handle(async (req, res) => {
    check(Buffer.isBuffer(req.body) && req.body.length > 0, "Send a WebP, JPEG or PNG picture of up to 1 MB");
    const url = await avatars.saveAvatar(req.user.id, req.body);
    check(url, "That file isn’t a WebP, JPEG or PNG picture");
    await db.query("update profiles set avatar_url = $2, updated_at = now() where user_id = $1", [req.user.id, url]);
    res.json({ url });
  }),
);

router.delete("/avatar", handle(async (req, res) => {
  await avatars.removeAvatars(req.user.id);
  await db.query("update profiles set avatar_url = null, updated_at = now() where user_id = $1", [req.user.id]);
  res.json({ removed: true });
}));

/* ---------- Neko chats ---------- */
router.get("/neko", handle(async (req, res) => {
  const uid = req.user.id;
  const { rows } = await db.query(
    `select conversation_id from neko_conversations
     where user_id = $1 and deleted_at is null order by updated_at desc limit 1`,
    [uid],
  );
  if (!rows[0]) return res.json({ id: null, messages: [] });
  const id = rows[0].conversation_id;
  const msgs = await db.query(
    `select message_id, role, content from neko_messages
     where user_id = $1 and conversation_id = $2 and deleted_at is null
     order by created_at, message_id`,
    [uid, id],
  );
  res.json({ id, messages: msgs.rows.map((m) => ({ id: m.message_id, role: m.role, text: m.content })) });
}));

router.post("/neko", express.json({ limit: "4kb" }), handle(async (req, res) => {
  const title = String(req.body?.title || "").trim().slice(0, 120) || "Neko chat";
  const { rows } = await db.query(
    "insert into neko_conversations (user_id, title) values ($1, $2) returning conversation_id",
    [req.user.id, title],
  );
  res.status(201).json({ id: rows[0].conversation_id });
}));

router.post("/neko/:id/messages", express.json({ limit: "64kb" }), handle(async (req, res) => {
  const { id, role, text } = req.body || {};
  check(UUID.test(req.params.id), "Unknown chat");
  check(typeof id === "string" && UUID.test(id), "Each message needs a UUID id");
  check(role === "user" || role === "neko", "role is user or neko");
  check(isText(text, 20000) && text, "Messages are 1 to 20000 characters");

  const saved = await db.transaction(async (c) => {
    // The chat must be this user's and still open; saving a message moves it to the top
    const chat = await c.query(
      `update neko_conversations set updated_at = now()
       where conversation_id = $2 and user_id = $1 and deleted_at is null returning conversation_id`,
      [req.user.id, req.params.id],
    );
    if (!chat.rows[0]) return false;
    // A retried save of the same message is ignored
    await c.query(
      `insert into neko_messages (user_id, message_id, conversation_id, role, content)
       values ($1, $2, $3, $4, $5) on conflict (user_id, message_id) do nothing`,
      [req.user.id, id, req.params.id, role, text],
    );
    return true;
  });
  if (!saved) return res.status(404).json({ error: "That chat was cleared or doesn’t exist." });
  res.status(201).json({ saved: true });
}));

router.delete("/neko/:id", handle(async (req, res) => {
  check(UUID.test(req.params.id), "Unknown chat");
  await db.query(
    "update neko_conversations set deleted_at = now() where conversation_id = $2 and user_id = $1 and deleted_at is null",
    [req.user.id, req.params.id],
  );
  res.json({ cleared: true });
}));

module.exports = router;
module.exports.validChanges = validChanges; // exported for tests
