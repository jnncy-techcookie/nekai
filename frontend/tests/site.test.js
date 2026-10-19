/* Static checks for the frontend. They run inside Docker (`docker build --target test ./frontend`),
 * so the Jenkins host needs no Node installed. The site has no build step, so what can break it is
 * a typo: a script with a syntax error, or a page that points at a file that doesn't exist.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");

function walk(dir, ext, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "tests" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, ext, out);
    else if (full.endsWith(ext)) out.push(full);
  }
  return out;
}

const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));
const scripts = walk(path.join(ROOT, "js"), ".js");
const styles = walk(path.join(ROOT, "css"), ".css");

// Local files only: skips https:, data:, #anchors and the /api and /avatars routes (served by the proxy)
function isLocal(ref) {
  return !/^([a-z][a-z0-9+.-]*:|\/\/|#|\/api\/|\/avatars\/)/i.test(ref);
}

// "assets/a%20b.png?v=2#x" -> the file path it names, relative to fromDir
function resolveRef(fromDir, ref) {
  const clean = decodeURIComponent(ref.split(/[?#]/)[0]);
  return clean.startsWith("/") ? path.join(ROOT, clean) : path.join(fromDir, clean);
}

const rel = (p) => path.relative(ROOT, p).replaceAll("\\", "/");

test("the site has pages, scripts and styles to check", () => {
  assert.ok(pages.length >= 6, "expected the six app pages");
  assert.ok(scripts.length > 0 && styles.length > 0);
  assert.ok(pages.includes("index.html") && pages.includes("signin.html"));
});

test("every script parses (a syntax error would break the page)", () => {
  for (const file of scripts) {
    assert.doesNotThrow(
      () => new vm.Script(fs.readFileSync(file, "utf8"), { filename: rel(file) }),
      `${rel(file)} has a syntax error`,
    );
  }
});

test("every local src/href in the pages points at a file that exists", () => {
  for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), "utf8");
    for (const [, , ref] of html.matchAll(/\b(src|href)\s*=\s*"([^"]+)"/g)) {
      if (!isLocal(ref)) continue;
      assert.ok(fs.existsSync(resolveRef(ROOT, ref)), `${page}: missing file for "${ref}"`);
    }
  }
});

test("every script listed in a page's data-app exists", () => {
  for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), "utf8");
    for (const [, list] of html.matchAll(/\bdata-app\s*=\s*"([^"]+)"/g)) {
      for (const ref of list.split(/\s+/).filter(Boolean)) {
        assert.ok(fs.existsSync(resolveRef(ROOT, ref)), `${page}: data-app lists missing "${ref}"`);
      }
    }
  }
});

test("every @import and url() in the stylesheets points at a file that exists", () => {
  for (const file of styles) {
    const css = fs.readFileSync(file, "utf8");
    for (const [, ref] of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      if (!isLocal(ref)) continue;
      assert.ok(fs.existsSync(resolveRef(path.dirname(file), ref)), `${rel(file)}: missing file for "${ref}"`);
    }
  }
});

test("nginx.conf serves /health and /build.json (the container health check and the build label)", () => {
  const conf = fs.readFileSync(path.join(ROOT, "nginx.conf"), "utf8");
  assert.match(conf, /location\s*=\s*\/health/);
  assert.match(conf, /location\s*=\s*\/build\.json/);
});
