/* Session handling with the database mocked.
 * services/db.js is replaced by a fake before the app loads, so these tests check what the
 * routes ask the database, and what they do with its answers, without a real PostgreSQL:
 * sign up, sign in, the session cookie, sign out, and saving changes in one transaction.
 */
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");

// The fake must be in place before anything loads services/db.js, so the auth helpers
// used below are required only after it (see "the fake database")
let auth;

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "fan@nekai.test", created_at: "2026-10-01T00:00:00.000Z" };
const GOOD_TOKEN = "good-session-token";
let passwordHash;

// ---------- the fake database ----------
// Every query is recorded, so tests can check what was asked and with which values
const log = [];
let transactions = 0;
function answer(sql, params) {
  log.push({ sql, params });
  if (/update sessions set expires_at/.test(sql)) {
    // The session lookup: only GOOD_TOKEN's hash belongs to a live session
    return params[0] === auth.hashToken(GOOD_TOKEN) ? [USER] : [];
  }
  if (/from users where email/.test(sql)) {
    return params[0] === USER.email ? [{ ...USER, password_hash: passwordHash }] : [];
  }
  if (/insert into users/.test(sql)) {
    // A taken email: "on conflict do nothing" returns no row
    return params[0] === "taken@nekai.test" ? [] : [{ id: "22222222-2222-4222-8222-222222222222", email: params[0], created_at: USER.created_at }];
  }
  if (/from anime_catalog/.test(sql)) {
    return params[0].map((id) => ({ anime_id: id, metadata: { title: `Anime ${id}` } }));
  }
  return [];
}
const fakeDb = {
  query: async (sql, params = []) => ({ rows: answer(sql, params) }),
  transaction: async (fn) => {
    transactions++;
    return fn({ query: async (sql, params = []) => ({ rows: answer(sql, params) }) });
  },
  ping: async () => true,
  close: async () => {},
};
const dbPath = require.resolve("../src/services/db");
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };
auth = require("../src/services/auth");

const { startApp } = require("./helpers");
let app;
const asUser = { cookie: `nekai_session=${GOOD_TOKEN}` };
const queriesLike = (pattern) => log.filter((q) => pattern.test(q.sql));

before(async () => {
  passwordHash = await auth.hashPassword("right-password");
  app = await startApp(require("../src/server"));
});
after(() => app.close());

describe("checking a session", () => {
  test("a valid session cookie gives the signed-in user", async () => {
    const res = await app.get("/api/auth/session", asUser);
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).user, USER);
  });

  test("the database is asked with the token's hash, never the token itself", async () => {
    log.length = 0;
    await app.get("/api/auth/session", asUser);
    const [lookup] = queriesLike(/update sessions/);
    assert.equal(lookup.params[0], auth.hashToken(GOOD_TOKEN));
    assert.ok(!JSON.stringify(log).includes(GOOD_TOKEN));
  });

  test("an unknown or expired session counts as signed out", async () => {
    const res = await app.get("/api/auth/session", { cookie: "nekai_session=stolen-or-expired" });
    assert.deepEqual(await res.json(), { user: null });
    assert.equal((await app.get("/api/me/neko", { cookie: "nekai_session=stolen-or-expired" })).status, 401);
  });
});

describe("sign up and sign in", () => {
  test("sign up creates the account, its profile and settings, and signs in with a safe cookie", async () => {
    log.length = 0;
    const res = await app.post("/api/auth/register", { name: "New Fan", email: "New@Nekai.Test", password: "password123" });
    assert.equal(res.status, 201);
    assert.equal((await res.json()).user.email, "new@nekai.test", "emails are stored in lowercase");

    const cookie = res.headers.get("set-cookie");
    assert.match(cookie, /^nekai_session=[\w-]{40,};/);
    assert.match(cookie, /HttpOnly/i, "page scripts can't read the session");
    assert.match(cookie, /SameSite=Lax/i, "other sites can't send it with their forms");

    assert.equal(queriesLike(/insert into profiles/).length, 1);
    assert.equal(queriesLike(/insert into user_settings/).length, 1);
    const [user] = queriesLike(/insert into users/);
    assert.match(user.params[1], /^scrypt\$/, "the password is stored hashed");
    assert.ok(!JSON.stringify(log).includes("password123"), "the plain password never reaches the database");
  });

  test("an email that already has an account answers 409", async () => {
    const res = await app.post("/api/auth/register", { name: "Again", email: "taken@nekai.test", password: "password123" });
    assert.equal(res.status, 409);
  });

  test("the right password signs in; a wrong password and an unknown email get the same answer", async () => {
    const ok = await app.post("/api/auth/login", { email: "fan@nekai.test", password: "right-password" });
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get("set-cookie"), /^nekai_session=/);

    const wrong = await app.post("/api/auth/login", { email: "fan@nekai.test", password: "wrong-password" });
    const unknown = await app.post("/api/auth/login", { email: "nobody@nekai.test", password: "whatever1" });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(await wrong.json(), await unknown.json(), "nobody can find out which emails have an account");
    assert.equal(wrong.headers.get("set-cookie"), null);
  });

  test("sign out deletes the session and clears the cookie", async () => {
    log.length = 0;
    const res = await app.post("/api/auth/logout", {}, asUser);
    assert.equal(res.status, 200);
    const [deleted] = queriesLike(/delete from sessions where token_hash/);
    assert.equal(deleted.params[0], auth.hashToken(GOOD_TOKEN));
    assert.match(res.headers.get("set-cookie"), /nekai_session=;.*Expires=Thu, 01 Jan 1970/);
  });
});

describe("saving changes", () => {
  const save = { anime: [{ anime_id: 5114, status: "watching", watched: 3, rating: 9 }], settings: { dark: true } };

  test("a valid save runs in one transaction, limited to the signed-in user's rows", async () => {
    log.length = 0;
    const before = transactions;
    const res = await app.post("/api/me/changes", save, asUser);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { saved: true });
    assert.equal(transactions, before + 1, "everything is saved together, or nothing is");

    const [anime] = queriesLike(/insert into user_anime/);
    assert.equal(anime.params[0], USER.id);
    assert.deepEqual(JSON.parse(anime.params[1])[0], {
      anime_id: 5114, status: "watching", watched: 3, rating: 9, note: "", completed_once: false, deleted: false,
    });
    const [settings] = queriesLike(/update user_settings/);
    assert.equal(settings.params[0], USER.id);
  });

  test("a save with an invalid value is refused before the database is touched", async () => {
    const before = transactions;
    const res = await app.post("/api/me/changes", { anime: [{ anime_id: 5114, status: "binged", watched: 1, rating: 1 }] }, asUser);
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /Unknown status/);
    assert.equal(transactions, before, "no transaction was started");
  });

  test("a profile picture can only point at the user's own uploaded file", async () => {
    const foreign = await app.post("/api/me/changes", { profile: { avatar_url: "https://evil.example/pic.png" } }, asUser);
    assert.equal(foreign.status, 400);
    const own = await app.post("/api/me/changes", { profile: { avatar_url: `/avatars/${USER.id}/avatar-1.png` } }, asUser);
    assert.equal(own.status, 200);
  });

  test("saved anime details are read back from the catalog", async () => {
    const res = await app.get("/api/catalog?ids=1,20", asUser);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { 1: { title: "Anime 1" }, 20: { title: "Anime 20" } });
  });
});
