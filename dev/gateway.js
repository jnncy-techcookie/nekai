/* Local development gateway: the stand-in for the Nginx reverse proxy (proxy/) when you run the
 * services on a laptop without Docker. Zero dependencies. One entry point, the same routing:
 *   /api/neko, /api/recommend  →  ai-service  (AI_URL,  default http://localhost:3001)
 *   /api/*, /avatars/*         →  api         (API_URL, default http://localhost:3000)
 *   everything else            →  files from frontend/
 * Run:  node dev/gateway.js   then open http://localhost:8080
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 8080;
const API = new URL(process.env.API_URL || "http://localhost:3000");
const AI = new URL(process.env.AI_URL || "http://localhost:3001");
const ROOT = path.join(__dirname, "../frontend");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".webp": "image/webp", ".ttf": "font/ttf", ".woff2": "font/woff2",
};

function proxy(req, res, target) {
  const upstream = http.request(
    { host: target.hostname, port: target.port, method: req.method, path: req.url,
      headers: { ...req.headers, host: target.host, "x-forwarded-for": req.socket.remoteAddress } },
    (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); },
  );
  upstream.on("error", () => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "That service isn't running." }));
  });
  req.pipe(upstream);
}

http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (/^\/api\/(neko|recommend)(\/|$)/.test(pathname)) return proxy(req, res, AI);
  if (pathname.startsWith("/api/") || pathname.startsWith("/avatars/")) return proxy(req, res, API);

  const file = path.join(ROOT, pathname === "/" ? "index.html" : pathname);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, () => console.log(`NEKAI dev gateway at http://localhost:${PORT}`));
