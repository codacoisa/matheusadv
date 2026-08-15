const test = require("node:test");
const assert = require("node:assert/strict");

const dataJud = require("../assets/datajud-assistant.js");

const sampleNumber = "00008323520184013202";

test("normalizar, mascarar e validar número CNJ", () => {
  assert.equal(dataJud.normalizeCnj("0000832-35.2018.4.01.3202"), sampleNumber);
  assert.equal(dataJud.maskCnj(sampleNumber), "0000832-35.2018.4.01.3202");
  assert.equal(dataJud.validCnj(sampleNumber), true);
  assert.equal(dataJud.validCnj("0000832-36.2018.4.01.3202"), false);
  assert.equal(dataJud.normalizeDateTime("20181029000000"), "2018-10-29T00:00:00Z");
});

test("identificar o tribunal e montar a rota DataJud", () => {
  const tjgoNumber = "00000002220268090144";
  assert.equal(dataJud.validCnj(tjgoNumber), true);
  assert.equal(dataJud.tribunalFromCnj(tjgoNumber).alias, "tjgo");
  assert.deepEqual(dataJud.tribunalFromCnj(sampleNumber), {
    alias: "trf1",
    code: "TRF1",
    label: "Tribunal Regional Federal da 1ª Região",
    uf: "",
    justiceType: "Justiça Federal",
    segment: "4",
    tribunalCode: "01",
  });
  assert.equal(
    dataJud.endpointFor(sampleNumber),
    "https://api-publica.datajud.cnj.jus.br/api_publica_trf1/_search",
  );
  assert.deepEqual(dataJud.queryFor(sampleNumber), {
    size: 1,
    query: { match: { numeroProcesso: sampleNumber } },
  });
});

test("consultar e normalizar capa, assuntos e movimentações", async () => {
  let called;
  const result = await dataJud.lookupProcess(sampleNumber, {
    apiKey: "chave-de-teste",
    fetchImpl: async (url, options) => {
      called = { url, options };
      return new Response(JSON.stringify({
        hits: {
          hits: [{
            _source: {
              id: "TRF1_436_JE_16403_00008323520184013202",
              numeroProcesso: sampleNumber,
              tribunal: "TRF1",
              classe: { codigo: 436, nome: "Procedimento do Juizado Especial Cível" },
              sistema: { codigo: 1, nome: "Pje" },
              formato: { codigo: 1, nome: "Eletrônico" },
              grau: "JE",
              dataAjuizamento: "2018-10-29T00:00:00.000Z",
              orgaoJulgador: { codigo: 16403, nome: "JEF Adj - Tefé", codigoMunicipioIBGE: 5128 },
              assuntos: [{ codigo: 6177, nome: "Concessão" }],
              movimentos: [{ codigo: 26, nome: "Distribuição", dataHora: "2018-10-30T14:06:24.000Z" }],
              nivelSigilo: 0,
              dataHoraUltimaAtualizacao: "2023-07-21T19:10:08.483Z",
            },
          }],
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });

  assert.equal(called.url, dataJud.endpointFor(sampleNumber));
  assert.equal(called.options.method, "POST");
  assert.equal(called.options.headers.Authorization, "APIKey chave-de-teste");
  assert.deepEqual(JSON.parse(called.options.body), dataJud.queryFor(sampleNumber));
  assert.equal(result.number, "0000832-35.2018.4.01.3202");
  assert.equal(result.justiceType, "Justiça Federal");
  assert.equal(result.processClass.name, "Procedimento do Juizado Especial Cível");
  assert.equal(result.court.name, "JEF Adj - Tefé");
  assert.equal(result.subjects[0].name, "Concessão");
  assert.equal(result.title, "Procedimento do Juizado Especial Cível · Concessão");
  assert.equal(result.movements[0].name, "Distribuição");
});

test("complementar o título com o primeiro assunto e indicar os demais", () => {
  const result = dataJud.normalizeProcess({
    numeroProcesso: sampleNumber,
    classe: { nome: "Ação de Cobrança" },
    assuntos: [{ nome: "Contratos" }, { nome: "Obrigações" }],
  });

  assert.equal(result.title, "Ação de Cobrança · Contratos e outros assuntos");
});

test("consultar pelo proxy same-origin sem expor a chave pública do DataJud", async () => {
  let called;
  const result = await dataJud.lookupProcess(sampleNumber, {
    proxyUrl: "https://worker.example",
    proxyKey: "chave-do-servico",
    fetchImpl: async (url, options) => {
      called = { url, options };
      return new Response(JSON.stringify({
        hits: { hits: [{ _source: { numeroProcesso: sampleNumber, classe: { nome: "Classe" } } }] },
      }), { status: 200 });
    },
  });

  assert.equal(called.url, "https://worker.example/datajud/search");
  assert.equal(called.options.headers.Authorization, "Bearer chave-do-servico");
  assert.deepEqual(JSON.parse(called.options.body), {
    path: "/api_publica_trf1/_search",
    number: sampleNumber,
  });
  assert.equal(result.processClass.name, "Classe");
});

test("exigir proxy quando a aplicação está em HTTPS", async () => {
  const previousLocation = globalThis.location;
  globalThis.location = {
    protocol: "https:",
    href: "https://officejur.example/financeiro/",
    origin: "https://officejur.example",
  };
  try {
    await assert.rejects(
      dataJud.lookupProcess(sampleNumber, { fetchImpl: async () => { throw new Error("não deveria chamar"); } }),
      /Configure o proxy DataJud/,
    );
  } finally {
    if (previousLocation === undefined) delete globalThis.location;
    else globalThis.location = previousLocation;
  }
});

test("informar quando a API não encontra o processo", async () => {
  await assert.rejects(
    dataJud.lookupProcess(sampleNumber, {
      fetchImpl: async () => new Response(JSON.stringify({ hits: { hits: [] } }), { status: 200 }),
    }),
    /Processo não encontrado/,
  );
});
