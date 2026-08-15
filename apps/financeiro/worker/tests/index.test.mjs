import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const env = {
  ALLOWED_ORIGINS: "https://officejur.example",
  OFFICEJUR_API_KEY: "chave-de-teste",
  DATAJUD_API_KEY: "chave-datajud",
  MP_ACCESS_TOKEN: "token-mercado-pago",
};

function request(path, options = {}) {
  return new Request(`https://worker.example${path}`, {
    ...options,
    headers: {
      Origin: "https://officejur.example",
      Authorization: "Bearer chave-de-teste",
      ...options.headers,
    },
  });
}

test("rejeita origem e credencial não autorizadas", async () => {
  const invalidOrigin = await worker.fetch(
    new Request("https://worker.example/health", {
      headers: { Origin: "https://outra.example" },
    }),
    env,
  );
  assert.equal(invalidOrigin.status, 403);

  const invalidKey = await worker.fetch(
    request("/health", { headers: { Authorization: "Bearer incorreta" } }),
    env,
  );
  assert.equal(invalidKey.status, 401);
});

test("responde à verificação de saúde sem consultar o Mercado Pago", async () => {
  const response = await worker.fetch(request("/health"), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(
    response.headers.get("Access-Control-Allow-Origin"),
    "https://officejur.example",
  );
});

test("limita excesso de solicitações antes de consultar o provedor", async () => {
  const limitedEnv = {
    ...env,
    RATE_LIMITER: { limit: async () => ({ success: false }) },
  };
  const response = await worker.fetch(request("/health"), limitedEnv);
  assert.equal(response.status, 429);
});

test("consulta o DataJud pelo proxy sem exigir o token do Mercado Pago", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  let received;
  globalThis.fetch = async (url, options) => {
    received = { url, options };
    return Response.json({ hits: { hits: [{ _source: { numeroProcesso: "00008323520184013202" } }] } });
  };

  const response = await worker.fetch(
    request("/datajud/search", {
      method: "POST",
      body: JSON.stringify({
        path: "/api_publica_trf1/_search",
        number: "00008323520184013202",
      }),
    }),
    { ...env, MP_ACCESS_TOKEN: "" },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { hits: { hits: [{ _source: { numeroProcesso: "00008323520184013202" } }] } });
  assert.equal(received.url, "https://api-publica.datajud.cnj.jus.br/api_publica_trf1/_search");
  assert.equal(received.options.headers.Authorization, "APIKey chave-datajud");
  assert.deepEqual(JSON.parse(received.options.body), {
    size: 1,
    query: { match: { numeroProcesso: "00008323520184013202" } },
  });
});

test("recusa rota ou número inválidos no proxy DataJud", async () => {
  const response = await worker.fetch(
    request("/datajud/search", {
      method: "POST",
      body: JSON.stringify({ path: "/api_publica_tjgo/_search", number: "123" }),
    }),
    env,
  );
  assert.equal(response.status, 400);
});

test("valida idempotência e URL de retorno antes de criar cobrança", async () => {
  const withoutKey = await worker.fetch(
    request("/preferences", {
      method: "POST",
      body: JSON.stringify({
        amount: 100,
        externalReference: "ref-1",
        returnUrl: "https://officejur.example/financeiro/",
      }),
    }),
    env,
  );
  assert.equal(withoutKey.status, 400);

  const invalidReturn = await worker.fetch(
    request("/preferences", {
      method: "POST",
      headers: { "X-Idempotency-Key": "idempotencia-1" },
      body: JSON.stringify({
        amount: 100,
        externalReference: "ref-1",
        returnUrl: "https://outra.example/",
      }),
    }),
    env,
  );
  assert.equal(invalidReturn.status, 400);
});

test("cria preferência com retorno normalizado e chave idempotente", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  let received;
  globalThis.fetch = async (url, options) => {
    received = { url, options };
    return Response.json({
      id: "pref-1",
      init_point: "https://mercadopago.example/checkout",
      sandbox_init_point: "https://sandbox.example/checkout",
    });
  };

  const response = await worker.fetch(
    request("/preferences", {
      method: "POST",
      headers: { "X-Idempotency-Key": "idempotencia-1" },
      body: JSON.stringify({
        amount: 100.5,
        description: "Honorários",
        externalReference: "ref-1",
        returnUrl: "https://officejur.example/financeiro/#anterior",
      }),
    }),
    env,
  );

  assert.equal(response.status, 201);
  assert.equal(
    received.options.headers["X-Idempotency-Key"],
    "idempotencia-1",
  );
  const body = JSON.parse(received.options.body);
  assert.equal(
    body.back_urls.success,
    "https://officejur.example/financeiro/#charges",
  );
  assert.equal(body.external_reference, "ref-1");
});
