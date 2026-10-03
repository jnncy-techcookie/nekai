/* Welcome: a new account picks the 3 genres it loves. They seed the AI picks and match
   scores until the user has added or rated anything. */
(function () {
  "use strict";
  var S = NEKAI.store, U = NEKAI.ui, esc = U.esc, icon = U.icon;
  if (!S.state.signedIn) { location.replace("signin.html"); return; }

  var MAX = 3;
  // MyAnimeList genre names (so they match titles' genres), the icon Discover's genre pills used, and a short hint
  var GENRES = [
    ["Action", "swords", "Big fights, bigger stakes"],
    ["Adventure", "mountain", "Journeys and new worlds"],
    ["Comedy", "smile", "Here for the laughs"],
    ["Drama", "masks", "Stories that hit hard"],
    ["Fantasy", "spark", "Magic and myth"],
    ["Romance", "heart", "Hearts on the line"],
    ["Sci-Fi", "planet", "Mechs, space, tomorrow"],
    ["Slice of Life", "leaf", "Everyday, done warmly"],
    ["Mystery", "search", "Clues and twists"],
    ["Supernatural", "moon", "Spirits and the unseen"],
    ["Sports", "ball", "Grit and game days"],
    ["Horror", "ghost", "Lights-on viewing"],
  ];
  var picked = (S.state.favGenres || []).filter(function (g) {
    return GENRES.some(function (x) { return x[0] === g; });
  }).slice(0, MAX);

  var name = (S.state.profile.name || "").trim();
  if (name) U.$("#ob-hi").textContent = "Welcome to NEKAI, " + name;

  // Draws the 12 genre tiles (numbered in pick order), the progress bar and the Continue button
  function render() {
    var full = picked.length >= MAX;
    U.$("#ob-grid").innerHTML = GENRES.map(function (g, i) {
      var at = picked.indexOf(g[0]), on = at >= 0, off = full && !on;
      return '<button type="button" class="ob-g tone-' + (i % 4) + '" data-genre="' + esc(g[0]) + '" aria-pressed="' + on + '"' +
        (off ? ' aria-disabled="true"' : "") + ">" +
        '<span class="ob-stamp" aria-hidden="true">' + icon(g[1], 24, 2.2) + "</span>" +
        '<span class="ob-g-text"><span class="ob-g-name">' + esc(g[0]) + '</span><span class="ob-g-hint">' + esc(g[2]) + "</span></span>" +
        (on ? '<span class="ob-order" aria-hidden="true">' + (at + 1) + "</span>" : "") +
        "</button>";
    }).join("");
    U.$("#ob-fill").style.width = (100 * picked.length) / MAX + "%";
    U.$("#ob-count").textContent = full
      ? "Nice taste: " + picked.join(", ")
      : picked.length ? picked.length + " of 3 picked · " + (MAX - picked.length) + " to go" : "Pick 3 to continue";
    U.$("#ob-go").disabled = !full;
  }

  U.$("#ob-grid").addEventListener("click", function (e) {
    var b = e.target.closest("[data-genre]");
    if (!b || b.getAttribute("aria-disabled") === "true") return;
    var g = b.dataset.genre, at = picked.indexOf(g);
    if (at >= 0) picked.splice(at, 1);
    else if (picked.length < MAX) picked.push(g);
    render();
    var again = U.$('[data-genre="' + g.replace(/"/g, '\\"') + '"]');
    if (again) again.focus(); // keep keyboard focus on the tile after the re-render
  });

  U.$("#ob-go").addEventListener("click", function () {
    if (picked.length < MAX) return;
    S.setFavGenres(picked);
    location.href = "index.html";
  });

  render();
})();
