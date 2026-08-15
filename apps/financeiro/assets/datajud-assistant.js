((root, factory) => {
  const api = factory(root);
  root.OfficeJurDataJud = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, (root) => {
  "use strict";

  const API_BASE = "https://api-publica.datajud.cnj.jus.br";
  const DATAJUD_PROXY_PATH = "/datajud/search";
  // A chave publicada pelo CNJ é pública e pode ser alterada pelo órgão.
  const PUBLIC_API_KEY =
    "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";
  const CNJ_LENGTH = 20;
  const SEGMENTS = Object.freeze({
    1: "Supremo Tribunal Federal",
    2: "Conselho Nacional de Justiça",
    3: "Superior Tribunal de Justiça",
    4: "Justiça Federal",
    5: "Justiça do Trabalho",
    6: "Justiça Eleitoral",
    7: "Justiça Militar da União",
    8: "Justiça Estadual",
    9: "Justiça Militar Estadual",
  });
  const STATE_NAMES = Object.freeze({
    AC: "Acre",
    AL: "Alagoas",
    AP: "Amapá",
    AM: "Amazonas",
    BA: "Bahia",
    CE: "Ceará",
    DF: "Distrito Federal",
    ES: "Espírito Santo",
    GO: "Goiás",
    MA: "Maranhão",
    MT: "Mato Grosso",
    MS: "Mato Grosso do Sul",
    MG: "Minas Gerais",
    PA: "Pará",
    PB: "Paraíba",
    PR: "Paraná",
    PE: "Pernambuco",
    PI: "Piauí",
    RJ: "Rio de Janeiro",
    RN: "Rio Grande do Norte",
    RS: "Rio Grande do Sul",
    RO: "Rondônia",
    SC: "Santa Catarina",
    SE: "Sergipe",
    SP: "São Paulo",
    TO: "Tocantins",
  });
  const ESTADUAL = Object.freeze({
    "01": ["tjac", "TJAC", "Tribunal de Justiça do Acre", "AC"],
    "02": ["tjal", "TJAL", "Tribunal de Justiça de Alagoas", "AL"],
    "03": ["tjap", "TJAP", "Tribunal de Justiça do Amapá", "AP"],
    "04": ["tjam", "TJAM", "Tribunal de Justiça do Amazonas", "AM"],
    "05": ["tjba", "TJBA", "Tribunal de Justiça da Bahia", "BA"],
    "06": ["tjce", "TJCE", "Tribunal de Justiça do Ceará", "CE"],
    "07": ["tjdft", "TJDFT", "Tribunal de Justiça do Distrito Federal e Territórios", "DF"],
    "08": ["tjes", "TJES", "Tribunal de Justiça do Espírito Santo", "ES"],
    "09": ["tjgo", "TJGO", "Tribunal de Justiça de Goiás", "GO"],
    "10": ["tjma", "TJMA", "Tribunal de Justiça do Maranhão", "MA"],
    "11": ["tjmt", "TJMT", "Tribunal de Justiça de Mato Grosso", "MT"],
    "12": ["tjms", "TJMS", "Tribunal de Justiça de Mato Grosso do Sul", "MS"],
    "13": ["tjmg", "TJMG", "Tribunal de Justiça de Minas Gerais", "MG"],
    "14": ["tjpa", "TJPA", "Tribunal de Justiça do Pará", "PA"],
    "15": ["tjpb", "TJPB", "Tribunal de Justiça da Paraíba", "PB"],
    "16": ["tjpr", "TJPR", "Tribunal de Justiça do Paraná", "PR"],
    "17": ["tjpe", "TJPE", "Tribunal de Justiça de Pernambuco", "PE"],
    "18": ["tjpi", "TJPI", "Tribunal de Justiça do Piauí", "PI"],
    "19": ["tjrj", "TJRJ", "Tribunal de Justiça do Rio de Janeiro", "RJ"],
    "20": ["tjrn", "TJRN", "Tribunal de Justiça do Rio Grande do Norte", "RN"],
    "21": ["tjrs", "TJRS", "Tribunal de Justiça do Rio Grande do Sul", "RS"],
    "22": ["tjro", "TJRO", "Tribunal de Justiça de Rondônia", "RO"],
    "23": ["tjsc", "TJSC", "Tribunal de Justiça de Santa Catarina", "SC"],
    "24": ["tjse", "TJSE", "Tribunal de Justiça de Sergipe", "SE"],
    "25": ["tjsp", "TJSP", "Tribunal de Justiça de São Paulo", "SP"],
    "26": ["tjto", "TJTO", "Tribunal de Justiça do Tocantins", "TO"],
  });
  const FEDERAL = Object.freeze({
    "01": ["trf1", "TRF1", "Tribunal Regional Federal da 1ª Região"],
    "02": ["trf2", "TRF2", "Tribunal Regional Federal da 2ª Região"],
    "03": ["trf3", "TRF3", "Tribunal Regional Federal da 3ª Região"],
    "04": ["trf4", "TRF4", "Tribunal Regional Federal da 4ª Região"],
    "05": ["trf5", "TRF5", "Tribunal Regional Federal da 5ª Região"],
    "06": ["trf6", "TRF6", "Tribunal Regional Federal da 6ª Região"],
  });
  const WORK = Object.freeze(
    Object.fromEntries(
      Array.from({ length: 24 }, (_, index) => {
        const code = String(index + 1).padStart(2, "0");
        return [code, [`trt${index + 1}`, `TRT${index + 1}`, `Tribunal Regional do Trabalho da ${index + 1}ª Região`]];
      }),
    ),
  );
  const SUPERIOR = Object.freeze({
    "3.00": ["stj", "STJ", "Superior Tribunal de Justiça"],
    "5.00": ["tst", "TST", "Tribunal Superior do Trabalho"],
    "6.00": ["tse", "TSE", "Tribunal Superior Eleitoral"],
    "7.00": ["stm", "STM", "Superior Tribunal Militar"],
  });
  const MILITARY_STATE = Object.freeze({
    "13": ["tjmmg", "TJMMG", "Tribunal de Justiça Militar de Minas Gerais", "MG"],
    "21": ["tjmrs", "TJMRS", "Tribunal de Justiça Militar do Rio Grande do Sul", "RS"],
    "25": ["tjmsp", "TJMSP", "Tribunal de Justiça Militar de São Paulo", "SP"],
  });
  const ELECTORAL = Object.freeze(
    Object.fromEntries(
      Object.entries(ESTADUAL).map(([code, [, , , uf]]) => [
        code,
        [`tre-${uf.toLowerCase()}`, `TRE-${uf}`, `Tribunal Regional Eleitoral de ${STATE_NAMES[uf]}`],
      ]),
    ),
  );

  const digits = (value) => String(value || "").replace(/\D/g, "");

  function normalizeCnj(value) {
    return digits(value).slice(0, CNJ_LENGTH);
  }

  function maskCnj(value) {
    const raw = normalizeCnj(value);
    if (raw.length <= 7) return raw;
    let result = `${raw.slice(0, 7)}-${raw.slice(7, 9)}`;
    if (raw.length > 9) result += `.${raw.slice(9, 13)}`;
    if (raw.length > 13) result += `.${raw.slice(13, 14)}`;
    if (raw.length > 14) result += `.${raw.slice(14, 16)}`;
    if (raw.length > 16) result += `.${raw.slice(16, 20)}`;
    return result;
  }

  function validCnj(value) {
    const raw = normalizeCnj(value);
    if (raw.length !== CNJ_LENGTH || !/^[0-9]{20}$/.test(raw) || raw[13] === "0") return false;
    const base = raw.slice(0, 7) + raw.slice(9);
    const calculated = (98n - ((BigInt(base) * 100n) % 97n)).toString().padStart(2, "0");
    return raw.slice(7, 9) === calculated;
  }

  function tribunalFromCnj(value) {
    const raw = normalizeCnj(value);
    if (!validCnj(raw)) return null;
    const segment = raw[13], tribunalCode = raw.slice(14, 16);
    let entry = null;
    if (segment === "8") entry = ESTADUAL[tribunalCode];
    if (segment === "4") entry = FEDERAL[tribunalCode];
    if (segment === "5") entry = WORK[tribunalCode];
    if (segment === "6") entry = ELECTORAL[tribunalCode];
    entry = SUPERIOR[`${segment}.${tribunalCode}`] || entry;
    if (segment === "9") entry = MILITARY_STATE[tribunalCode];
    if (!entry) return null;
    return {
      alias: entry[0],
      code: entry[1],
      label: entry[2],
      uf: entry[3] || "",
      justiceType: SEGMENTS[segment] || "Justiça não identificada",
      segment,
      tribunalCode,
    };
  }

  function endpointFor(value) {
    const tribunal = tribunalFromCnj(value);
    if (!tribunal)
      throw new Error("Não foi possível identificar o tribunal deste número CNJ na API DataJud.");
    return `${API_BASE}/api_publica_${tribunal.alias}/_search`;
  }

  function queryFor(value) {
    const normalized = normalizeCnj(value);
    if (!validCnj(normalized)) throw new Error("Informe um número CNJ válido com 20 dígitos.");
    return {
      size: 1,
      query: { match: { numeroProcesso: normalized } },
    };
  }

  function firstText(...values) {
    return values.map((value) => String(value ?? "").trim()).find(Boolean) || "";
  }

  function normalizeDateTime(...values) {
    const value = firstText(...values);
    if (!/^\d{14}$/.test(value)) return value;
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}Z`;
  }

  function numberValue(value) {
    return value === null || value === undefined || value === "" ? "" : Number(value);
  }

  function normalizeSubjects(list) {
    return (Array.isArray(list) ? list : [])
      .map((item) => ({
        code: numberValue(item?.codigo),
        name: firstText(item?.nome),
      }))
      .filter((item) => item.name || item.code !== "")
      .slice(0, 200);
  }

  function normalizeMovements(list) {
    return (Array.isArray(list) ? list : [])
      .map((item) => ({
        code: numberValue(item?.codigo),
        name: firstText(item?.nome),
        dateTime: normalizeDateTime(item?.dataHora),
        court: {
          code: numberValue(item?.orgaoJulgador?.codigoOrgao),
          name: firstText(item?.orgaoJulgador?.nomeOrgao),
        },
        complements: (Array.isArray(item?.complementosTabelados)
          ? item.complementosTabelados
          : []
        )
          .map((complement) => ({
            code: numberValue(complement?.codigo),
            description: firstText(complement?.descricao),
            value: numberValue(complement?.valor),
            name: firstText(complement?.nome),
          }))
          .filter((complement) => complement.name || complement.description),
      }))
      .filter((item) => item.name || item.dateTime)
      .sort((left, right) => String(right.dateTime).localeCompare(String(left.dateTime)));
  }

  function processTitle(className, subjects) {
    const parts = [className, subjects[0]?.name].filter(Boolean);
    if (subjects.length > 1) return `${parts.join(" · ")} e outros assuntos`;
    return parts.join(" · ");
  }

  function normalizeProcess(source, requestedCnj = "") {
    const tribunal = tribunalFromCnj(source?.numeroProcesso || requestedCnj);
    const rawNumber = normalizeCnj(source?.numeroProcesso || requestedCnj);
    const className = firstText(source?.classe?.nome);
    const subjects = normalizeSubjects(source?.assuntos);
    return {
      id: firstText(source?.id),
      number: maskCnj(rawNumber),
      rawNumber,
      justiceType: tribunal?.justiceType || "Justiça não identificada",
      tribunal: firstText(source?.tribunal, tribunal?.code),
      tribunalName: tribunal?.label || firstText(source?.tribunal),
      state: tribunal?.uf || "",
      court: {
        code: numberValue(source?.orgaoJulgador?.codigo),
        ibgeCode: numberValue(source?.orgaoJulgador?.codigoMunicipioIBGE),
        name: firstText(source?.orgaoJulgador?.nome),
      },
      system: {
        code: numberValue(source?.sistema?.codigo),
        name: firstText(source?.sistema?.nome),
      },
      processClass: {
        code: numberValue(source?.classe?.codigo),
        name: className,
      },
      degree: firstText(source?.grau),
      format: {
        code: numberValue(source?.formato?.codigo),
        name: firstText(source?.formato?.nome),
      },
      filingDate: normalizeDateTime(source?.dataAjuizamento),
      secrecyLevel: numberValue(source?.nivelSigilo),
      subjects,
      movements: normalizeMovements(source?.movimentos),
      sourceUpdatedAt: normalizeDateTime(source?.dataHoraUltimaAtualizacao),
      dataJudTimestamp: normalizeDateTime(source?.["@timestamp"]),
      title: processTitle(className, subjects),
      raw: source && typeof source === "object" ? structuredClone(source) : {},
    };
  }

  function apiKey() {
    return (
      root.OFFICEJUR_CONFIG?.datajud?.publicApiKey ||
      root.OFFICEJUR_DATAJUD_API_KEY ||
      PUBLIC_API_KEY
    );
  }

  function resolveProxyUrl(value = "") {
    const configured = firstText(value, root.OFFICEJUR_CONFIG?.datajud?.proxyUrl);
    if (!configured) return "";
    try {
      const url = new URL(configured, root.location?.href || "https://officejur.invalid/");
      const currentOrigin = root.location?.origin || "";
      if (url.protocol !== "https:" && url.origin !== currentOrigin) return "";
      return url.href.replace(/\/$/, "");
    } catch {
      return "";
    }
  }

  async function lookupProcess(
    value,
    {
      fetchImpl = root.fetch,
      apiKey: providedKey,
      proxyUrl: providedProxyUrl,
      proxyKey: providedProxyKey,
    } = {},
  ) {
    const normalized = normalizeCnj(value);
    if (!validCnj(normalized)) throw new Error("Informe um número CNJ válido com 20 dígitos.");
    if (typeof fetchImpl !== "function") throw new Error("A consulta DataJud não está disponível neste navegador.");
    const proxyUrl = resolveProxyUrl(providedProxyUrl);
    if (!proxyUrl && root.location?.protocol === "https:")
      throw new Error("Configure o proxy DataJud do OfficeJur para consultar processos neste navegador.");
    if (proxyUrl && !String(providedProxyKey || "").trim())
      throw new Error("Informe a chave de acesso do Worker para consultar o DataJud.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const endpoint = endpointFor(normalized);
      const response = await fetchImpl(
        proxyUrl ? `${proxyUrl}${DATAJUD_PROXY_PATH}` : endpoint,
        {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: proxyUrl
            ? `Bearer ${String(providedProxyKey).trim()}`
            : `APIKey ${providedKey || apiKey()}`,
        },
        body: JSON.stringify(
          proxyUrl
            ? { path: new URL(endpoint).pathname, number: normalized }
            : queryFor(normalized),
        ),
        signal: controller.signal,
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403)
        throw new Error(
          proxyUrl
            ? "O Worker do OfficeJur recusou a chave de acesso."
            : "A API DataJud recusou a chave pública. Atualize a chave publicada pelo CNJ.",
        );
      if (response.status === 429)
        throw new Error("A API DataJud atingiu o limite temporário. Tente novamente em instantes.");
      if (!response.ok)
        throw new Error(
          payload?.message ||
            (proxyUrl
              ? `Proxy DataJud indisponível (${response.status}).`
              : `Consulta DataJud indisponível (${response.status}).`),
        );
      const source = payload?.hits?.hits?.[0]?._source;
      if (!source) throw new Error("Processo não encontrado na base pública do DataJud.");
      return normalizeProcess(source, normalized);
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("A consulta DataJud demorou mais que o esperado.");
      if (error?.name === "TypeError" && /load failed|fetch/i.test(error?.message || ""))
        throw new Error("Não foi possível acessar o proxy DataJud. Confira a URL do Worker e a origem autorizada.");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    API_BASE,
    DATAJUD_PROXY_PATH,
    CNJ_LENGTH,
    PUBLIC_API_KEY,
    endpointFor,
    lookupProcess,
    maskCnj,
    normalizeCnj,
    normalizeDateTime,
    normalizeMovements,
    normalizeProcess,
    queryFor,
    resolveProxyUrl,
    tribunalFromCnj,
    validCnj,
  };
});
