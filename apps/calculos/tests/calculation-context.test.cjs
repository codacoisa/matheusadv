const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const routes = fs.readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, "index.html")))
  .map((entry) => entry.name)
  .sort();

test("toda calculadora publicada carrega o contrato de contexto processual", () => {
  assert.deepEqual(routes, ["completo", "facil", "pensao", "trabalhista"]);
  routes.forEach((route) => {
    const html = fs.readFileSync(path.join(root, route, "index.html"), "utf8");
    assert.match(html, /assets\/finance-link\.js/);
    assert.match(html, /assets\/case-context\.js/);
  });
});
