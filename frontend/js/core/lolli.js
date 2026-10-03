/* Lolli chat: the floating Lolli button (and any other [data-lolli-chat] button) opens a chat box. Questions go to
 * the backend (/api/lolli/chat), which asks Gemini with a snapshot of the user's list.
 * The conversation is kept for this browser tab in sessionStorage.
 */
(function () {
  "use strict";
  var S = NEKAI.store, U = NEKAI.ui, esc = U.esc, icon = U.icon;
  var KEY = "nekai:lolli";
  var MAX_KEEP = 30; // messages remembered for the tab
  var MAX_SEND = 12; // messages sent with each question
  var SUGGESTIONS = [
    "What should I watch next?",
    "How’s my streak going?",
    "Something like my top-rated anime",
    "How do I level up faster?",
  ];

  var messages = load(); // [{ role: "user" | "lolli", text }]
  var busy = false, failed = "", panel, logEl, form, input, sendBtn, opener;

  function load() {
    try {
      var m = JSON.parse(sessionStorage.getItem(KEY) || "[]");
      return Array.isArray(m) ? m : [];
    } catch (e) {
      return [];
    }
  }
  function save() {
    messages = messages.slice(-MAX_KEEP);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(messages));
    } catch (e) {
      /* storage unavailable: the chat still works for this page */
    }
  }

  /* ---------- what Lolli knows about the user ---------- */
  function context() {
    var st = S.streak(), t = S.totals(), lv = S.xp();
    var list = S.ids().map(S.entry).sort(function (a, b) { return b.updatedAt - a.updatedAt; }).slice(0, 40);
    var ach = S.achievements();
    return {
      name: S.state.profile.name,
      page: (location.pathname.split("/").pop() || "index.html").replace(".html", ""),
      today: S.dayKey(),
      counts: S.counts(),
      streak: { current: st.current, loggedToday: st.loggedToday, longest: S.longestStreak(), remindersOn: !!S.state.settings.streak },
      level: lv.level,
      title: lv.title,
      nextTitle: lv.nextTitle,
      xp: lv.xp,
      xpFrom: lv.from,
      xpToNextLevel: lv.need - lv.into,
      episodesWatched: t.episodes,
      averageRating: t.mean || null,
      pickedGenres: (S.state.favGenres || []).slice(0, 3), // the genres they said they love at sign-up
      favoriteGenres: S.genreMix().filter(function (g) { return g.name !== "Other"; }).map(function (g) { return g.name + " " + g.pct + "%"; }),
      achievements: {
        earned: ach.filter(function (a) { return a.earned; }).map(function (a) { return a.name; }),
        next: ach.filter(function (a) { return !a.earned; }).map(function (a) { return a.name + " (" + a.desc + "; " + a.progress + ")"; }),
      },
      list: list.map(function (e) {
        return {
          title: e.title,
          status: e.status,
          progress: e.known ? e.watched + "/" + e.episodes : e.watched + " eps",
          rating: e.rating || null,
          genres: e.genres.slice(0, 4),
        };
      }),
    };
  }

  /* ---------- rendering ---------- */
  // Plain text in, safe HTML out: **bold**, "- " bullets and line breaks
  function format(text) {
    var html = "", items = [];
    function flush() {
      if (items.length) html += "<ul>" + items.join("") + "</ul>";
      items = [];
    }
    String(text).split("\n").forEach(function (line) {
      var safe = esc(line).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      var bullet = /^\s*[-*•]\s+(.*)$/.exec(safe);
      if (bullet) items.push("<li>" + bullet[1] + "</li>");
      else {
        flush();
        if (safe.trim()) html += "<p>" + safe + "</p>";
      }
    });
    flush();
    return html;
  }
  function bubble(role, html, extra) {
    return '<div class="lchat-msg lchat-' + role + (extra ? " " + extra : "") + '">' +
      (role === "lolli" ? '<span class="lchat-avatar" aria-hidden="true">' + U.lolliSvg(28) + "</span>" : "") +
      '<div class="lchat-bubble">' + (role === "user" ? '<span class="sr">You: </span>' : '<span class="sr">Lolli: </span>') + html + "</div></div>";
  }
  function render() {
    // Lolli's greeting carries this page's tip (streak reminders and the like) and its link
    var tip = U.lolliTip || {};
    var html = bubble("lolli", "<p>Hi " + esc(S.state.profile.name) + "! I’m Lolli. Ask me for a recommendation, about your list and streak, or anything anime.</p>" +
      (tip.text ? "<p>" + esc(tip.text) + "</p>" : "") +
      (tip.cta ? '<a class="btn btn-accent lchat-cta" href="' + esc(tip.cta[0]) + '">' + esc(tip.cta[1]) + "</a>" : ""));
    messages.forEach(function (m) {
      html += bubble(m.role, m.role === "user" ? "<p>" + esc(m.text).replace(/\n/g, "<br>") + "</p>" : format(m.text));
    });
    if (busy) html += bubble("lolli", '<span class="lchat-typing" aria-label="Lolli is typing"><i></i><i></i><i></i></span>', "is-typing");
    if (failed) html += bubble("lolli", "<p>" + esc(failed) + '</p><button type="button" class="btn btn-ghost lchat-retry" data-lchat="retry">Try again</button>', "is-error");
    if (!messages.length && !busy)
      html += '<div class="lchat-chips" aria-label="Suggested questions">' + SUGGESTIONS.map(function (s) {
        return '<button type="button" class="chip" data-lchat="ask">' + esc(s) + "</button>";
      }).join("") + "</div>";
    logEl.innerHTML = html;
    logEl.scrollTop = logEl.scrollHeight;
    sendBtn.disabled = busy;
  }

  function build() {
    panel = document.createElement("section");
    panel.className = "lchat";
    panel.id = "lchat";
    panel.inert = true; // closed: out of the tab order until it opens
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-labelledby", "lchat-h");
    panel.innerHTML =
      '<header class="lchat-head"><span class="lchat-face" aria-hidden="true">' + U.lolliSvg(32) + "</span>" +
        '<div class="grow"><h2 id="lchat-h" class="h3">Lolli</h2><p class="caption">Your watch buddy</p></div>' +
        '<button type="button" class="btn btn-ghost btn-icon" data-lchat="clear" aria-label="Start a new chat" title="New chat">' + icon("trash", 18) + "</button>" +
        '<button type="button" class="btn btn-ghost btn-icon" data-lchat="close" aria-label="Close chat">' + icon("x", 18) + "</button></header>" +
      '<div class="lchat-log" role="log" aria-live="polite" aria-label="Conversation with Lolli" tabindex="0"></div>' +
      '<form class="lchat-form"><label class="sr" for="lchat-in">Message Lolli</label>' +
        '<textarea id="lchat-in" rows="1" maxlength="1000" placeholder="Ask Lolli anything about anime…" autocomplete="off"></textarea>' +
        '<button type="submit" class="btn btn-accent btn-icon" aria-label="Send">' + icon("arrow", 20) + "</button></form>" +
      '<p class="caption muted lchat-note">Lolli is an AI and can make mistakes.</p>';
    document.body.appendChild(panel);
    logEl = panel.querySelector(".lchat-log");
    form = panel.querySelector("form");
    input = panel.querySelector("textarea");
    sendBtn = form.querySelector("[type=submit]");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      ask(input.value);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        ask(input.value);
      }
    });
    // Grow with the text, up to about five lines
    input.addEventListener("input", function () {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
    });
    panel.addEventListener("click", function (e) {
      var b = e.target.closest("[data-lchat]");
      if (!b) return;
      var act = b.dataset.lchat;
      if (act === "close") close();
      else if (act === "ask") ask(b.textContent);
      else if (act === "retry") send();
      else if (act === "clear") {
        if (!messages.length && !failed) return; // nothing to clear
        U.confirm({
          title: "Start a new chat?",
          body: "This clears your conversation with Lolli. It can’t be undone.",
          confirm: "Clear chat",
          danger: true,
          icon: "trash",
        }).then(function (ok) {
          if (!ok) return;
          messages = [];
          failed = "";
          save();
          render();
          input.focus();
        });
      }
    });
    // Esc inside the chat closes only the chat. Listening on window in the capture phase
    // runs before the detail panel's own Esc handler on document.
    window.addEventListener(
      "keydown",
      function (e) {
        if (e.key !== "Escape" || !isOpen() || !panel.contains(document.activeElement)) return;
        e.stopPropagation();
        close();
      },
      true,
    );
  }

  /* ---------- talking to the backend ---------- */
  function ask(text) {
    text = String(text || "").trim();
    if (!text || busy) return;
    messages.push({ role: "user", text: text.slice(0, 1000) });
    save();
    input.value = "";
    input.style.height = "";
    send();
  }
  function send() {
    busy = true;
    failed = "";
    render();
    fetch("/api/lolli/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messages.slice(-MAX_SEND), context: context() }),
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (!res.ok || !body.reply) throw new Error(body.error || "Lolli couldn’t answer just now. Please try again.");
          return body.reply;
        });
      })
      .then(function (reply) {
        messages.push({ role: "lolli", text: reply });
        save();
      })
      .catch(function (err) {
        failed = err && err.message && err.name !== "TypeError" ? err.message
          : "Can’t reach Lolli. Check that the NEKAI server is running, then try again.";
      })
      .then(function () {
        busy = false;
        render();
        if (isOpen()) input.focus();
      });
  }

  /* ---------- open / close ----------
     The box stays in the page and animates with the .is-open class (see lolli-chat.css),
     so opening and closing are both smooth. */
  function fab() {
    return document.querySelector(".lolli-fab");
  }
  function isOpen() {
    return !!panel && panel.classList.contains("is-open");
  }
  function setFab(open) {
    var b = fab();
    if (!b) return;
    b.setAttribute("aria-expanded", String(open));
    b.inert = open; // hidden while the chat sits in its place
  }
  function open(from) {
    var first = !panel;
    if (first) build();
    opener = from || document.activeElement;
    render();
    panel.inert = false;
    if (first) void panel.offsetWidth; // let the closed state paint once so the first open animates too
    panel.classList.add("is-open");
    document.documentElement.classList.add("lchat-open");
    setFab(true);
    input.focus({ preventScroll: true });
  }
  function close() {
    if (!isOpen()) return;
    panel.classList.remove("is-open");
    panel.inert = true;
    document.documentElement.classList.remove("lchat-open");
    setFab(false);
    var back = opener && document.contains(opener) && opener.offsetParent ? opener : fab();
    if (back) back.focus({ preventScroll: true });
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-lolli-chat]");
    if (!b) return;
    e.preventDefault();
    if (isOpen()) close();
    else open(b);
  });

  NEKAI.lolli = { open: open, close: close };
})();
