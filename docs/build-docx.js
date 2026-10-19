#!/usr/bin/env node
/* Builds docs/technical-documentation.docx, the editable Word version of the technical documentation.
 *
 *   cd docs && npm install && node build-docx.js
 *
 * Screenshots: if docs/screenshots/<name>.png exists it is embedded; otherwise a yellow placeholder box
 * is written (type over it, or paste the screenshot into it in Word). Fill-ins for the group (course,
 * roles, ...) are highlighted yellow.
 *
 * The PDF (build.js) is generated from src/technical-documentation.html. This file carries the same
 * text for Word, so when the wording changes, change it in both.
 */
const fs = require("node:fs");
const path = require("node:path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  AlignmentType, HeadingLevel, LevelFormat, ImageRun, Footer, PageNumber, TabStopType, HeightRule,
  VerticalAlign,
} = require("docx");

// ---------- page and palette ----------
const PAGE = { width: 11906, height: 16838 }; // A4, in DXA (1440 = 1 inch)
const MARGIN = { top: 1000, bottom: 1100, left: 1000, right: 1000 };
const W = PAGE.width - MARGIN.left - MARGIN.right; // content width: 9906
const C = { navy: "0F1F5C", blue: "1F3FA6", orange: "E25200", soft: "F4F6FC", line: "D7DBE8", code: "EEF1FA", grey: "55607F" };
const FONT = "Calibri";
const MONO = "Consolas";
const BODY = 20; // half-points: 10 pt
const SMALL = 18; // 9 pt

// ---------- inline markup: **bold**, `code`, {{fill-in}}, __italic__ ----------
const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\{\{[^}]+\}\}|__[^_]+__)/;
function runs(text, base = {}) {
  return text.split(TOKEN).filter((s) => s !== "").map((part) => {
    if (part.startsWith("**")) return new TextRun({ ...base, text: part.slice(2, -2), bold: true });
    if (part.startsWith("__")) return new TextRun({ ...base, text: part.slice(2, -2), italics: true });
    if (part.startsWith("{{")) return new TextRun({ ...base, text: part.slice(2, -2), bold: true, highlight: "yellow", color: "000000" });
    if (part.startsWith("`")) {
      const code = { ...base, text: part.slice(1, -1), font: MONO, size: (base.size || BODY) - 2 };
      if (!base.color) code.shading = { type: ShadingType.CLEAR, fill: C.code, color: "auto" };
      return new TextRun(code);
    }
    return new TextRun({ ...base, text: part });
  });
}

// ---------- building blocks ----------
const numberedRefs = [];

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 100, line: 269 },
    alignment: opts.align,
    keepNext: opts.keepNext,
    children: runs(text, { size: opts.size || BODY, color: opts.color }),
  });
}

function h1(text, { newPage = false } = {}) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: newPage, children: [new TextRun(text)] });
}
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });

function bullets(items) {
  return items.map((t, i) => new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: i === items.length - 1 ? 120 : 50, line: 264 },
    children: runs(t, { size: BODY }),
  }));
}

function numbered(items, size = BODY) {
  const reference = `num${numberedRefs.length}`;
  numberedRefs.push(reference);
  return items.map((t, i) => new Paragraph({
    numbering: { reference, level: 0 },
    spacing: { after: i === items.length - 1 ? 120 : 50, line: 264 },
    children: runs(t, { size }),
  }));
}

function note(text) {
  return new Paragraph({
    spacing: { before: 60, after: 140, line: 264 },
    indent: { left: 140, right: 100 },
    shading: { type: ShadingType.CLEAR, fill: "FFF6EA", color: "auto" },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: C.orange, space: 6 } },
    children: runs(text, { size: SMALL + 1 }),
  });
}

function codeBlock(text) {
  const lines = text.split("\n");
  return lines.map((line, i) => new Paragraph({
    keepNext: i < lines.length - 1,
    keepLines: true,
    spacing: { before: i === 0 ? 40 : 0, after: i === lines.length - 1 ? 140 : 0, line: 240 },
    indent: { left: 120, right: 60 },
    shading: { type: ShadingType.CLEAR, fill: "F1F3FA", color: "auto" },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: C.blue, space: 6 } },
    children: [new TextRun({ text: line === "" ? " " : line, font: MONO, size: 16 })],
  }));
}

const thin = { style: BorderStyle.SINGLE, size: 4, color: C.line };
const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

function cellParas(text, size, base) {
  return String(text).split("\n").map((line, i, all) => new Paragraph({
    spacing: { after: i === all.length - 1 ? 0 : 40, line: 252 },
    children: runs(line, { size, ...base }),
  }));
}

// fractions: column widths as shares of the content width (sum 1). header: array of strings. rows: arrays of strings.
function table(fractions, header, rows) {
  const widths = fractions.map((f) => Math.round(f * W));
  widths[widths.length - 1] += W - widths.reduce((a, b) => a + b, 0); // make the columns add up exactly
  const cell = (text, i, extra = {}, size = SMALL, base = {}) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA },
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    borders: { top: none, left: none, right: none, bottom: thin },
    children: cellParas(text, size, base),
    ...extra,
  });
  const head = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: header.map((t, i) => cell(t, i, { shading: { type: ShadingType.CLEAR, fill: C.navy, color: "auto" } }, SMALL, { bold: true, color: "FFFFFF" })),
  });
  const body = rows.map((r, ri) => new TableRow({
    cantSplit: true,
    children: r.map((t, i) => cell(t, i, ri % 2 === 1 ? { shading: { type: ShadingType.CLEAR, fill: C.soft, color: "auto" } } : {})),
  }));
  return [
    new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: widths, rows: [head, ...body] }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  ];
}

