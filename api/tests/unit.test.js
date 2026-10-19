/* Unit tests: small pieces of the api tested on their own, with no server and no database.
 *   - the rate limiter (services/rate-limit.js)
 *   - password hashing and session tokens (services/auth.js)
 *   - the checks every save goes through (validChanges in routes/me.js)
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { rateLimiter } = require("../src/services/rate-limit");
const auth = require("../src/services/auth");
const { validChanges } = require("../src/routes/me");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("rate limiter", () => {
  test("allows up to the limit, then blocks", () => {
    const limited = rateLimiter(3, 60_000);
    assert.equal(limited("1.2.3.4"), false);
    assert.equal(limited("1.2.3.4"), false);
    assert.equal(limited("1.2.3.4"), false);
    assert.equal(limited("1.2.3.4"), true, "the 4th hit inside the window is over the limit");
  });

  test("counts each key (IP address) separately", () => {
    const limited = rateLimiter(1, 60_000);
    assert.equal(limited("a"), false);
    assert.equal(limited("a"), true);
    assert.equal(limited("b"), false, "another IP still has its own allowance");
  });

  test("allows requests again once the window has passed", async () => {
    const limited = rateLimiter(1, 50);
    assert.equal(limited("x"), false);
    assert.equal(limited("x"), true);
    await wait(70);
    assert.equal(limited("x"), false);
  });
});

describe("passwords", () => {
  test("a password matches its own hash and nothing else", async () => {
    const hash = await auth.hashPassword("correct horse");
    assert.equal(await auth.verifyPassword("correct horse", hash), true);
    assert.equal(await auth.verifyPassword("wrong horse", hash), false);
    assert.equal(await auth.verifyPassword("", hash), false);
  });

  test("the hash is salted scrypt, never the password itself", async () => {
    const a = await auth.hashPassword("same password");
    const b = await auth.hashPassword("same password");
    assert.match(a, /^scrypt\$16384\$8\$1\$/);
    assert.ok(!a.includes("same password"));
    assert.notEqual(a, b, "two hashes of one password differ, because each has its own salt");
  });

  test("a damaged or unknown stored hash never matches", async () => {
    assert.equal(await auth.verifyPassword("x", ""), false);
    assert.equal(await auth.verifyPassword("x", "bcrypt$abc"), false);
    assert.equal(await auth.verifyPassword("x", null), false);
  });
});

describe("session tokens", () => {
  test("tokens are random and long", () => {
    const a = auth.newToken();
    assert.notEqual(a, auth.newToken());
    assert.ok(a.length >= 40);
  });

  test("only a SHA-256 hash of the token is stored", () => {
    const hash = auth.hashToken("abc");
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(hash, auth.hashToken("abc"), "the same token always gives the same hash");
    assert.notEqual(hash, auth.hashToken("abd"));
  });

  test("reads the session cookie from the Cookie header", () => {
    const req = (cookie) => ({ get: () => cookie });
    assert.equal(auth.readCookie(req("theme=dark; nekai_session=tok%2Ben; x=1"), "nekai_session"), "tok+en");
    assert.equal(auth.readCookie(req("nekai_session_old=nope"), "nekai_session"), "");
    assert.equal(auth.readCookie(req(undefined), "nekai_session"), "");
  });
});

describe("validChanges: what a save may contain", () => {
  const title = (extra) => ({ anime_id: 5114, status: "watching", watched: 3, rating: 8, ...extra });
  const rejects = (body, message) => assert.throws(() => validChanges(body), message);

  test("accepts a normal save and fills in defaults", () => {
    const out = validChanges({
      anime: [title({ note: "great" })],
      events: [{ anime_id: 5114, episode_delta: 2, activity_date: "2026-10-15", timezone: "Asia/Manila" }],
      achievements: [{ achievement_id: "first_steps", earned_at: "2026-10-15T10:00:00.000Z" }],
      hidden: [{ anime_id: 21, hidden: true }],
      settings: { dark: true, library_view: "cards", streak_nudged_on: null },
      profile: { display_name: "Neko fan", favorite_genres: ["Action"] },
    });
    assert.deepEqual(out.anime, [
      { anime_id: 5114, status: "watching", watched: 3, rating: 8, note: "great", completed_once: false, deleted: false },
    ]);
    assert.equal(out.events.length, 1);
    assert.deepEqual(out.settings, { dark: true, library_view: "cards", streak_nudged_on: null });
    assert.deepEqual(out.profile, { display_name: "Neko fan", favorite_genres: ["Action"] });
  });

  test("an empty save is fine and changes nothing", () => {
    assert.deepEqual(validChanges({}), { anime: [], events: [], achievements: [], hidden: [] });
  });

  test("ratings are rounded to one decimal", () => {
    assert.equal(validChanges({ anime: [title({ rating: 8.44 })] }).anime[0].rating, 8.4);
    assert.equal(validChanges({ anime: [title({ rating: 8.45 })] }).anime[0].rating, 8.5);
  });

  test("the same title twice in one save keeps only the last change", () => {
    const out = validChanges({ anime: [title({ watched: 1 }), title({ watched: 2 })] });
    assert.equal(out.anime.length, 1);
    assert.equal(out.anime[0].watched, 2);
  });

  test("refuses bad titles", () => {
    rejects({ anime: [title({ status: "binged" })] }, /Unknown status/);
    rejects({ anime: [title({ anime_id: 0 })] }, /valid anime_id/);
    rejects({ anime: [title({ anime_id: "5114" })] }, /valid anime_id/);
    rejects({ anime: [title({ watched: -1 })] }, /Bad episode count/);
    rejects({ anime: [title({ watched: 2.5 })] }, /Bad episode count/);
    rejects({ anime: [title({ rating: 11 })] }, /Ratings go from 0 to 10/);
    rejects({ anime: [title({ note: "x".repeat(2001) })] }, /2000 characters/);
  });

  test("refuses bad watch history", () => {
    const event = (extra) => ({ anime_id: 1, episode_delta: 1, activity_date: "2026-10-15", timezone: "UTC", ...extra });
    rejects({ events: [event({ episode_delta: 0 })] }, /episode_delta/);
    rejects({ events: [event({ activity_date: "15/10/2026" })] }, /YYYY-MM-DD/);
    rejects({ events: [event({ activity_date: "2026-13-45" })] }, /YYYY-MM-DD/);
    rejects({ events: [event({ timezone: "" })] }, /timezone/);
  });

  test("refuses unknown achievements, settings and profile fields", () => {
    rejects({ achievements: [{ achievement_id: "hacker" }] }, /Unknown achievement/);
    rejects({ settings: { is_admin: true } }, /Unknown setting is_admin/);
    rejects({ settings: { dark: "yes" } }, /true or false/);
    rejects({ settings: { library_view: "grid" } }, /list or cards/);
    rejects({ profile: { email: "x@y.z" } }, /Unknown profile field email/);
    rejects({ profile: { favorite_genres: ["a", "b", "c", "d"] } }, /up to 3 genres/);
    rejects({ profile: { bio: "x".repeat(161) } }, /160 characters/);
  });

  test("refuses oversized or malformed saves", () => {
    rejects(null, /JSON object/);
    rejects({ anime: "everything" }, /list of up to/);
    rejects({ anime: Array.from({ length: 5001 }, (_, i) => title({ anime_id: i + 1 })) }, /list of up to 5000/);
    rejects({ recs: { input_key: "k", generated_at: "2026-10-15T00:00:00Z", items: "not a list" } }, /list of up to 50/);
  });
});
