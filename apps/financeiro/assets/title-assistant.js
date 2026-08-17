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
  const MATCH_STOPWORDS = new Set([
    "a",
    "ao",
    "aos",
    "as",
    "com",
    "contra",
    "da",
    "das",
    "de",
    "do",
    "dos",
    "e",
    "em",
    "na",
    "nas",
    "no",
    "nos",
    "o",
    "os",
    "para",
    "por",
    "sem",
    "sobre",
  ]);

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

  function matchingTokens(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter((token) => token.length > 2 && !MATCH_STOPWORDS.has(token));
  }

  function tokenIsPreserved(sourceToken, titleToken) {
    return (
      sourceToken === titleToken ||
      sourceToken.startsWith(titleToken) ||
      titleToken.startsWith(sourceToken)
    );
  }

  function mainClassName(className) {
    return String(className || "").split(/\s+[-–—]\s+/, 1)[0];
  }

  function missingMetadataTokens(title, input) {
    const titleTokens = matchingTokens(title);
    const sourceTokens = [
      ...matchingTokens(mainClassName(input.className)),
      ...input.subjects.flatMap((subject) => matchingTokens(subject)),
    ];
    return [...new Set(sourceTokens)].filter(
      (sourceToken) => !titleTokens.some((titleToken) => tokenIsPreserved(sourceToken, titleToken)),
    );
  }

  function assertTitlePreservesMetadata(title, input) {
    if (missingMetadataTokens(title, input).length)
      throw new Error("A IA retornou um título incompleto e omitiu a classe principal ou parte dos assuntos processuais.");
    return title;
  }

  function buildPrompt(input) {
    const normalized = normalizeInput(input);
    const lines = [
      "Área: " + (normalized.area || "não informada"),
      "Classe processual: " + (normalized.className || "não informada"),
      "Assuntos processuais: " + (normalized.subjects.join("; ") || "não informados"),
      "Título-base completo: " +
        ([normalized.className, ...normalized.subjects].filter(Boolean).join(" · ") || "não informado"),
    ];
    return [
      "Você é um assistente de nomenclatura de processos jurídicos no Brasil.",
      "Crie um único título curto, claro e profissional, em português brasileiro, para uso interno em um escritório.",
      "Baseie-se exclusivamente nos metadados abaixo. Não faça um resumo excessivo: a classe principal e cada assunto processual são obrigatórios no resultado.",
      "Preserve a classe principal e todos os termos informativos dos assuntos. O qualificador de procedimento depois de um separador pode ser omitido ou reorganizado se isso deixar o título mais natural, mas não troque a classe ou os assuntos por categorias genéricas ou palavras mais curtas.",
      "Se não puder melhorar a redação sem perder informação, retorne exatamente o título-base completo.",
      "Exemplo: 'Ação Penal - Procedimento Ordinário · Crimes de Trânsito' pode virar 'Ação Penal por crime de trânsito', mas nunca 'Ação Penal - Trânsito'.",
      "Não invente partes, fatos, pedidos, valores, tribunal, número, resultado ou fase processual.",
      "Retorne somente o título, sem aspas, sem explicação, sem prefixo e sem ponto final.",
      "O título deve ter entre 3 e 120 caracteres.",
      "",
      ...lines,
    ].join("\n");
  }

  function responseText(payload) {
    const choice = payload?.choices?.[0] || {};
    const content = choice?.message?.content ?? choice?.text ?? payload?.output_text ?? payload?.text;
    if (Array.isArray(content))
      return content
        .map((part) => (typeof part === "string" ? part : part?.text || ""))
        .join(" ");
    if (content && typeof content === "object") return String(content.text || content.value || "");
    return String(content || "");
  }

  function normalizeTitle(value, input) {
    const title = String(value || "")
      .replace(/[\r\n]+/g, " ")
      .replace(/^\s*(?:título|titulo)\s*:\s*/i, "")
      .replace(/^['"“”]+|['"“”]+$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[.!?]+$/g, "")
      .trim();
    if (title.length < 3) throw new Error("O serviço de IA respondeu sem um título utilizável.");
    if (title.length > MAX_TITLE_LENGTH)
      throw new Error("A IA retornou um título longo demais para preservar os metadados processuais.");
    return input ? assertTitlePreservesMetadata(title, input) : title;
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
        title: normalizeTitle(responseText(payload), normalized),
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
    missingMetadataTokens,
    assertTitlePreservesMetadata,
  };
});
