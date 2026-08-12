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
  assert.match(app, /Informe o estado civil do cliente/);
  assert.match(app, /Informe a profissão do cliente/);
  assert.match(app, /street:\s*"endereço"/);
  assert.match(app, /neighborhood:\s*"bairro"/);
  assert.match(app, /city:\s*"cidade"/);
});

test("separar número, quadra e lote do logradouro do cliente", () => {
  assert.match(html, /name="addressNumber"/);
  assert.match(html, /name="addressBlock"/);
  assert.match(html, /name="addressLot"/);
  assert.match(html, /id="street-warning"[^>]*role="alert"/);
  assert.match(app, /FORBIDDEN_STREET_PART/);
  assert.match(app, /n\[uú\]mero\|nº\|n\\\.º\|quadra\|qd\\\.\?\|lote\|lt\\\.\?/);
  assert.match(app, /Preencha no campo \$\{restriction\.field\}/);
  assert.match(app, /profile\.addressBlock \? `Quadra/);
  assert.match(app, /profile\.addressLot \? `Lote/);
});

test("cadastrar pessoa jurídica com representantes reutilizáveis", () => {
  assert.match(html, /value="pj">Pessoa jurídica/);
  assert.match(html, /name="legalName"/);
  assert.match(html, /name="cnpj"/);
  assert.match(html, /id="representatives-editor"/);
  assert.match(html, /id="person-dialog"/);
  assert.match(app, /function validCnpj/);
  assert.match(app, /signatureRule/);
  assert.match(app, /isPrimary/);
  assert.match(app, /isSigner/);
  assert.match(app, /activeClientRepresentatives/);
});

test("listar pessoas como subpágina de clientes e permitir promoção", () => {
  assert.doesNotMatch(html, /<button data-view="people"/);
  assert.match(html, /id="open-people"/);
  assert.match(html, /id="back-to-clients"/);
  assert.match(html, /id="people-view"/);
  assert.match(html, /id="person-search"/);
  assert.match(html, /id="people-grid"/);
  assert.match(html, /id="new-person"/);
  assert.match(app, /function renderPeople/);
  assert.match(app, /function personRelations/);
  assert.match(app, /function clientForPerson/);
  assert.match(app, /function viewPerson/);
  assert.match(app, /data-view-person/);
  assert.match(app, /data-edit-person/);
  assert.match(app, /data-promote-person/);
  assert.match(app, /Tornar pessoa cliente/);
  assert.match(app, /personDialogContext/);
  assert.match(styles, /\.person-row\s*\{/);
});

test("avisar imediatamente quando CPF ou CNPJ já estiver cadastrado", () => {
  assert.match(html, /id="client-cpf-warning"[^>]*role="alert"/);
  assert.match(html, /id="client-cnpj-warning"[^>]*role="alert"/);
  assert.match(html, /id="person-cpf-warning"[^>]*role="alert"/);
  assert.match(app, /function personCpfAvailability/);
  assert.match(app, /function clientDocumentAvailability/);
  assert.match(app, /Já existe uma pessoa cadastrada com este CPF/);
  assert.match(app, /Já existe um cliente cadastrado com este CPF/);
  assert.match(app, /Já existe um cliente cadastrado com este CNPJ/);
  assert.match(app, /use Tornar cliente/);
  assert.match(app, /setCustomValidity\(message\)/);
});

test("filtrar e ordenar clientes por critérios operacionais", () => {
  [
    "client-type-filter",
    "client-financial-filter",
    "client-city-filter",
    "client-order",
    "client-filter-summary",
    "clear-client-filters",
  ].forEach((id) => assert.match(html, new RegExp(`id="${id}"`)));
  assert.match(app, /function clientFinancialSummary/);
  assert.match(app, /function refreshClientCityOptions/);
  assert.match(app, /function clientSort/);
  assert.match(app, /finance\.overdue > 0/);
  assert.match(app, /finance\.balance > 0/);
  assert.match(app, /finance\.entries\.length > 0/);
  assert.match(styles, /\.client-filter-grid\s*\{/);
});

test("oferecer recibo em PDF ao registrar pagamento", () => {
  assert.match(html, /jspdf\.umd\.min\.js/);
  assert.match(html, /receipt\.js/);
  assert.match(html, /id="receipt-option"[^>]*hidden/);
  assert.match(html, /id="generate-receipt"/);
  assert.match(app, /financeReceipt\.download/);
  assert.match(app, /Recibo gerado em PDF/);
});

test("integrar pacotes à área de contratações dos casos", () => {
  assert.match(html, /id="contracts-hub-title">Honorários dos casos/);
  assert.match(html, /id="toggle-packages"/);
  assert.match(html, /id="packages-content"[^>]*hidden/);
  assert.match(html, /id="package-overview"/);
  assert.doesNotMatch(html, /id="packages-dialog"|Pacotes cadastrados/);
  assert.match(app, /function setPackagesExpanded/);
  assert.match(app, /client \? clientDisplayName\(client\) : "Cliente não encontrado"/);
});

test("remover do Gist o payload de PDFs excluídos", () => {
  assert.match(
    app,
    /\.deletedPayloadFiles\(filesData,\s*gist\.files\)[\s\S]*changedFiles\[fileName\]\s*=\s*null/,
  );
});

test("informar de forma objetiva os limites do Base64", () => {
  const text = html.replace(/\s+/g, " ");

  assert.match(
    text,
    /O índice é sincronizado separadamente dos PDFs\. Base64 transforma o PDF em texto, mas não o criptografa\./,
  );
  assert.doesNotMatch(text, /quem acessar o Gist secreto/);
});
