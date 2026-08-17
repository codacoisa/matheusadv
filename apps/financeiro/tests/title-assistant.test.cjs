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
  assert.equal(JSON.parse(request.options.body).model, "default");
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
