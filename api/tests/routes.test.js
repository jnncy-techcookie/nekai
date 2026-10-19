/* Route tests with the database unreachable (nothing listens on port 1).
 * They prove that each route checks its input before it touches the database or Tenrai,
 * and that a database outage gives a clear 503 instead of a crash. Tenrai is mocked.
 */
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");

// Set before the app loads (an api/.env on a laptop never overrides these)
process.env.DATABASE_URL = "postgresql://nobody:nothing@127.0.0.1:1/none";

const { startApp, mockFetch } = require("./helpers");

let app;
// Tenrai answers, by URL: the mock records each call so tests can check nothing went upstream
const tenrai = { calls: [], reply: () => ({ status: 200, body: { data: [] } }) };

before(async () => {
  mockFetch((url) => {
    if (!url.startsWith("https://api.tenrai.org/")) return null; // not Tenrai: the real fetch
    tenrai.calls.push(url);
    const { status, body } = tenrai.reply(url);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  app = await startApp(require("../src/server"));
});
after(() => app.close());

describe("health check", () => {
  test("reports the database as unreachable with 503", async () => {
    const res = await app.get("/api/health");
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { status: "degraded", database: "unreachable" });
  });
});

describe("sessions", () => {
  test("without a cookie, the session is empty (no database needed)", async () => {
    const res = await app.get("/api/auth/session");
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { user: null });
  });

  test("the user's data needs a session", async () => {
    for (const path of ["/api/me", "/api/me/neko", "/api/catalog?ids=1"]) {
      const res = await app.get(path);
      assert.equal(res.status, 401, path);
      assert.match((await res.json()).error, /sign in/i);
    }
  });

  test("saving and deleting need a session too", async () => {
    assert.equal((await app.post("/api/me/changes", {})).status, 401);
    assert.equal((await app.request("DELETE", "/api/account")).status, 401);
    assert.equal((await app.request("PUT", "/api/auth/email", { email: "a@b.co" })).status, 401);
  });

  test("a session cookie can't be checked while the database is down: 503, not 401 or a crash", async () => {
    const res = await app.get("/api/me", { cookie: "nekai_session=some-token" });
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /database/i);
  });
});

describe("sign up, sign in and password reset: input checks", () => {
  test("sign up refuses a missing name, a bad email or a short password", async () => {
    const cases = [
      [{ email: "a@b.co", password: "password123" }, /name/i],
      [{ name: "A", email: "not-an-email", password: "password123" }, /valid email/i],
      [{ name: "A", email: "a@b.co", password: "short" }, /8 to 200 characters/],
      [{ name: "A", email: "a@b.co", password: "x".repeat(201) }, /8 to 200 characters/],
    ];
    for (const [body, message] of cases) {
      const res = await app.post("/api/auth/register", body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.match((await res.json()).error, message);
    }
  });

  test("password reset refuses a bad email or a short new password", async () => {
    assert.equal((await app.post("/api/auth/forgot", { email: "nope" })).status, 400);
    assert.equal((await app.post("/api/auth/reset", { token: "t", password: "short" })).status, 400);
  });

  test("a valid sign-in while the database is down answers 503", async () => {
    const res = await app.post("/api/auth/login", { email: "a@b.co", password: "password123" });
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /isn’t available/);
  });

  test("bodies that aren't JSON, or are too large, answer 400 / 413 in JSON", async () => {
    const bad = await app.request("POST", "/api/auth/login", '{"email":', { "Content-Type": "application/json" });
    assert.equal(bad.status, 400);
    const big = await app.post("/api/auth/login", { email: "a@b.co", password: "x".repeat(9000) });
    assert.equal(big.status, 413);
    assert.match((await big.json()).error, /too large/i);
  });
});

describe("anime routes (Tenrai proxy)", () => {
  test("invalid filters and ids are refused before anything goes to Tenrai", async () => {
    tenrai.calls.length = 0;
    const paths = [
      "/api/tenrai/anime?limit=100",
      "/api/tenrai/anime?type=manga",
      "/api/tenrai/anime?genres=1;drop",
      "/api/tenrai/anime?order_by=title",
      "/api/tenrai/anime?min_score=11",
      "/api/tenrai/anime/0",
      "/api/tenrai/anime/abc/full",
      "/api/tenrai/anime/1/episodes?page=999",
      "/api/tenrai/top/anime?filter=upcoming",
    ];
    for (const path of paths) {
      const res = await app.get(path);
      assert.equal(res.status, 400, path);
    }
    assert.equal(tenrai.calls.length, 0, "no invalid request reached Tenrai");
  });

  test("searches always ask Tenrai for safe-for-work results only", async () => {
    tenrai.calls.length = 0;
    tenrai.reply = () => ({ status: 200, body: { data: [{ mal_id: 1, title: "Cowboy Bebop" }] } });
    const res = await app.get("/api/tenrai/anime?q=bebop");
    assert.equal(res.status, 200);
    assert.equal((await res.json()).data[0].title, "Cowboy Bebop");
    assert.equal(new URL(tenrai.calls[0]).searchParams.get("sfw"), "true");
  });

  test("Tenrai's errors become clear answers: 404 stays 404, its rate limit (429) becomes 503", async () => {
    tenrai.reply = () => ({ status: 404, body: { status: 404, message: "Not found" } });
    const missing = await app.get("/api/tenrai/anime/999999");
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error, "Anime not found");

    tenrai.reply = () => ({ status: 429, body: { status: 429, message: "Too many requests" } });
    const busy = await app.get("/api/tenrai/anime/999998");
    assert.equal(busy.status, 503);
    assert.match((await busy.json()).error, /temporarily unavailable/);
  });
});