// ---------- figures ----------
const SHOTS = path.join(__dirname, "screenshots");

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function image(file, maxW, maxH) {
  const { w, h } = pngSize(file);
  const scale = Math.min(maxW / w, maxH / h, 1);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    keepNext: true,
    spacing: { before: 60, after: 40 },
    children: [new ImageRun({ type: "png", data: fs.readFileSync(file), transformation: { width: Math.round(w * scale), height: Math.round(h * scale) } })],
  });
}

function caption(text) {
  return new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text, italics: true, size: 17, color: C.grey, font: FONT })] });
}

function screenshot(file, what, cap) {
  const full = path.join(SHOTS, file);
  if (fs.existsSync(full)) return [image(full, 640, 257), caption(cap)];
  const dashed = { style: BorderStyle.DASHED, size: 12, color: "C89400" };
  return [
    new Table({
      width: { size: W, type: WidthType.DXA },
      columnWidths: [W],
      rows: [new TableRow({
        cantSplit: true,
        height: { value: 3000, rule: HeightRule.ATLEAST },
        children: [new TableCell({
          width: { size: W, type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          shading: { type: ShadingType.CLEAR, fill: "FFFBE0", color: "auto" },
          borders: { top: dashed, bottom: dashed, left: dashed, right: dashed },
          margins: { top: 100, bottom: 100, left: 200, right: 200 },
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: `INSERT SCREENSHOT: ${file}`, bold: true, size: 20, color: "5A4700", highlight: "yellow" })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: what, size: 18, color: "5A4700" })] }),
          ],
        })],
      })],
    }),
    caption(cap),
  ];
}

// ---------- cover ----------
function cover() {
  const band = new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: [W],
    rows: [new TableRow({
      children: [new TableCell({
        width: { size: W, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: C.navy, color: "auto" },
        margins: { top: 380, bottom: 300, left: 360, right: 360 },
        borders: { top: none, left: none, right: none, bottom: { style: BorderStyle.SINGLE, size: 36, color: C.orange } },
        children: [
          new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "SYSTEM ARCHITECTURE AND INTEGRATION  ·  FINAL PROJECT", color: "FFFFFF", size: 19, characterSpacing: 30 })] }),
          new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "NEKAI", color: "FFFFFF", bold: true, size: 72 })] }),
          new Paragraph({ children: [new TextRun({ text: "Technical Documentation", color: "FFFFFF", size: 28 })] }),
          new Paragraph({ children: [new TextRun({ text: "Containerized Infrastructure and CI/CD Automation using Docker and Jenkins", color: "FFFFFF", size: 24 })] }),
        ],
      })],
    })],
  });

  const labelFill = { type: ShadingType.CLEAR, fill: "F3EAD7", color: "auto" };
  const infoRows = [
    ["Course / Section", "{{fill in course and section}}"],
    ["Group name", "{{fill in group name}}"],
    ["Project", "NEKAI, an anime watchlist with an AI companion (Neko)"],
    ["Repository", "https://github.com/jnncy-techcookie/nekai"],
    ["Date", "October 20, 2026"],
  ];
  const wInfo = [Math.round(W * 0.26), W - Math.round(W * 0.26)];
  const info = new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: wInfo,
    rows: infoRows.map(([k, v]) => new TableRow({
      cantSplit: true,
      children: [
        new TableCell({ width: { size: wInfo[0], type: WidthType.DXA }, shading: labelFill, margins: { top: 70, bottom: 70, left: 120, right: 90 }, borders: { top: none, left: none, right: none, bottom: thin }, children: cellParas(k, 20, { bold: true, color: C.navy }) }),
        new TableCell({ width: { size: wInfo[1], type: WidthType.DXA }, margins: { top: 70, bottom: 70, left: 120, right: 90 }, borders: { top: none, left: none, right: none, bottom: thin }, children: cellParas(v, 20) }),
      ],
    })),
  });

  const members = table(
    [0.55, 0.45],
    ["Member", "Role (guidelines, Section 3)"],
    [
      ["Pugal, Jenna Cyrille {{M.I.}}", "{{assign role}}"],
      ["Madronero, Kristine {{M.I.}}", "{{assign role}}"],
      ["Gloria, Raiza Lhyn A.", "{{assign role}}"],
      ["{{Surname}}, Cheska Joyce {{M.I.}}", "{{assign role}}"],
      ["David, Heidee {{M.I.}}", "{{assign role}}"],
    ],
  );

  const contents = [
    "1. Project description and modules", "2. Architecture", "3. Technology stack", "4. Dockerfiles", "5. Docker Compose", "6. Jenkins setup",
    "7. Pipeline", "8. Testing strategy", "9. Rollback and data persistence", "10. Problems encountered", "11. Individual contributions and references",
  ];
  const half = Math.ceil(contents.length / 2);
  const wc = [Math.round(W / 2), W - Math.round(W / 2)];
  const col = (items, i) => new TableCell({
    width: { size: wc[i], type: WidthType.DXA },
    borders: { top: none, left: none, right: none, bottom: none },
    children: items.map((t) => new Paragraph({ spacing: { after: 50 }, children: [new TextRun({ text: t, size: 20, color: C.navy })] })),
  });
  const toc = new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: wc,
    rows: [new TableRow({ children: [col(contents.slice(0, half), 0), col(contents.slice(half), 1)] })],
  });

  return [
    band,
    new Paragraph({ spacing: { before: 280, after: 0 }, children: [] }),
    info,
    new Paragraph({ spacing: { before: 300, after: 80 }, keepNext: true, children: [new TextRun({ text: "Group members and roles", bold: true, size: 24, color: C.navy })] }),
    ...members,
    p("Roles: Project Lead / Scrum Master · DevOps / CI-CD Engineer · Infrastructure Engineer · Backend and Database Engineer · Frontend, QA and Documentation Lead.", { size: SMALL - 1, color: C.grey, after: 200 }),
    new Paragraph({ spacing: { before: 120, after: 80 }, keepNext: true, children: [new TextRun({ text: "Contents", bold: true, size: 24, color: C.navy })] }),
    toc,
  ];
}

