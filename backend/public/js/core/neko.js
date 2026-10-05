/* Neko chat: the floating Neko button (and any other [data-neko-chat] button) opens a chat box. Questions go to
 * the backend (/api/neko/chat), which asks Gemini with a snapshot of the user's list.
 * The conversation is saved to Supabase (the neko_conversations / neko_messages tables), so it follows the
 * user to other pages and devices. Clearing it starts a new conversation.
 */
(function () {
  "use strict";
  var S = NEKAI.store, U = NEKAI.ui, esc = U.esc, icon = U.icon;
  var DB = NEKAI.db.neko;
  var MAX_KEEP = 30; // messages shown in the chat box (all of them stay saved)
  var MAX_SEND = 12; // messages sent with each question
  var SUGGESTIONS = [
    "What should I watch next?",
    "How’s my streak going?",
    "Something like my top-rated anime",
    "How do I level up faster?",
  ];

  var messages = []; // [{ id, role: "user" | "neko", text }]
  var conversation = null; // id of the saved conversation, once there is one
  var loaded = null; // loads the latest conversation the first time the chat opens
  var saving = Promise.resolve(); // messages save one after another, in order
  var busy = false, failed = "", panel, logEl, form, input, sendBtn, opener;

  // Loads the latest saved conversation from Supabase the first time the chat opens
  function load() {
    if (!loaded) {
      busy = true;
      loaded = DB.latest().then(function (c) {
        conversation = c.id;
        messages = c.messages.concat(messages).slice(-MAX_KEEP);
      }).catch(function (err) {
        console.error("Loading the Neko chat failed:", err);
      }).then(function () {
        busy = false;
        if (panel) render();
      });
    }
    return loaded;
  }
  // Adds a message to the chat and saves it (the first message also starts the conversation)
  function save(role, text) {
    var msg = { id: crypto.randomUUID(), role: role, text: text };
    messages.push(msg);
    messages = messages.slice(-MAX_KEEP);
    saving = saving.then(function () {
      return conversation || DB.start(role === "user" ? text : "").then(function (id) { return (conversation = id); });
    }).then(function (id) {
      return DB.add(id, msg);
    }).catch(function (err) {
      console.error("Saving the Neko chat failed:", err);
      U.toast("Couldn’t save this chat. It will be gone when you leave the page.");
    });
  }

  /* ---------- what Neko knows about the user ---------- */
  // The snapshot sent with every question. Neko only knows what's in here.
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
  // One chat message; screen readers hear who said it
  function bubble(role, html, extra) {
    return '<div class="lchat-msg lchat-' + role + (extra ? " " + extra : "") + '">' +
      (role === "neko" ? '<span class="lchat-avatar" aria-hidden="true">' + U.nekoSvg(28) + "</span>" : "") +
      '<div class="lchat-bubble">' + (role === "user" ? '<span class="sr">You: </span>' : '<span class="sr">Neko: </span>') + html + "</div></div>";
  }
  // Redraws the conversation: greeting and page tip, messages, typing dots, error, suggestions
  function render() {
    // Neko's greeting carries this page's tip (streak reminders and the like) and its link
    var tip = U.nekoTip || {};
    var html = bubble("neko", "<p>Hi " + esc(S.state.profile.name) + "! I’m Neko. Ask me for a recommendation, about your list and streak, or anything anime.</p>" +
      (tip.text ? "<p>" + esc(tip.text) + "</p>" : "") +
      (tip.cta ? '<a class="btn btn-accent lchat-cta" href="' + esc(tip.cta[0]) + '">' + esc(tip.cta[1]) + "</a>" : ""));
    messages.forEach(function (m) {
      html += bubble(m.role, m.role === "user" ? "<p>" + esc(m.text).replace(/\n/g, "<br>") + "</p>" : format(m.text));
    });
    if (busy) html += bubble("neko", '<span class="lchat-typing" aria-label="Neko is typing"><i></i><i></i><i></i></span>', "is-typing");
    if (failed) html += bubble("neko", "<p>" + esc(failed) + '</p><button type="button" class="btn btn-ghost lchat-retry" data-lchat="retry">Try again</button>', "is-error");
    if (!messages.length && !busy)
      html += '<div class="lchat-chips" aria-label="Suggested questions">' + SUGGESTIONS.map(function (s) {
        return '<button type="button" class="chip" data-lchat="ask">' + esc(s) + "</button>";
      }).join("") + "</div>";
    logEl.innerHTML = html;
    logEl.scrollTop = logEl.scrollHeight;
    sendBtn.disabled = busy;
  }

  // Creates the chat box the first time it opens and wires up its form and buttons
  function build() {
    panel = document.createElement("section");
    panel.className = "lchat";
    panel.id = "lchat";
    panel.inert = true; // closed: out of the tab order until it opens
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-labelledby", "lchat-h");
    panel.innerHTML =
      '<header class="lchat-head"><span class="lchat-face" aria-hidden="true">' + U.nekoSvg(32) + "</span>" +
        '<div class="grow"><h2 id="lchat-h" class="h3">Neko</h2><p class="caption">Your watch buddy</p></div>' +
        '<button type="button" class="btn btn-ghost btn-icon" data-lchat="clear" aria-label="Start a new chat" title="New chat">' + icon("trash", 18) + "</button>" +
        '<button type="button" class="btn btn-ghost btn-icon" data-lchat="close" aria-label="Close chat">' + icon("x", 18) + "</button></header>" +
      '<div class="lchat-log" role="log" aria-live="polite" aria-label="Conversation with Neko" tabindex="0"></div>' +
      '<form class="lchat-form"><label class="sr" for="lchat-in">Message Neko</label>' +
        '<textarea id="lchat-in" rows="1" maxlength="1000" placeholder="Ask Neko anything about anime…" autocomplete="off"></textarea>' +
        '<button type="submit" class="btn btn-accent btn-icon" aria-label="Send">' + icon("arrow", 20) + "</button></form>" +
      '<p class="caption muted lchat-note">Neko is an AI and can make mistakes.</p>';
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
          body: "This clears your conversation with Neko. It can’t be undone.",
          confirm: "Clear chat",
          danger: true,
          icon: "trash",
        }).then(function (ok) {
          if (!ok) return;
          var old = conversation;
          conversation = null;
          messages = [];
          failed = "";
          saving = saving.then(function () { return DB.clear(old); }).catch(function (err) {
            console.error("Clearing the Neko chat failed:", err);
          });
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
  // Adds the user's message and sends it
  function ask(text) {
    text = String(text || "").trim();
    if (!text || busy) return;
    save("user", text.slice(0, 1000));
    input.value = "";
    input.style.height = "";
    send();
  }
  // Sends the latest MAX_SEND messages with a fresh context (also used by Try again)
  function send() {
    busy = true;
    failed = "";
    render();
    NEKAI.db.token()
      .then(function (token) {
        if (!token) throw new Error("Your session expired. Please sign in again.");
        return fetch("/api/neko/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({
            messages: messages.slice(-MAX_SEND).map(function (m) { return { role: m.role, text: m.text }; }),
            context: context(),
          }),
        });
      })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (!res.ok || !body.reply) throw new Error(body.error || "Neko couldn’t answer just now. Please try again.");
          return body.reply;
        });
      })
      .then(function (reply) {
        save("neko", reply);
      })
      .catch(function (err) {
        failed = err && err.message && err.name !== "TypeError" ? err.message
          : "Can’t reach Neko. Check that the NEKAI server is running, then try again.";
      })
      .then(function () {
        busy = false;
        render();
        if (isOpen()) input.focus();
      });
  }

  /* ---------- open / close ----------
     The box stays in the page and animates with the .is-open class (see neko-chat.css),
     so opening and closing are both smooth. */
  // The floating Neko button (added by ui.shell when Neko is on)
  function fab() {
    return document.querySelector(".neko-fab");
  }
  function isOpen() {
    return !!panel && panel.classList.contains("is-open");
  }
  // The button steps aside while the chat is open, since the chat sits in its place
  function setFab(open) {
    var b = fab();
    if (!b) return;
    b.setAttribute("aria-expanded", String(open));
    b.inert = open; // hidden while the chat sits in its place
  }
  // from: the button that opened the chat (focus returns there on close)
  function open(from) {
    stopPeeks(); // Neko has been found: no more "peek" bubbles this session (below)
    var first = !panel;
    if (first) build();
    opener = from || document.activeElement;
    load();
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
    var b = e.target.closest("[data-neko-chat]");
    if (!b) return;
    e.preventDefault();
    if (isOpen()) close();
    else open(b);
  });

  /* ---------- "peek" bubbles ----------
     The button is small, so while the chat is closed Neko says hello now and then: a speech bubble
     beside the button, 8 s after the page opens, then again after each 30 s break; about 7 s each, cycling through
     PEEKS in order (carrying on across pages). Clicking it opens the chat. They stop for the rest of
     this tab's session once the chat has been opened or a bubble is dismissed with ×, and pause while
     the chat is open, the Library's multi-select is on (the button steps aside), or the tab is hidden.
     The bubble is decoration for pointer users: the button itself stays the accessible way in, so
     screen readers aren't interrupted every 30 seconds. */
  var PEEKS = [
    "Hi, I’m Neko! Tap me to chat.",
    "Psst… need something to watch tonight?",
    "Ask me how your streak is going!",
    "Tell me a mood and I’ll find an anime to match.",
    "Curious how close your next badge is? Just ask.",
  ];
  var PEEK_FIRST = 8000, PEEK_SHOW = 7000, PEEK_REST = 30000; // first after 8 s; each shows 7 s, then a 30 s break
  var peekEl = null, peekHideTimer = null;
  function peeksOff() {
    try { return sessionStorage.getItem("nekai:neko-peek") === "off"; } catch (e) { return false; }
  }
  function stopPeeks() {
    try { sessionStorage.setItem("nekai:neko-peek", "off"); } catch (e) { /* storage unavailable: just hide it */ }
    hidePeek();
  }
  function nextPeekText() {
    var i = 0;
    try { i = Number(sessionStorage.getItem("nekai:neko-peek-i")) || 0; } catch (e) { /* start at the first */ }
    try { sessionStorage.setItem("nekai:neko-peek-i", String((i + 1) % PEEKS.length)); } catch (e) { /* fine */ }
    return PEEKS[i % PEEKS.length];
  }
  function canPeek() {
    var b = fab(), h = document.documentElement;
    return !!b && !peeksOff() && !isOpen() && !document.hidden &&
      !h.classList.contains("lib-selecting") && !h.classList.contains("drawer-open") &&
      !document.querySelector("dialog[open]");
  }
  function buildPeek() {
    peekEl = document.createElement("div");
    peekEl.className = "neko-peek";
    peekEl.setAttribute("aria-hidden", "true");
    peekEl.innerHTML = '<span class="neko-peek-text"></span>' +
      '<button type="button" class="neko-peek-x" tabindex="-1" title="Hide these for now">' + icon("x", 12, 3) + "</button>";
    peekEl.addEventListener("click", function (e) {
      if (e.target.closest(".neko-peek-x")) { stopPeeks(); return; }
      hidePeek();
      open(fab());
    });
    document.body.appendChild(peekEl);
  }
  var peekMissed = false; // one came due while the tab was in the background
  function showPeek() {
    if (document.hidden) { peekMissed = true; return; }
    if (!canPeek()) return;
    peekMissed = false;
    if (!peekEl) buildPeek();
    peekEl.querySelector(".neko-peek-text").textContent = nextPeekText();
    peekEl.classList.remove("is-shown");
    void peekEl.offsetWidth; // restart the pop-in
    peekEl.classList.add("is-shown");
    clearTimeout(peekHideTimer);
    peekHideTimer = setTimeout(hidePeek, PEEK_SHOW);
  }
  function hidePeek() {
    clearTimeout(peekHideTimer);
    if (peekEl) peekEl.classList.remove("is-shown");
  }
  // one bubble, then it rests: the next comes PEEK_REST after this one has gone
  function peekLoop() {
    if (peeksOff()) return;
    showPeek();
    setTimeout(peekLoop, PEEK_SHOW + PEEK_REST);
  }
  if (!peeksOff()) setTimeout(peekLoop, PEEK_FIRST);
  // back on the tab: catch up with a bubble that came due while away, after a short pause
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) hidePeek();
    else if (peekMissed) setTimeout(showPeek, 1500);
  });

  NEKAI.neko = { open: open, close: close };
})();
