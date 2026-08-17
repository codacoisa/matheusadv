const test = require("node:test");
const assert = require("node:assert/strict");

const assistant = require("../assets/title-assistant.js");

test("montar prompt somente com metadados processuais", () => {
  const prompt = assistant.buildPrompt({
    area: "Criminal",
    className: "Ação Penal - Procedimento Ordinário",
    subjects: [{ name: "Crimes de Trânsito" }, { name: "Crimes de Trânsito" }],
  });

  assert.match(prompt, /Ação Penal - Procedimento Ordinário/);
  assert.match(prompt, /Crimes de Trânsito/);
  assert.doesNotMatch(prompt, /0000832|Cliente|CPF|CNPJ|número CNJ/i);
});

test("gerar título sem credencial e normalizar resposta do modelo", async () => {
  let request;
  const result = await assistant.generateTitle(
    {
      area: "Criminal",
      className: "Ação Penal - Procedimento Ordinário",
      subjects: [{ name: "Crimes de Trânsito" }],
    },
    {
      fetchImpl: async (url, options) => {
        request = { url, options };
        return new Response(JSON.stringify({
          choices: [{ message: { content: 'Título: "Ação Penal por crime de trânsito."' } }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    },
  );

  assert.equal(result.title, "Ação Penal por crime de trânsito");
  assert.equal(request.url, "https://api.llm7.io/v1/chat/completions");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.Authorization, undefined);
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, "default");
  assert.equal(body.max_tokens, 512);
  assert.match(body.messages[0].content, /Não revele o raciocínio/);
});

test("refazer consulta quando o modelo esgota o raciocínio sem texto final", async () => {
  const requests = [];
  const result = await assistant.generateTitle(
    {
      className: "Divórcio Litigioso",
      subjects: [{ name: "Partilha de Bens" }, { name: "Dissolução" }],
    },
    {
      fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body);
        requests.push(body);
        return requests.length === 1
          ? new Response(JSON.stringify({ choices: [{ message: { content: "" }, finish_reason: "length" }] }), { status: 200 })
          : new Response(JSON.stringify({ choices: [{ message: { content: "Divórcio Litigioso por Partilha de Bens e Dissolução" }, finish_reason: "stop" }] }), { status: 200 });
      },
    },
  );

  assert.equal(result.title, "Divórcio Litigioso por Partilha de Bens e Dissolução");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].max_tokens, 512);
  assert.equal(requests[1].max_tokens, 2048);
});

test("rejeitar título que omite parte dos metadados processuais", async () => {
  await assert.rejects(
    assistant.generateTitle(
      {
        className: "Ação Penal - Procedimento Ordinário",
        subjects: [{ name: "Crimes de Trânsito" }],
      },
      {
        fetchImpl: async () => new Response(JSON.stringify({
          choices: [{ message: { content: "Ação Penal - Trânsito" } }],
        }), { status: 200 }),
      },
    ),
    /título incompleto.*omitiu a classe principal ou parte/i,
  );
});

test("rejeitar sugestão que só troca o separador", async () => {
  await assert.rejects(
    assistant.generateTitle(
      {
        className: "Execução de Título Extrajudicial",
        subjects: [{ name: "Direitos e Títulos de Crédito" }],
      },
      {
        fetchImpl: async () => new Response(JSON.stringify({
          choices: [{ message: { content: "Execução de Título Extrajudicial - Direitos e Títulos de Crédito" } }],
        }), { status: 200 }),
      },
    ),
    (error) => error.code === "UNCHANGED_TITLE" && /melhoria real/i.test(error.message),
  );
});

test("tratar erro de cota pública", async () => {
  await assert.rejects(
    assistant.generateTitle(
      { className: "Ação de cobrança", subjects: [] },
      { fetchImpl: async () => new Response("", { status: 429 }) },
    ),
    /cota pública/,
  );
});