// ============================== CONTENT ==============================
const body = [];
const add = (...xs) => xs.flat().forEach((x) => body.push(x));

// ---- 1. Project description ----
add(
  h1("1. Project description and modules", { newPage: true }),
  p("**NEKAI** is a responsive anime watchlist. People create an account, build a library (Watching, Plan to Watch, Completed, Dropped), log episodes, rate titles, and earn XP, levels, streaks and achievement badges. **Neko**, a chat companion powered by Google Gemini, knows the user's list and answers questions about it, and **Nekai's Picks** recommends new titles. Anime data (titles, posters, genres, episodes) comes from the Tenrai API, an unofficial MyAnimeList data provider."),
  p("The application is split into three modules of our own, plus a reverse proxy and a database, each in its own container. A fourth container, Jenkins, runs the CI/CD pipeline from a separate compose project."),
  table([0.13, 0.5, 0.21, 0.16], ["Container", "Responsibility", "Technology", "Health endpoint"], [
    ["**frontend**", "The browser interface: six static pages (Home, Library, Discover, Profile, Settings, Sign in), the Neko chat panel, the anime detail panel. Shows the deployed build number on every page (`/build.json`), which proves which version is live.", "HTML, CSS, JavaScript, served by Nginx", "`GET /health`"],
    ["**api**", "Accounts (sign up, sign in, password reset), every user's data (library, history, badges, settings, profile, Neko chats), profile pictures, and anime data from Tenrai through one rate-limited, cached queue. The only module that talks to the database.", "Node.js 24, Express 5, `pg`", "`GET /api/health` (200 only if PostgreSQL answers)"],
    ["**ai-service**", "Neko chat and Nekai's Picks through Gemini, with per-user rate limits, a fallback model and retry rules. It has no database: it asks the api to validate the session cookie and to look up anime.", "Node.js 24, Express 5", "`GET /health`"],
    ["**proxy**", "The single public entry point (the only published port). Routes `/` to the frontend, `/api/neko` and `/api/recommend` to the ai-service, and other `/api` paths and `/avatars` to the api.", "Nginx (unprivileged)", "`GET /health`"],
    ["**db**", "PostgreSQL with 13 tables (users, sessions, profiles, settings, anime catalog, library, watch history, achievements, recommendations, Neko chats). The schema is created from `db/init.sql` on first start. Data lives in the `pg-data` named volume.", "PostgreSQL 16", "`pg_isready`"],
  ]),
  p("Requirement coverage: three or more own modules in separate containers (frontend, api, ai-service); the api reads and writes the database; every backend module exposes a health endpoint; automated tests run in the pipeline for the api, the ai-service and the frontend."),
);

// ---- 2. Architecture ----
const diagram = path.join(__dirname, "architecture.png");
add(h1("2. Architecture"));
if (fs.existsSync(diagram)) add(image(diagram, 655, 492));
else add(p("{{architecture.png is missing: run node docs/build.js first}}"));
add(
  caption("Figure 1. Containers, ports, networks, volumes and request flow (also saved as docs/architecture.png)."),
  h2("Containers, ports, networks and volumes"),
  table([0.17, 0.11, 0.2, 0.17, 0.35], ["Container", "Internal port", "Published", "Networks", "Storage"], [
    ["proxy", "8080", "**host 8080** (`HTTP_PORT`)", "web-net", "none (config baked into the image)"],
    ["frontend", "8080", "no", "web-net", "none (site baked into the image)"],
    ["api", "3000", "no", "web-net, data-net", "`uploads` volume (profile pictures)"],
    ["ai-service", "3001", "no", "web-net", "none (stateless)"],
    ["db", "5432", "no", "data-net", "`pg-data` volume"],
    ["jenkins (separate project)", "8080", "127.0.0.1:8081 only", "default network of its own project", "`jenkins_home` volume; Docker socket mounted"],
  ]),
  p("**Network separation.** `web-net` holds the proxy, frontend, api and ai-service. `data-net` holds only the api and the database. The proxy, frontend and ai-service therefore cannot reach PostgreSQL at all, and the database port is never published to the host."),
  h2("Request flows"),
  ...numbered([
    "**Opening a page.** Browser → proxy `/` → frontend (static files). The page's scripts then call `/api/me`.",
    "**Loading and saving the user's data.** Browser → proxy `/api/me` → api → PostgreSQL. The api checks the session cookie (only a SHA-256 hash of the token is stored) and limits every query to the signed-in user's rows. Changes are saved as one batch in a single transaction.",
    "**Asking Neko.** Browser → proxy `/api/neko/chat` → ai-service. It asks the api who the user is (the cookie is passed on), then calls Gemini over HTTPS with the key from its environment. The browser never sees the key.",
    "**Searching anime.** Browser → proxy `/api/tenrai/...` → api → Tenrai. The api queues and caches requests across all users to respect Tenrai's rate limit.",
    "**Deploying.** `git push` → GitHub → Jenkins (webhook through ngrok, or Poll SCM) → the host's Docker Engine through the mounted socket, which builds the images and updates the application stack (Sections 6 and 7).",
  ]),
  p("Security-relevant design choices: only the proxy publishes a port; Jenkins' web UI is bound to `127.0.0.1`; services run as non-root users; secrets are supplied at run time and are not in the repository."),
);

