const { rememberAnime } = require("./catalog");

const BASE_URL = "https://api.tenrai.org/v1";
const cache = new Map();
const inFlight = new Map();

let queue = Promise.resolve();
let nextRequestAt = 0;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getTenrai(path, params = {}) {
  const url = new URL(BASE_URL + path);

  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(name, String(value));
    }
  }

  const key = url.toString();
  const cached = cache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.data);
  }
  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

  const request = queue
    .then(async () => {
      await wait(Math.max(0, nextRequestAt - Date.now()));
      nextRequestAt = Date.now() + 1100;

      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const error = new Error(`Tenrai returned ${response.status}`);
        error.status = response.status;
        throw error;
      }

      const result = await response.json();

      if (!result || result.status >= 400 || !Object.hasOwn(result, "data")) {
        const error = new Error(
          result?.message || "Tenrai returned no anime data",
        );
        error.status = result?.status || 502;
        throw error;
      }

      return result;
    })
    .then((data) => {
      cache.set(key, {
        data,
        expiresAt: Date.now() + 30 * 60 * 1000,
      });
      rememberAnime(path, data);
      return data;
    })
    .finally(() => inFlight.delete(key));

  queue = request.catch(() => {});
  inFlight.set(key, request);
  return request;
}

module.exports = { getTenrai };
