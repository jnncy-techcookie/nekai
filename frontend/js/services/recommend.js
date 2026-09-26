/* NEKAI AI picks: sends the user's history (titles, genres, status, ratings) to
 * /api/recommend, where Gemini picks titles and Tenrai finds them on MyAnimeList.
 * Results are saved in the store (state.recs) and only asked for again when the
 * list, a status, a rating or "Not interested" changes, or after a day.
 */
(function () {
  "use strict";
  var S = NEKAI.store, J = NEKAI.tenrai;
  var MAX_AGE = 24 * 3600e3;
  var pending = null;

  function history() {
    return S.ids()
      .map(S.entry)
      .sort(function (a, b) { return b.updatedAt - a.updatedAt; })
      .slice(0, 60)
      .map(function (e) {
        return { id: e.id, title: e.title, genres: e.genres.slice(0, 10), status: e.status, rating: e.rating || 0 };
      });
  }
  // Changes that should give different picks (episode progress alone doesn't)
  function key() {
    var list = S.state.list;
    return Object.keys(list).sort().map(function (id) {
      return id + ":" + list[id].status + ":" + (list[id].rating || 0);
    }).join(",") + "|" + Object.keys(S.state.hidden).sort().join(",");
  }
  function fresh() {
    var r = S.state.recs;
    return !!(r && r.key === key() && Date.now() - r.at < MAX_AGE);
  }

  // force: ask again even when the saved picks are fresh ("New picks")
  function load(force) {
    if (pending) return pending;
    if (!force && fresh()) return Promise.resolve(S.state.recs);
    var hidden = Object.keys(S.state.hidden);
    pending = fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        history: history(),
        exclude: Object.keys(S.state.list).concat(hidden).map(Number).slice(0, 300),
        notInterested: hidden.map(S.anime).filter(Boolean).map(function (a) { return a.title; }).slice(0, 50),
      }),
    })
      .then(function (res) {
        // 404: a server started before /api/recommend existed
        if (res.status === 404) throw new Error("AI picks need the latest server. Restart it (npm start in backend) and reload.");
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (!res.ok || !Array.isArray(body.picks)) throw new Error(body.error || "The AI couldn’t make picks just now.");
          return body.picks;
        });
      })
      .then(function (picks) {
        var items = picks.map(function (p) { return { a: J.normalize(p.anime), why: p.why, fit: p.fit }; });
        S.cacheMany(items.map(function (x) { return x.a; }));
        S.setRecs({
          at: Date.now(),
          key: key(),
          items: items.map(function (x) { return { id: x.a.id, why: x.why, fit: x.fit }; }),
        });
        return S.state.recs;
      })
      .catch(function (err) {
        // A failed fetch (server down) is a TypeError with a browser message; say something useful instead
        throw new Error(err && err.name !== "TypeError" ? err.message : "Can’t reach the NEKAI server.");
      });
    pending.then(done, done);
    function done() { pending = null; }
    return pending;
  }

  NEKAI.recommend = {
    load: load,
    fresh: fresh,
    busy: function () { return !!pending; },
  };
})();