// ---- 3. Technology stack ----
add(
  h1("3. Technology stack"),
  table([0.17, 0.2, 0.63], ["Component", "Choice", "Why we chose it"], [
    ["Containers", "Docker, Docker Compose", "Required by the project. Compose starts the whole stack with one command and expresses dependencies, health checks, networks and volumes in one file."],
    ["Reverse proxy and static server", "Nginx 1.27.5 (`nginx-unprivileged`, Alpine)", "Small, fast and well documented. The unprivileged image runs as a non-root user. Docker's DNS resolver plus variables in `proxy_pass` make Nginx re-resolve service names on every request, so a redeployed container is found without restarting the proxy."],
    ["Backend language and framework", "Node.js 24.22.0, Express 5", "One language across both backend services and the frontend, which the whole team can read. Node's built-in test runner (`node --test`) means the tests need no extra dependencies."],
    ["Database", "PostgreSQL 16.15 (Alpine)", "The data is relational (users own libraries, histories, badges and chats), so foreign keys with `on delete cascade`, check constraints and transactions fit well. We first used a hosted database (Supabase) and moved to a PostgreSQL container so the data lives in our own named volume."],
    ["Frontend", "Plain HTML, CSS, JavaScript", "No build step, so the image is just static files behind Nginx and the pipeline has nothing to compile."],
    ["AI", "Google Gemini API", "Has a free tier. Used for Neko and Nekai's Picks, with a fallback model and graceful degradation when no key or quota is available."],
    ["Anime data", "Tenrai API", "Free MyAnimeList data. Called only from the api, through a shared queue and cache."],
    ["CI/CD server", "Jenkins LTS 2.580.1 (JDK 21) in Docker", "Required by the project. Declarative pipeline as code, Stage View for the demo, and credentials storage for the production `.env`."],
    ["Git hosting and trigger", "GitHub; webhook through ngrok, with Poll SCM fallback", "Jenkins runs on a laptop with no public address. ngrok exposes it for instant webhooks; Poll SCM (every 2 minutes) keeps the pipeline automatic if the tunnel or network is down."],
    ["Testing", "`node:test` + `node:assert`", "Built into Node. Tests run inside Docker through a `test` build stage, so the Jenkins host needs no Node installed."],
  ]),
);

// ---- 4. Dockerfiles ----
add(
  h1("4. Dockerfiles"),
  p("Every module we wrote has its own Dockerfile and its own `.dockerignore`. The official PostgreSQL image is used for the database, with the schema added on top."),
  table([0.11, 0.3, 0.15, 0.44], ["Image", "Stages and base images", "Runs as", "Notes"], [
    ["api", "`base` → `test` → `production`\n`node:24.22.0-alpine`", "`node`", "`npm ci --omit=dev` in production. Upload directory created and owned by `node` so the mounted volume is writable. `HEALTHCHECK` on `/api/health`."],
    ["ai-service", "`base` → `test` → `production`\n`node:24.22.0-alpine`", "`node`", "Same pattern; `HEALTHCHECK` on `/health`."],
    ["frontend", "`test` (`node:24.22.0-alpine`) → `production` (`nginx-unprivileged:1.27.5-alpine`)", "`nginx`", "The `BUILD_NUMBER` build argument is written to `/build.json`. Config is copied in; the test files are removed from the final image."],
    ["proxy", "single stage\n`nginx-unprivileged:1.27.5-alpine`", "`nginx`", "Routing config baked in, so there is no bind mount."],
    ["db", "`postgres:16.15-alpine`", "official entrypoint drops to `postgres`", "`init.sql` is copied into `/docker-entrypoint-initdb.d`; it runs only when the data volume is empty, so existing data is never touched."],
  ]),
  h2("Practices applied"),
  ...bullets([
    "**Pinned, slim base images.** Alpine variants with exact version tags (for example `node:24.22.0-alpine`), so every build uses the same base. To update one, change the tag and let the pipeline's tests confirm it.",
    "**Layer caching.** `package*.json` is copied and installed before the source, so dependencies are re-installed only when they change.",
    "**Multi-stage builds with a test stage.** `docker build --target test ./api` runs the tests inside Docker. A failing test fails the build, which is exactly what Jenkins relies on as its quality gate. The `production` stage contains no dev dependencies or test files.",
    "**Non-root runtime.** Node services run as `node`; the Nginx images are the unprivileged variants (port 8080, no root).",
    "**.dockerignore** in each module excludes `node_modules`, `.env` files, upload data and the Dockerfile itself.",
    "**HEALTHCHECK** in every service image, used by Compose's `depends_on` conditions and by `docker compose up --wait`.",
    "**Config baked into images** (no bind mounts), which avoids host-path problems when Jenkins, itself in a container, runs Compose.",
  ]),
  ...codeBlock(`# api/Dockerfile (excerpt): the test stage is the pipeline's quality gate
FROM node:24.22.0-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

FROM base AS test
RUN npm test            # a failing test fails "docker build --target test"

FROM node:24.22.0-alpine AS production
...
USER node
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \\
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1`),
);

