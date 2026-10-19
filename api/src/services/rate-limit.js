// Sliding-window limit per key (an IP address): limited(key) records a hit and
// returns true once more than `limit` hits land inside `windowMs`.
function rateLimiter(limit, windowMs) {
  const hits = new Map();

  return function limited(key) {
    const now = Date.now();
    // Keep only the hits still inside the window, then add this one
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);

    // Forget keys that have gone quiet so the map doesn't grow forever
    if (hits.size > 1000) {
      for (const [k, times] of hits) {
        if (now - times[times.length - 1] >= windowMs) hits.delete(k);
      }
    }
    return recent.length > limit;
  };
}

module.exports = { rateLimiter };
