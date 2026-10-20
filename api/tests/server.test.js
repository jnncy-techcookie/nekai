const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const app = require("../src/server");

let server;
let baseUrl;

// Start a separate test server on an automatically selected port.
before(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

// Close the test server when the tests finish.
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

// The quality-gate demo test: change 404 to 200 below and push, and the pipeline stops at
// the Test stage, so nothing is deployed. Change it back and the next build passes.
test("Unknown API routes return a JSON 404 response", async () => {
  const response = await fetch(`${baseUrl}/api/nonexistent-test-route`, {
    signal: AbortSignal.timeout(5000),
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.deepEqual(await response.json(), { error: "Not found" });
});

test("Malformed JSON is rejected with a 400 response", async () => {
  const response = await fetch(`${baseUrl}/api/auth/nonexistent-test-route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"email":',
    signal: AbortSignal.timeout(5000),
  });

  assert.equal(response.status, 400);
  assert.match(response.headers.get("content-type"), /application\/json/);

  const body = await response.json();
  assert.equal(typeof body.error, "string");
  assert.ok(body.error.length > 0);
});

test("API responses do not expose the X-Powered-By header", async () => {
  const response = await fetch(`${baseUrl}/api/nonexistent-test-route`, {
    signal: AbortSignal.timeout(5000),
  });

  await response.text();

  assert.equal(response.headers.get("x-powered-by"), null);
});