// ---- 5. Docker Compose ----
add(
  h1("5. Docker Compose"),
  p("`docker-compose.yml` (project name `nekai`) starts the whole application with `docker compose up -d --build`. Jenkins is deliberately not in this file (Section 6)."),
  h2("Services, dependencies and health checks"),
  table([0.14, 0.26, 0.6], ["Service", "Waits for (service_healthy)", "Health check"], [
    ["db", "nothing", "`pg_isready -U $POSTGRES_USER -d $POSTGRES_DB` every 10 s, 10 retries, 10 s start period"],
    ["api", "db", "`wget /api/health` every 15 s (answers 200 only when PostgreSQL is reachable)"],
    ["ai-service", "api", "`wget /health` every 15 s"],
    ["frontend", "nothing", "`wget /health` every 15 s"],
    ["proxy", "frontend, api, ai-service", "`wget /health` every 15 s"],
  ]),
  p("The start order is therefore **db → api → ai-service → proxy**, with the frontend in parallel. Every service has `restart: unless-stopped`."),
  h2("Networks and volumes"),
  ...bullets([
    "**Networks:** user-defined `web-net` (proxy, frontend, api, ai-service) and `data-net` (api, db).",
    "**Volumes:** `pg-data` (all accounts, lists, history and chats) and `uploads` (profile pictures). `docker compose down` followed by `up` keeps both; only `down -v` deletes them, and the pipeline never uses `-v`.",
    "**Published ports:** only the proxy (`${HTTP_PORT:-8080}:8080`).",
  ]),
  h2("Environment variables and secrets"),
  p("All configuration comes from environment variables. The real `.env` is never committed (it is in `.gitignore`); `.env.example` holds placeholders. In Jenkins the production `.env` is a **Secret file** credential (`nekai-env`) passed to Compose with `--env-file`, so it is never copied into the workspace."),
  table([0.29, 0.28, 0.43], ["Variable", "Default / rule", "Used by"], [
    ["`DB_USER`, `DB_PASSWORD`", "**required** (`${VAR:?}`)", "db (creates the user) and api (`PGUSER`, `PGPASSWORD`)"],
    ["`DB_NAME`", "`nekai`", "db, api"],
    ["`HTTP_PORT`", "`8080`", "the proxy's published port"],
    ["`TAG`", "`latest`; Jenkins sets the build number", "image tags `nekai/<service>:${TAG}` and the build label on the page"],
    ["`GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`", "optional; the app works without a key", "ai-service"],
    ["`APP_URL`, `SMTP_*`, `MAIL_FROM`", "optional; without SMTP the reset email is printed in the api log", "api (password reset links)"],
  ]),
  p("Images are named `nekai/<service>:${TAG}`. Because each deploy keeps its build-numbered images, an earlier version can be started again without rebuilding (Section 9)."),
);

