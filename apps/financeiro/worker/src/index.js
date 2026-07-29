const MP_API = "https://api.mercadopago.com";
const MAX_BODY_BYTES = 24 * 1024;

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function isAllowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  return Boolean(origin && allowedOrigins(env).includes(origin));
}

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Idempotency-Key",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

function cleanText(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

function fixedTimeEqual(left, right) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a[index] ^ b[index];
  return result === 0;
}

function hasServiceKey(request, env) {
  const expected = cleanText(env.OFFICEJUR_API_KEY, 200);
  const received = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  return Boolean(expected && fixedTimeEqual(received, expected));
}

function validReturnUrl(value, env) {
  try {
    const url = new URL(value);
    return allowedOrigins(env).includes(url.origin) ? url : null;
  } catch {
    return null;
  }
}

async function input(request) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > MAX_BODY_BYTES) throw new Error("REQUEST_TOO_LARGE");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES)
    throw new Error("REQUEST_TOO_LARGE");
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new Error("INVALID_JSON");
  }
}

async function mercadoPago(path, env, options = {}) {
  const response = await fetch(`${MP_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": options.idempotencyKey,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("MERCADO_PAGO_ERROR");
    error.status = response.status;
    error.detail = cleanText(body.message || body.error, 160);
    throw error;
  }
  return body;
}

function errorResponse(error, headers) {
  if (error?.message === "REQUEST_TOO_LARGE")
    return json({ message: "A solicitação excede o tamanho permitido." }, 413, headers);
  if (error?.message === "INVALID_JSON")
    return json({ message: "A solicitação é inválida." }, 400, headers);
  if (error?.message === "MERCADO_PAGO_ERROR")
    return json({ message: "O Mercado Pago recusou a solicitação. Revise os dados e tente novamente." }, 502, headers);
  return json({ message: "Não foi possível concluir a solicitação." }, 500, headers);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    if (!isAllowedOrigin(request, env))
      return json({ message: "Origem não autorizada." }, 403);
    const headers = cors(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (!hasServiceKey(request, env))
      return json({ message: "Serviço não autorizado." }, 401, headers);
    if (!env.MP_ACCESS_TOKEN)
      return json({ message: "Serviço de cobrança indisponível." }, 503, headers);

    const url = new URL(request.url);
    if (env.RATE_LIMITER) {
      const { success } = await env.RATE_LIMITER.limit({
        key: `${origin}:${url.pathname}`,
      });
      if (!success)
        return json(
          { message: "Muitas solicitações. Aguarde e tente novamente." },
          429,
          headers,
        );
    }
    try {
      if (request.method === "GET" && url.pathname === "/health")
        return json({ ok: true }, 200, headers);

      if (request.method === "POST" && url.pathname === "/preferences") {
        const body = await input(request);
        const amount = Number(body.amount);
        const externalReference = cleanText(body.externalReference, 100);
        const returnUrl = validReturnUrl(body.returnUrl, env);
        const idempotencyKey = cleanText(request.headers.get("X-Idempotency-Key"), 64);
        if (!Number.isFinite(amount) || amount <= 0)
          return json({ message: "Valor inválido." }, 400, headers);
        if (!externalReference)
          return json({ message: "Referência externa obrigatória." }, 400, headers);
        if (!returnUrl)
          return json({ message: "URL de retorno não autorizada." }, 400, headers);
        if (!idempotencyKey || idempotencyKey.length > 64)
          return json({ message: "Chave de idempotência inválida." }, 400, headers);

        const expires = /^\d{4}-\d{2}-\d{2}$/.test(body.expiresAt || "")
          ? `${body.expiresAt}T23:59:59.000-03:00`
          : null;
        returnUrl.hash = "";
        const backUrl = `${returnUrl.href}#charges`;
        const preference = {
          items: [{
            id: cleanText(body.entryId, 100),
            title: cleanText(body.description, 120) || "Cobrança OfficeJur",
            quantity: 1,
            currency_id: "BRL",
            unit_price: amount,
          }],
          external_reference: externalReference,
          payer: {
            name: cleanText(body.payer?.name, 100) || undefined,
            email: cleanText(body.payer?.email, 150) || undefined,
          },
          back_urls: {
            success: backUrl,
            pending: backUrl,
            failure: backUrl,
          },
          auto_return: body.autoReturn ? "approved" : undefined,
          statement_descriptor: cleanText(body.statementDescriptor, 22) || undefined,
          expires: Boolean(expires),
          date_of_expiration: expires || undefined,
          metadata: {
            finance_entry_id: cleanText(body.entryId, 100),
            client_id: cleanText(body.clientId, 100),
          },
        };
        const result = await mercadoPago("/checkout/preferences", env, {
          method: "POST",
          body: JSON.stringify(preference),
          idempotencyKey,
        });
        return json({ preferenceId: result.id, checkoutUrl: result.init_point, sandboxUrl: result.sandbox_init_point }, 201, headers);
      }

      const match = url.pathname.match(/^\/preferences\/([^/]+)$/);
      if (request.method === "GET" && match) {
        const preferenceId = decodeURIComponent(match[1]);
        const reference = cleanText(url.searchParams.get("external_reference"), 100);
        if (!reference) return json({ message: "Referência externa obrigatória." }, 400, headers);
        const search = await mercadoPago(
          `/v1/payments/search?external_reference=${encodeURIComponent(reference)}&sort=date_created&criteria=desc`,
          env,
          { method: "GET", idempotencyKey: crypto.randomUUID() },
        );
        const payment = search.results?.find((item) => String(item.external_reference) === reference);
        return json({ preferenceId, status: payment?.status || "pending", paymentId: payment?.id || "", paidDate: payment?.date_approved || "" }, 200, headers);
      }
      return json({ message: "Rota não encontrada." }, 404, headers);
    } catch (error) {
      return errorResponse(error, headers);
    }
  },
};
