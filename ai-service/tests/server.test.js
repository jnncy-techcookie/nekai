const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const app = require("../src/server");

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server && server.listening) {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
      server.closeAllConnections();
    });
  }
});

test("Health endpoint returns the service status", async () => {
  const response = await fetch(`${baseUrl}/health`, {
    signal: AbortSignal.timeout(5000),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    gemini: process.env.GEMINI_API_KEY ? "configured" : "missing key",
  });
});

test("Unknown routes return a JSON 404 response", async () => {
  const response = await fetch(`${baseUrl}/nonexistent-test-route`, {
    signal: AbortSignal.timeout(5000),
  });

  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.deepEqual(await response.json(), { error: "Not found" });
});

test("Chat rejects malformed JSON", async () => {
  const response = await fetch(`${baseUrl}/api/neko/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"message":',
    signal: AbortSignal.timeout(5000),
  });

  assert.equal(response.status, 400);
  assert.match(response.headers.get("content-type"), /application\/json/);

  const body = await response.json();
  assert.equal(typeof body.error, "string");
  assert.ok(body.error.length > 0);
});

test("Chat rejects a request larger than its 32 KB limit", async () => {
  const response = await fetch(`${baseUrl}/api/neko/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "a".repeat(40 * 1024) }),
    signal: AbortSignal.timeout(5000),
  });

  assert.equal(response.status, 413);
  assert.match(response.headers.get("content-type"), /application\/json/);

  const body = await response.json();
  assert.equal(typeof body.error, "string");
  assert.ok(body.error.length > 0);
});