// ---- 6. Jenkins setup ----
add(
  h1("6. Jenkins setup"),
  h2("Installation"),
  p("Jenkins runs in Docker from its own compose project, `infra/jenkins/`, so the pipeline can never redeploy Jenkins itself."),
  ...bullets([
    "**Image** (`infra/jenkins/Dockerfile`): `jenkins/jenkins:2.580.1-jdk21` plus the Docker CLI and the Compose plugin from Docker's apt repository. Plugins are installed into the image with `jenkins-plugin-cli` from `plugins.txt` at pinned versions, so the setup wizard has nothing to download. Build arguments allow a mirror when jenkins.io is unreachable.",
    "**Compose** (`infra/jenkins/docker-compose.yml`): the `jenkins_home` named volume keeps jobs, plugins and credentials; the host's `/var/run/docker.sock` is mounted so the pipeline can build and deploy; the UI is published as `127.0.0.1:8081`, reachable only from the same computer (and through ngrok for the webhook).",
    "**Start:** `cd infra/jenkins && docker compose up -d --build`, then `docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword` for the unlock password. Check with `docker exec jenkins docker ps`.",
  ]),
  p("**Plugins** (pinned in `plugins.txt`): Pipeline (`workflow-aggregator`), Git, GitHub, GitHub Branch Source, Credentials Binding, Docker Pipeline, Pipeline Stage View, Timestamper, Workspace Cleanup, Build Timeout, Folders, OWASP Markup Formatter and Matrix Authorization."),
  h2("Credentials"),
  p("One credential is needed: **Secret file**, ID `nekai-env`, containing the production `.env` (same format as `.env.example`). The Jenkinsfile only refers to the ID through `withCredentials`; no secret appears in the repository. A GitHub access token credential would be added only if the repository were private."),
  h2("Jobs"),
  table([0.17, 0.43, 0.4], ["Job", "Definition", "Purpose"], [
    ["`nekai`", "Pipeline script from SCM, GitHub repository, branch `*/main`, Script Path `Jenkinsfile`", "Test, build and deploy on every push"],
    ["`nekai-rollback`", "Pipeline script from SCM, same repository, Script Path `Jenkinsfile.rollback`", "Parameterized, manual rollback (Section 9)"],
  ]),
  h2("Trigger configuration"),
  p("The Jenkinsfile declares **both** triggers, so the pipeline starts by itself without anyone pressing Build Now:"),
  ...bullets([
    "**Webhook (instant):** `githubPush()`. Jenkins is exposed with `ngrok http 8081`, and the GitHub repository has a webhook (Settings → Webhooks) with Payload URL `https://<ngrok-url>/github-webhook/`, content type `application/json`, push events.",
    "**Poll SCM (fallback):** `pollSCM('H/2 * * * *')` checks GitHub every two minutes. It needs no public URL and keeps the pipeline automatic if the tunnel or the network is down.",
  ]),
  p("Jenkins registers triggers declared in a Jenkinsfile after the job has run once, so the job is run once by hand after it is created."),
  ...screenshot("github-webhook.png", "GitHub → Settings → Webhooks: the webhook to the ngrok URL showing a recent delivery with a green tick.", "Figure 2. GitHub webhook pointing at Jenkins."),
  note("**Security note.** Mounting `/var/run/docker.sock` and running Jenkins as root gives Jenkins full control of the host's Docker, which is acceptable on a lab laptop but not in production. Safer designs: dedicated build agents, rootless Docker, Docker-in-Docker over TLS, or daemonless builders such as Kaniko or BuildKit. Our mitigations here: the Jenkins port is bound to `127.0.0.1`, and no secret is stored in the repository."),
);

// ---- 7. Pipeline ----
add(
  h1("7. Pipeline"),
  p("The declarative `Jenkinsfile` in the repository root is the pipeline as code. It sets `COMPOSE_PROJECT_NAME=nekai` and `TAG=${BUILD_NUMBER}`, runs one build at a time (`disableConcurrentBuilds`), keeps the last 15 builds, and times out after 20 minutes."),
  table([0.15, 0.55, 0.3], ["Stage", "What it does", "On failure"], [
    ["**Checkout**", "`checkout scm`: gets the commit that triggered the build.", "Pipeline stops; nothing changes."],
    ["**Test**", "Runs `docker build --no-cache --target test` for the api, the ai-service and the frontend. The tests execute inside the build.", "**Quality gate.** The pipeline stops here. No production image is built and nothing is deployed, so the running app keeps its previous version."],
    ["**Build Images**", "`docker compose build` with the `nekai-env` secret file. Images are tagged with the build number.", "Pipeline stops; running containers are untouched."],
    ["**Deploy**", "`docker compose up -d --no-build --wait --wait-timeout 120`. Compose recreates only changed services and waits until every health check passes. Volumes are kept.", "Build fails. The new containers may be unhealthy, so the remedy is the rollback job."],
    ["**Smoke Test / Verify**", "`scripts/smoke-test.js` runs inside the api container: proxy `/health`, the frontend page, `/api/health` (proves the database connection), the ai-service `/health`, AI routing through the proxy, and that `/build.json` reports __this__ build number. It retries for up to a minute while services settle.", "Build fails; remedy is the rollback job."],
  ]),
  p("**Post actions.** On success the build reports that build N is deployed and verified; on failure it prints which stage to open and points to the `nekai-rollback` job. The same smoke-test script is shared with the rollback pipeline."),
  ...screenshot("jenkins-stage-view.png", "Jenkins → nekai → Stage View after a successful build, showing Checkout, Test, Build Images, Deploy and Smoke Test / Verify all green.", "Figure 3. Stage View of a successful run."),
  ...screenshot("jenkins-failed-test.png", "Stage View of a build that fails at Test, with Build Images, Deploy and Smoke Test not run, next to the app still showing the previous build label.", "Figure 4. A failing test stops the pipeline at the Test stage."),
);

