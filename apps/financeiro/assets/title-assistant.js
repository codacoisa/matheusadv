((root, factory) => {
  const api = factory(root);
  root.OfficeJurTitleAssistant = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, (root) => {
  "use strict";

  const API_BASE = "https://api.llm7.io/v1";
  const MODEL = "default";
  const MAX_CONTEXT_LENGTH = 140;
  const MAX_CURRENT_TITLE_LENGTH = 240;
  const MAX_SUBJECTS = 6;
  const MAX_TITLE_LENGTH = 120;
  const MAX_OUTPUT_TOKENS = 512;
  const RETRY_OUTPUT_TOKENS = 2048;
  const MIN_PRESERVATION_SCORE = 0.65;
  const MIN_COMPONENT_SCORE = 0.6;
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
  const RELATION_VARIANTS = [
    {
      source: /\bcontra\b/i,
      alternatives: [/\bcontra\b/i, /\bem desfavor de\b/i, /\bem face de\b/i],
    },
    {
      source: /\bem desfavor de\b/i,
      alternatives: [/\bcontra\b/i, /\bem desfavor de\b/i, /\bem face de\b/i],
    },
    {
      source: /\bem face de\b/i,
      alternatives: [/\bcontra\b/i, /\bem desfavor de\b/i, /\bem face de\b/i],
    },
  ];

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
      currentTitle: cleanText(input.currentTitle, MAX_CURRENT_TITLE_LENGTH),
      caseType: cleanText(input.caseType, 40),
      area: cleanText(input.area, 60),
      className: cleanText(input.className),
      subjects: normalizeSubjects(input.subjects),
    };
    if (!normalized.currentTitle && !normalized.className && !normalized.subjects.length)
      throw new Error("Digite um título ou carregue classe/assuntos para sugerir uma redação.");
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

  function comparisonTokens(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter((token) => token && !MATCH_STOPWORDS.has(token));
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

  function comparableTitle(value) {
    return String(value || "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  function baseTitles(input) {
    const current = input.currentTitle || "";
    const complete = [input.className, ...input.subjects].filter(Boolean).join(" · ");
    const firstSubject = input.subjects[0] || "";
    const deterministic = [input.className, firstSubject].filter(Boolean).join(" · ") +
      (input.subjects.length > 1 ? " e outros assuntos" : "");
    return [...new Set([current, complete, deterministic].filter(Boolean))];
  }

  function preservationScore(source, title) {
    const sourceTokens = [...new Set(matchingTokens(source))];
    if (!sourceTokens.length) return 1;
    const titleTokens = matchingTokens(title);
    const preserved = sourceTokens.filter(
      (sourceToken) => titleTokens.some((titleToken) => tokenIsPreserved(sourceToken, titleToken)),
    );
    return preserved.length / sourceTokens.length;
  }

  function lossyTitleError() {
    const error = new Error("A sugestão parece ter reduzido demais o sentido do título.");
    error.code = "LOSSY_TITLE";
    return error;
  }

  function assertSemanticRelations(source, title) {
    const sourceText = String(source || "");
    const titleText = String(title || "");
    for (const relation of RELATION_VARIANTS) {
      if (relation.source.test(sourceText) && !relation.alternatives.some((pattern) => pattern.test(titleText)))
        throw lossyTitleError();
    }
  }

  function assertParentheticalContent(source, title) {
    const titleTokens = comparisonTokens(title);
    const segments = [...String(source || "").matchAll(/\(([^()]*)\)/g)].map((match) => match[1]);
    for (const segment of segments) {
      const missing = comparisonTokens(segment).filter(
        (sourceToken) => !titleTokens.some((titleToken) => tokenIsPreserved(sourceToken, titleToken)),
      );
      if (missing.length) throw lossyTitleError();
    }
  }

  function assertSemanticContent(source, title) {
    assertSemanticRelations(source, title);
    assertParentheticalContent(source, title);
  }

  function assertTitlePreservesMeaning(title, input) {
    if (input.currentTitle) {
      if (preservationScore(input.currentTitle, title) < MIN_PRESERVATION_SCORE)
        throw lossyTitleError();
      assertSemanticContent(input.currentTitle, title);
      return title;
    }
    const classScore = preservationScore(mainClassName(input.className), title);
    if (input.className && classScore < MIN_COMPONENT_SCORE) throw lossyTitleError();
    if (input.subjects.some((subject) => preservationScore(subject, title) < MIN_COMPONENT_SCORE))
      throw lossyTitleError();
    if (preservationScore([mainClassName(input.className), ...input.subjects].join(" · "), title) < MIN_PRESERVATION_SCORE)
      throw lossyTitleError();
    assertSemanticContent(input.className, title);
    input.subjects.forEach((subject) => assertSemanticContent(subject, title));
    return title;
  }

  function unchangedTitleError() {
    const error = new Error("A IA não encontrou uma melhoria real de redação para o título.");
    error.code = "UNCHANGED_TITLE";
    return error;
  }

  function assertTitleImprovesWording(title, input) {
    if (baseTitles(input).some((base) => comparableTitle(base) === comparableTitle(title)))
      throw unchangedTitleError();
    return title;
  }

  function buildPrompt(input) {
    const normalized = normalizeInput(input);
    const lines = [
      "Tipo do caso: " + (normalized.caseType || "não informado"),
      "Área: " + (normalized.area || "não informada"),
      "Título atual ou rascunho: " + (normalized.currentTitle || "não informado"),
      "Classe processual: " + (normalized.className || "não informada"),
      "Assuntos processuais: " + (normalized.subjects.join("; ") || "não informados"),
    ];
    return [
      "Você é um assistente de redação de títulos de processos e casos jurídicos no Brasil.",
      "Crie um único título curto, claro e profissional, em português brasileiro, para uso interno em um escritório.",
      "Se houver título atual, melhore sua redação e normatize ortografia, capitalização, conectores e ordem; se não houver, crie um título a partir do contexto disponível.",
      "Use classe e assuntos como contexto para corrigir a terminologia, mas não é necessário copiar todos os campos literalmente. Preserve o núcleo do objeto e o sentido do título atual; qualificadores de procedimento podem ser resumidos quando não forem essenciais.",
      "Não retorne apenas uma troca de separador, hífen, pontuação ou espaços: isso não é uma melhoria. Correções reais de ortografia, acentuação e capitalização são melhorias válidas. Se não houver melhoria real sem perda de informação, retorne exatamente SEM_MELHORIA.",
      "Exemplo: 'Ação Penal - Procedimento Ordinário · Crimes de Trânsito' pode virar 'Ação Penal por crime de trânsito', mas nunca 'Ação Penal - Trânsito'.",
      "Não invente nem remova partes, fatos, pedidos, valores, tribunal, número, resultado ou fase processual que sejam relevantes no título atual. Não use dados que não estejam no contexto abaixo.",
      "Use capitalização normal em português, sem colocar a inicial de todas as palavras em maiúscula.",
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

  function normalizeSentenceCase(title) {
    return title.replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase("pt-BR"));
  }

  function normalizeTitle(value, input) {
    const title = normalizeSentenceCase(String(value || "")
      .replace(/[\r\n]+/g, " ")
      .replace(/^\s*(?:título|titulo)\s*:\s*/i, "")
      .replace(/^['"“”]+|['"“”]+$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[.!?]+$/g, "")
      .trim());
    if (title.length < 3) throw new Error("O serviço de IA respondeu sem um título utilizável.");
    if (/^sem[_ -]?melhoria$/i.test(title)) throw unchangedTitleError();
    if (title.length > MAX_TITLE_LENGTH)
      throw new Error("A IA retornou um título longo demais para preservar os metadados processuais.");
    if (!input) return title;
    assertTitlePreservesMeaning(title, input);
    return assertTitleImprovesWording(title, input);
  }

  async function generateTitle(
    input,
    { fetchImpl = root.fetch, endpoint = API_BASE, timeoutMs = 30000 } = {},
  ) {
    if (typeof fetchImpl !== "function")
      throw new Error("A sugestão por IA não está disponível neste navegador.");
    const normalized = normalizeInput(input);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `${String(endpoint).replace(/\/$/, "")}/chat/completions`;
      const requestBody = {
        model: MODEL,
        messages: [
          {
            role: "system",
            content: "Responda somente com o título solicitado. Não revele o raciocínio.",
          },
          { role: "user", content: buildPrompt(normalized) },
        ],
        temperature: 0.2,
        max_tokens: MAX_OUTPUT_TOKENS,
      };
      let response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      let payload = await response.json().catch(() => ({}));
      if (response.status === 429)
        throw new Error("A cota pública da IA está temporariamente ocupada. Tente novamente em instantes.");
      if (!response.ok)
        throw new Error(payload?.error?.message || `Serviço de IA indisponível (${response.status}).`);
      if (!responseText(payload).trim() && payload?.choices?.[0]?.finish_reason === "length") {
        requestBody.max_tokens = RETRY_OUTPUT_TOKENS;
        response = await fetchImpl(url, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        payload = await response.json().catch(() => ({}));
        if (response.status === 429)
          throw new Error("A cota pública da IA está temporariamente ocupada. Tente novamente em instantes.");
        if (!response.ok)
          throw new Error(payload?.error?.message || `Serviço de IA indisponível (${response.status}).`);
      }
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
    preservationScore,
    assertTitlePreservesMeaning,
    assertTitleImprovesWording,
    comparableTitle,
  };
});
