const test = require("node:test");
const assert = require("node:assert/strict");

const cnpj = require("../assets/cnpj-assistant.js");

test("mascarar CNPJ numérico e alfanumérico no formato vigente", () => {
  assert.equal(cnpj.maskCnpj("04252011000110"), "04.252.011/0001-10");
  assert.equal(cnpj.maskCnpj("12.abc.345/01de-35"), "12.ABC.345/01DE-35");
  assert.equal(cnpj.maskCnpj("12ABC"), "12.ABC");
});

test("validar CNPJ numérico e exemplo oficial alfanumérico", () => {
  assert.equal(cnpj.validCnpj("04.252.011/0001-10"), true);
  assert.equal(cnpj.validCnpj("12.ABC.345/01DE-35"), true);
  assert.equal(cnpj.validCnpj("12.ABC.345/01DE-36"), false);
  assert.equal(cnpj.validCnpj("12.ABC.345/01DE-3A"), false);
});

test("normalizar identificador e construir consulta sem máscara", () => {
  assert.equal(cnpj.normalizeCnpj("12.abc.345/01de-35"), "12ABC34501DE35");
  assert.equal(
    cnpj.cnpjUrl("12.ABC.345/01DE-35"),
    "https://api.opencnpj.org/12ABC34501DE35",
  );
});

test("mapear resposta pública do OpenCNPJ para o cadastro", () => {
  assert.deepEqual(
    cnpj.normalizeCompany({
      cnpj: "12ABC34501DE35",
      razao_social: "EMPRESA EXEMPLO LTDA",
      nome_fantasia: "EXEMPLO",
      natureza_juridica: "Sociedade Empresária Limitada",
      telefones: [{ ddd: "62", numero: "999999999", is_fax: false }],
      email: "contato@exemplo.com",
      logradouro: "RUA EXEMPLO",
      numero: "123",
      complemento: "SALA 1",
      bairro: "CENTRO",
      cep: "74000123",
      uf: "GO",
      municipio: "GOIANIA",
      situacao_cadastral: "Ativa",
    }),
    {
      cnpj: "12ABC34501DE35",
      legalName: "EMPRESA EXEMPLO LTDA",
      tradeName: "EXEMPLO",
      legalNature: "Sociedade Empresária Limitada",
      phone: "62999999999",
      email: "contato@exemplo.com",
      street: "RUA EXEMPLO",
      addressNumber: "123",
      complement: "SALA 1",
      neighborhood: "CENTRO",
      zip: "74000123",
      state: "GO",
      city: "GOIANIA",
      status: "Ativa",
    },
  );
});

test("consultar CNPJ com timeout e erros HTTP tratáveis", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async (url) => {
    assert.equal(url, "https://api.opencnpj.org/04252011000110");
    return {
      ok: true,
      status: 200,
      json: async () => ({ razao_social: "EMPRESA TESTE" }),
    };
  };
  assert.equal((await cnpj.lookupCnpj("04.252.011/0001-10")).legalName, "EMPRESA TESTE");

  global.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  await assert.rejects(() => cnpj.lookupCnpj("04.252.011/0001-10"), /não encontrado/);
});
