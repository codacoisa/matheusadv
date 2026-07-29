const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const styles = fs.readFileSync(
  path.join(root, "assets", "styles.css"),
  "utf8",
);
const app = fs.readFileSync(path.join(root, "assets", "app.js"), "utf8");

test("manter a visualização do PDF em diálogo próprio", () => {
  const filesDialogStart = html.indexOf('id="client-files-dialog"');
  const filesDialogEnd = html.indexOf("</dialog>", filesDialogStart);
  const previewDialogStart = html.indexOf('id="file-preview-dialog"');

  assert.ok(filesDialogStart >= 0);
  assert.ok(filesDialogEnd > filesDialogStart);
  assert.ok(previewDialogStart > filesDialogEnd);
  assert.match(app, /file-preview-dialog"\);\s+if \(!dialog\.open\) dialog\.showModal/);
  assert.match(app, /file-preview-dialog"\)\.addEventListener\("close"/);
});

test("dar contraste ao botão de fechar a visualização", () => {
  assert.match(
    styles,
    /\.file-preview-close\s*\{[^}]*color:\s*#fff;[^}]*background:/s,
  );
});

test("alinhar a faixa de casos nos cartões de clientes", () => {
  assert.match(
    styles,
    /\.contact-card\s*>\s*\.case-line\s*\{[^}]*margin-top:\s*auto;/s,
  );
});

test("exigir os campos complementares do cliente", () => {
  ["maritalStatus", "profession", "street", "neighborhood", "city"].forEach(
    (name) =>
      assert.match(
        html,
        new RegExp(`<input[^>]*name="${name}"[^>]*required`, "s"),
      ),
  );
  assert.match(app, /maritalStatus:\s*"estado civil"/);
  assert.match(app, /profession:\s*"profissão"/);
  assert.match(app, /street:\s*"endereço"/);
  assert.match(app, /neighborhood:\s*"bairro"/);
  assert.match(app, /city:\s*"cidade"/);
});
