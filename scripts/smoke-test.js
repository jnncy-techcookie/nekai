/* NEKAI smoke test: checks that a deployed stack answers. Shared by the deploy pipeline (Jenkinsfile)
 * and the rollback pipeline (Jenkinsfile.rollback), so both verify the same things.
 *
 * It runs INSIDE the api container, on the compose network, where the services can be reached by name:
 *   docker compose exec -T -e EXPECTED_BUILD=<tag> api node - < scripts/smoke-test.js
 *
 * EXPECTED_BUILD (optional): also checks that the frontend reports this build number, which proves the
 * version that was just deployed (or rolled back to) is the one being served.
 */
const assert = require("node:assert/strict");

async function check(url, expectedStatus, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(5000) });
  const body = await response.text();
  assert.equal(response.status, expectedStatus, `${url} returned ${response.status}`);
  console.log(`PASS: ${url}`);
  return body;
}

async function verify() {
  // Proxy itself.
  await check("http://proxy:8080/health", 200);

  // Frontend through the proxy.
  await check("http://proxy:8080/", 200);

  // API and its database connection through the proxy.
  await check("http://proxy:8080/api/health", 200);

  // AI service readiness on the internal network.
  await check("http://ai-service:3001/health", 200);

  // AI routing through the proxy. Invalid JSON must return 400 without calling Gemini.
  await check("http://proxy:8080/api/neko/chat", 400, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });

  // The right version is live: the build label the frontend serves matches the expected build.
  const expected = process.env.EXPECTED_BUILD;
  if (expected) {
    const body = await check("http://proxy:8080/build.json", 200);
    const live = JSON.parse(body).build;
    assert.equal(live, expected, `build.json says build ${live}, expected ${expected}`);
    console.log(`PASS: build ${expected} is live`);
  }
}

async function main() {
  const attempts = 12;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await verify();
      console.log("Smoke test passed");
      return;
    } catch (error) {
      console.error(`Attempt ${attempt}: ${error.message}`);
      if (attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
