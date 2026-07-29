const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const gistClient = require(path.resolve(
  __dirname,
  "../../../packages/ui/gist-client.js",
));

test("normaliza ID informado isoladamente ou como URL do Gist", () => {
  assert.equal(gistClient.normalizeId(" abc123 "), "abc123");
  assert.equal(
    gistClient.normalizeId("https://gist.github.com/usuario/ABCDEF123456"),
    "ABCDEF123456",
  );
});

test("não envia autorização vazia ao consultar um Gist público", async (context) => {
  const originalFetch = global.fetch;
  context.after(() => {
    global.fetch = originalFetch;
  });
  let headers;
  global.fetch = async (_url, options) => {
    headers = new Headers(options.headers);
    return Response.json({ files: {} });
  };

  await gistClient.gist("abc123", "");
  assert.equal(headers.has("Authorization"), false);
  assert.equal(headers.get("X-GitHub-Api-Version"), "2022-11-28");
});

test("baixa arquivo truncado sem expor token e aplica limite real", async (context) => {
  const originalFetch = global.fetch;
  context.after(() => {
    global.fetch = originalFetch;
  });
  let headers;
  global.fetch = async (_url, options) => {
    headers = new Headers(options.headers);
    return new Response("conteúdo");
  };

  assert.equal(
    await gistClient.text(
      {
        truncated: true,
        size: 8,
        raw_url: "https://gist.githubusercontent.com/raw",
      },
      { maxBytes: 32 },
    ),
    "conteúdo",
  );
  assert.equal(headers.has("Authorization"), false);

  await assert.rejects(
    gistClient.text(
      {
        truncated: true,
        size: 64,
        raw_url: "https://gist.githubusercontent.com/raw",
      },
      { maxBytes: 32 },
    ),
    /excede o limite/,
  );
});

test("protege atualizações com a revisão recebida do Gist", async (context) => {
  const originalFetch = global.fetch;
  context.after(() => {
    global.fetch = originalFetch;
  });
  const calls = [];
  global.fetch = async (_url, options) => {
    calls.push(options);
    return new Response(JSON.stringify({ files: {} }), {
      headers: { "Content-Type": "application/json", ETag: '"revisao-1"' },
    });
  };

  const snapshot = await gistClient.gistSnapshot("abc123", "token");
  assert.equal(snapshot.etag, '"revisao-1"');
  await gistClient.patch(
    "abc123",
    "token",
    { "dados.json": { content: "{}" } },
    { etag: snapshot.etag },
  );

  assert.equal(
    new Headers(calls[1].headers).get("If-Match"),
    '"revisao-1"',
  );
});
