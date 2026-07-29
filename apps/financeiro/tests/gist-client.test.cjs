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

test("recusa origem externa no endereço bruto retornado pelo Gist", async () => {
  await assert.rejects(
    gistClient.text({
      truncated: true,
      size: 8,
      raw_url: "https://example.com/arquivo.json",
    }),
    /origem não autorizada/,
  );
});

test("protege atualizações sem enviar If-Match em PATCH", async (context) => {
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

  assert.equal(calls.length, 3);
  assert.equal(calls[2].method, "PATCH");
  assert.equal(new Headers(calls[2].headers).has("If-Match"), false);
});

test("recusa atualização quando a revisão remota mudou", async (context) => {
  const originalFetch = global.fetch;
  context.after(() => {
    global.fetch = originalFetch;
  });
  let call = 0;
  global.fetch = async () => {
    call += 1;
    return new Response(JSON.stringify({ files: {} }), {
      headers: {
        "Content-Type": "application/json",
        ETag: call === 1 ? '"revisao-1"' : '"revisao-2"',
      },
    });
  };

  const snapshot = await gistClient.gistSnapshot("abc123", "token");
  await assert.rejects(
    gistClient.patch(
      "abc123",
      "token",
      { "dados.json": { content: "{}" } },
      { etag: snapshot.etag },
    ),
    /alterado em outro navegador/,
  );
  assert.equal(call, 2);
});
