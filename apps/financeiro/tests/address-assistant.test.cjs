const test = require("node:test");
const assert = require("node:assert/strict");

const address = require("../assets/address-assistant.js");

test("formatar CEP e construir somente URLs oficiais", () => {
  assert.equal(address.maskZip("74000123"), "74000-123");
  assert.equal(
    address.zipUrl("74000-123"),
    "https://viacep.com.br/ws/74000123/json/",
  );
  assert.equal(
    address.municipalitiesUrl("go"),
    "https://servicodados.ibge.gov.br/api/v1/localidades/estados/GO/municipios?orderBy=nome",
  );
  assert.equal(
    address.municipalityUrl("5208707"),
    "https://servicodados.ibge.gov.br/api/v1/localidades/municipios/5208707",
  );
});

test("resolver município pelo código IBGE", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ id: 5208707, nome: "Goiânia" }),
  });
  assert.deepEqual(await address.lookupMunicipality("5208707"), {
    code: "5208707",
    name: "Goiânia",
  });
  assert.equal(await address.lookupMunicipality(""), null);
});

test("normalizar a resposta do ViaCEP", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      cep: "74000-123",
      logradouro: "Rua Exemplo",
      complemento: "lado par",
      bairro: "Centro",
      localidade: "Goiânia",
      uf: "GO",
    }),
  });
  assert.deepEqual(await address.lookupZip("74000123"), {
    zip: "74000-123",
    street: "Rua Exemplo",
    complement: "lado par",
    neighborhood: "Centro",
    city: "Goiânia",
    state: "GO",
  });
});

test("rejeitar CEP inválido ou não encontrado", async (t) => {
  await assert.rejects(() => address.lookupZip("123"), /8 dígitos/);
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => ({ ok: true, json: async () => ({ erro: true }) });
  await assert.rejects(() => address.lookupZip("99999999"), /não encontrado/);
});