// ---- 8. Testing ----
add(
  h1("8. Testing strategy"),
  table([0.14, 0.08, 0.78], ["Suite", "Tests", "What it checks"], [
    ["api", "43", "**Unit:** rate limiter, scrypt password hashing (salted, never the plain password), session tokens (random; only a SHA-256 hash is stored), validation of what a save may contain. **Routes:** health check (503 when the database is down), session handling, input checks on sign-up and reset, bad or oversized JSON, the Tenrai routes (invalid filters refused, safe-for-work only, upstream errors mapped). **Sessions:** sign-up and sign-in, an existing email answers 409, a save runs in one transaction limited to the user's rows, a profile picture can only point at the user's own file. **Server:** JSON 404, malformed JSON, no `X-Powered-By`."],
    ["ai-service", "22", "Session check through the api (401 without a cookie), Neko request validation, Gemini behaviour (key sent in a header, 15 messages a minute per user, quota fallback to the second model, retry on 503, no retry on 400, empty answers), Nekai's Picks (watch-history validation, titles already on the list dropped, 4 refreshes a minute), health and 404."],
    ["frontend", "6", "Every script parses; every local `src`/`href`, `data-app` script, CSS `@import` and `url()` points at an existing file; `nginx.conf` serves `/health` and `/build.json`."],
  ]),
  h2("How tests are run and how failures block deployment"),
  ...bullets([
    "Tests live in each service's Dockerfile as a `test` stage. The Jenkins **Test** stage builds those stages with `--no-cache`; one failing test makes `docker build` exit non-zero, which fails the stage. Stages after Test never run, so broken code is never built for deployment or deployed.",
    "The tests need **no database and no internet**: the database layer and outgoing `fetch` calls (Tenrai, Gemini) are replaced by test doubles, so results are fast and not flaky. The suite also runs on any laptop with `npm test` in the service folder.",
    "**Smoke test versus unit tests.** Unit tests check the code before it ships. The smoke test checks the real, running system after the deploy (routing through the proxy, the live database connection, the AI route, and the correct build label).",
  ]),
  h2("Quality gate demonstration"),
  p("The api has a deliberate gate-demo test (`api/tests/server.test.js`: unknown API routes must answer a JSON 404). Changing its expected status and pushing makes the build fail at Test while the site keeps serving the previous build; reverting the change makes the next build pass. The repository history records this demonstration (\"Demonstrate failing test blocks deployment\", then \"Restore correct API test expectation\")."),
);

// ---- 9. Rollback and persistence ----
add(
  h1("9. Rollback and data persistence"),
  h2("Rollback procedure"),
  p("Every build's images stay on the host tagged with the build number (`nekai/api:14`, `nekai/db:14`, ...). A rollback therefore rebuilds nothing: it points the running stack at an earlier build's images. It is the parameterized Jenkins job `nekai-rollback` (`Jenkinsfile.rollback`), started with **Build with Parameters** and the parameter `ROLLBACK_TAG` (a build number such as `14`)."),
  ...numbered([
    "**Validate.** The tag must be digits only, and all five images (`proxy`, `frontend`, `api`, `ai-service`, `db`) must exist for that build. If not, the log lists the builds that do exist and nothing is changed.",
    "**Rollback.** `docker compose up -d --no-build --wait` with `TAG` set to the chosen build, using the same `nekai-env` credential.",
    "**Smoke Test / Verify.** The same checks as a deploy, plus the page must report the build number rolled back to.",
  ]),
  p("Without Jenkins the same result comes from one command on the host: `TAG=14 docker compose --env-file <.env> up -d --no-build`. The build label in the corner of every page shows which build is live."),
  p("**Limits.** Data is kept (volumes are not touched), so a rollback moves code, not data. The job uses the current `docker-compose.yml`. Images removed by `docker image prune` can no longer be rolled back to. The next push deploys a new build on top of the rolled-back one."),
  ...screenshot("rollback-job.png", "Jenkins → nekai-rollback → Build with Parameters (ROLLBACK_TAG filled in) and the finished build's console or Stage View.", "Figure 5. The parameterized rollback job."),
  ...screenshot("rollback-result.png", "The app in the browser after the rollback, with the build label in the corner showing the earlier build number.", "Figure 6. The earlier build is live again."),
  h2("Data persistence"),
  p("All accounts, lists, history, badges and chats are in PostgreSQL, stored in the `pg-data` named volume; profile pictures are in the `uploads` volume. Redeploying (the pipeline) and `docker compose down` followed by `up -d` both keep them, because neither removes volumes. The schema script runs only when the volume is empty, so an existing database is never modified."),
  p("**Proof procedure:** (1) sign in and add titles to the library; (2) run `docker compose down` (without `-v`) and `docker compose up -d`, or push a change and let the pipeline redeploy; (3) sign in again and show the same library. `docker volume ls` lists `nekai_pg-data` and `nekai_uploads` throughout."),
  ...screenshot("persistence-proof.png", "Two views: the library before and after a redeploy (or down/up) with the same entries, plus docker volume ls showing nekai_pg-data.", "Figure 7. Data survives a redeploy."),
);

// ---- 10. Problems ----
add(
  h1("10. Problems encountered and how we solved them"),
  table([0.36, 0.64], ["Problem", "Solution"], [
    ["The first version stored data in a hosted database (Supabase), so a container stack could not own or reproduce its data.", "Migrated to a PostgreSQL service with its own named volume. The schema moved to `db/init.sql`, which runs on an empty volume and is safe to re-run."],
    ["A single backend does not meet the three-module requirement and mixed two concerns.", "Split the backend into **api** (accounts, data, Tenrai) and **ai-service** (Gemini), next to the static **frontend**. The ai-service has no database and asks the api for the session and anime lookups, so all Tenrai calls share one queue and cache."],
    ["Nginx resolves upstream names once at startup, so a redeployed container with a new IP address would not be found.", "The proxy uses Docker's DNS resolver (`127.0.0.11`) with variables in `proxy_pass`, so names are looked up per request. The proxy also starts when a service is still coming up."],
    ["Port 8080 is already used when Jenkins is installed directly on Windows.", "The proxy's published port is configurable (`HTTP_PORT`, with `APP_URL`), and the Jenkins container is published on 8081."],
    ["jenkins.io plugin servers can be unreachable on some networks, which breaks the setup wizard.", "Plugins are installed into the image at build time from a pinned list, with build arguments to use a mirror."],
    ["Jenkins is on a laptop with no public address, so a GitHub webhook cannot reach it directly.", "ngrok exposes the Jenkins port for the webhook, and Poll SCM remains declared in the Jenkinsfile as a fallback, so the pipeline stays automatic either way."],
    ["The non-root `node` user could not write to the uploads volume.", "The Dockerfile creates `/data/uploads` owned by `node` before the volume is mounted."],
    ["Tests that call a real database or the internet would make the pipeline slow and flaky.", "Test doubles replace the database layer and `fetch`, so the Test stage runs in seconds anywhere."],
    ["It was not obvious which version a deploy had put live, and rollback was a manual command.", "Images are tagged with the build number, the page shows the build label, the smoke test checks the label, and a parameterized rollback job redeploys any earlier build."],
  ]),
  p("Compiled from the repository's history and configuration comments. {{Add any further problems the group ran into during the demo rehearsals.}}", { size: SMALL - 1, color: C.grey }),
);

