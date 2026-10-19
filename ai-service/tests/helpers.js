/* Shared test helpers (not a test file itself: node --test only runs *.test.js here).
 *   startApp(app)    runs the Express app on a free port; returns small request helpers
 *   mockFetch(fn)    replaces global fetch: fn(url, init) answers with a Response, or with
 *                    null to let the request through to the real fetch (e.g. the test's own
 *                    requests to the app). Used to stand in for Gemini, so no test needs the
 *                    internet or an API key.
 */
const { once } = require("node:events");

async function startApp(app) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;

  // body: an object (sent as JSON) or a string (sent as it is, e.g. broken JSON)
  function request(method, path, body, headers = {}) {
    const init = { method, headers: { ...headers }, signal: AbortSignal.timeout(10000) };
    if (body !== undefined) {
      init.body = typeof body === "string" ? body : JSON.stringify(body);
      if (!init.headers["Content-Type"]) init.headers["Content-Type"] = "application/json";
    }
    return fetch(base + path, init);
  }

  return {
    base,
    request,
    get: (path, headers) => request("GET", path, undefined, headers),
    post: (path, body, headers) => request("POST", path, body, headers),
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

function mockFetch(handler) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    const answer = await handler(url, init);
    return answer || realFetch(input, init);
  };
  return () => {
    globalThis.fetch = realFetch;
  };
}

module.exports = { startApp, mockFetch };
