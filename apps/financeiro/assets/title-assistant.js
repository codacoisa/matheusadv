((root, factory) => {
  const api = factory(root);
  root.OfficeJurTitleAssistant = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, (root) => {
  "use strict";

  const API_BASE = "https://api.llm7.io/v1";
  const MODEL = "default";
  const MAX_CONTEXT_LENGTH = 140;
  const MAX_SUBJECTS = 6;
  const MAX_TITLE_LENGTH = 120;

  function cleanText(value, maxLength = MAX_CONTEXT_LENGTH) {
    return String(value ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);
  }

  function normalizeSubjects(list) {
    const seen = new Set();
    return (Array.isArray(list) ? list : [])
      .map((item) => cleanText(typeof item === "string" ? item : item?.name))
      .filter((name) => {
        const key = name.toLocaleLowerCase("pt-BR");
        if (!name || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_SUBJECTS);
  }

  function normalizeInput(input = {}) {
    const normalized = {
      area: cleanText(input.area, 60),
      className: cleanText(input.className),
      subjects: normalizeSubjects(input.subjects),
    };
    if (!normalized.className && !normalized.subjects.length)
      throw new Error("Não há classe ou assunto processual para sugerir um título.");
    return normalized;
  }

  function buildPrompt(input) {
    const normalized = normalizeInput(input);
    const lines = [
      "Área: " + (normalized.area || "não informada"),
      "Classe processual: " + (normalized.className || "não informada"),
      "Assuntos processuais: " + (normalized.subjects.join("; ") || "não informados"),
    ];
    return [
      "Você é um assistente de nomenclatura de processos jurídicos no Brasil.",
      "Crie um único título curto, claro e profissional, em português brasileiro, para uso interno em um escritório.",
      "Baseie-se exclusivamente nos metadados abaixo. Preserve a classe processual quando ela for relevante e traduza o assunto técnico para uma descrição natural somente quando isso não exigir inferência.",
      "Não invente partes, fatos, pedidos, valores, tribunal, número, resultado ou fase processual.",
      "Retorne somente o título, sem aspas, sem explicação, sem prefixo e sem ponto final.",
      "O título deve ter entre 3 e 120 caracteres.",
      "",
      ...lines,
    ].join("\n");
  }

  function responseText(payload) {
    const content = payload?.choices?.[0]?.message?.content;
    if (Array.isArray(content))
      return content
        .map((part) => (typeof part === "string" ? part : part?.text || ""))
        .join(" ");
    return String(content || "");
  }

  function normalizeTitle(value) {
    const title = String(value || "")
      .replace(/[\r\n]+/g, " ")
      .replace(/^\s*(?:título|titulo)\s*:\s*/i, "")
      .replace(/^['"“”]+|['"“”]+$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[.!?]+$/g, "")
      .trim();
    if (title.length < 3) throw new Error("A API não retornou um título utilizável.");
    return title.slice(0, MAX_TITLE_LENGTH).trim();
  }

  async function generateTitle(
    input,
    { fetchImpl = root.fetch, endpoint = API_BASE, timeoutMs = 12000 } = {},
  ) {
    if (typeof fetchImpl !== "function")
      throw new Error("A sugestão por IA não está disponível neste navegador.");
    const normalized = normalizeInput(input);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${String(endpoint).replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "system",
              content: "Responda somente com o título solicitado.",
            },
            { role: "user", content: buildPrompt(normalized) },
          ],
          temperature: 0.2,
          max_tokens: 48,
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 429)
        throw new Error("A cota pública da IA está temporariamente ocupada. Tente novamente em instantes.");
      if (!response.ok)
        throw new Error(payload?.error?.message || `Serviço de IA indisponível (${response.status}).`);
      return {
        title: normalizeTitle(responseText(payload)),
        model: MODEL,
        provider: "LLM7.io",
      };
    } catch (error) {
      if (error?.name === "AbortError")
        throw new Error("A sugestão por IA demorou mais que o esperado.");
      if (error?.name === "TypeError" && /load failed|fetch|network/i.test(error?.message || ""))
        throw new Error("Não foi possível acessar o serviço público de IA.");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    API_BASE,
    MODEL,
    buildPrompt,
    generateTitle,
    normalizeInput,
    normalizeSubjects,
    normalizeTitle,
  };
});