// ---- 11. Contributions and references ----
add(
  h1("11. Individual contributions and references", { newPage: true }),
  p("From the Git history (119 commits between 2026-09-24 and 2026-10-20, 25 pull requests merged). Commit counts exclude merge commits."),
  table([0.24, 0.1, 0.66], ["Member", "Commits", "Main contributions"], [
    ["Pugal, Jenna Cyrille\nGitHub: jnncy-techcookie", "54", "Jenkins pipeline (`Jenkinsfile`), Jenkins compose setup and the automatic-deployment and failing-test demonstrations; first API and ai-service tests; Supabase connection, sign-in error handling and profile fixes; merged most pull requests."],
    ["Madronero, Kristine", "16", "Frontend: interface redesigns (Home, sign-in), dark mode and genre onboarding, library multi-select and phone layout, profile pictures, achievement badge artwork, Neko chat styling."],
    ["Gloria, Raiza Lhyn A.", "9", "Recommendation (AI) integration, XP, levels, streak and achievement logic, Neko backend, settings and the environment example; reviewed and merged pull requests."],
    ["{{Surname}}, Cheska Joyce", "6", "Migration to PostgreSQL; the api and ai-service test suites; Jenkins configuration changes."],
    ["David, Heidee", "3", "Splitting the application into modules; Dockerfiles and `docker-compose.yml`."],
  ]),
  p("{{Confirm each member's role and contributions with the group before submitting.}}", { size: SMALL - 1 }),
  h2("References"),
  ...numbered([
    "Docker documentation, Dockerfile best practices and multi-stage builds. https://docs.docker.com/",
    "Docker Compose specification and `depends_on` health conditions. https://docs.docker.com/compose/",
    "Jenkins, Pipeline syntax and the Jenkinsfile. https://www.jenkins.io/doc/book/pipeline/",
    "Jenkins Docker installation guide. https://www.jenkins.io/doc/book/installing/docker/",
    "Nginx documentation, `ngx_http_proxy_module`. https://nginx.org/en/docs/",
    "PostgreSQL 16 documentation. https://www.postgresql.org/docs/16/",
    "Node.js test runner. https://nodejs.org/api/test.html",
    "Express 5. https://expressjs.com/",
    "Tenrai API documentation. https://api.tenrai.org/documentation",
    "Google Gemini API documentation. https://ai.google.dev/gemini-api/docs",
    "ngrok documentation. https://ngrok.com/docs",
    "System Architecture and Integration, Final Project Guidelines (course handout).",
  ], SMALL),
);

// ============================== DOCUMENT ==============================
const footerText = { size: 17, color: "6B7280", font: FONT };
const doc = new Document({
  creator: "NEKAI project group",
  title: "NEKAI: Technical Documentation",
  description: "Technical documentation for the NEKAI containerized infrastructure and CI/CD pipeline",
  styles: {
    default: { document: { run: { font: FONT, size: BODY } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 34, bold: true, color: C.navy, font: FONT },
        paragraph: { spacing: { before: 280, after: 140 }, keepNext: true, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 14, color: C.orange, space: 3 } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 25, bold: true, color: C.blue, font: FONT },
        paragraph: { spacing: { before: 200, after: 80 }, keepNext: true, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 260 } } } }] },
      ...numberedRefs.map((reference) => ({
        reference,
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 300 } } } }],
      })),
    ],
  },
  sections: [{
    properties: { titlePage: true, page: { size: PAGE, margin: MARGIN } },
    footers: {
      first: new Footer({ children: [new Paragraph({ children: [] })] }),
      default: new Footer({
        children: [new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: W }],
          children: [
            new TextRun({ ...footerText, text: "NEKAI · Technical Documentation" }),
            new TextRun({ ...footerText, text: "\tPage " }),
            new TextRun({ ...footerText, children: [PageNumber.CURRENT] }),
            new TextRun({ ...footerText, text: " of " }),
            new TextRun({ ...footerText, children: [PageNumber.TOTAL_PAGES] }),
          ],
        })],
      }),
    },
    children: [...cover(), ...body],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(__dirname, "technical-documentation.docx");
  fs.writeFileSync(out, buf);
  console.log(`word document: ${path.relative(process.cwd(), out) || out} (${Math.round(buf.length / 1024)} KB)`);
});
