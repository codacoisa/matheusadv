((root, factory) => {
  const api = factory();
  root.OfficeJurLegalIndices = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";
  const bcbApi = typeof globalThis !== "undefined" ? globalThis.OfficeJurBcbApi : null;
  const LEGAL_RATE_START_MONTH = "2024-08";
  const BCB_BASE = "https://api.bcb.gov.br/dados/serie/bcdata.sgs";
  const SOURCES = Object.freeze({
    inpc: `${BCB_BASE}.188/dados`,
    ipca: `${BCB_BASE}.433/dados`,
    ipca15: `${BCB_BASE}.7478/dados`,
    ipcaE: `${BCB_BASE}.10764/dados`,
    selic: `${BCB_BASE}.11/dados`,
    law: "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/l14905.htm",
    resolution: "https://aprendervalor.bcb.gov.br/content/estabilidadefinanceira/especialnor/Resolu%C3%A7%C3%A3o5171.pdf",
    minimumWage: "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/decreto/d12797.htm",
  });
  const month = (value) => String(value).slice(0, 7);
  const parseMonth = (value) => new Date(`${month(value)}-01T00:00:00Z`);
  const addMonths = (value, amount) => {
    const date = parseMonth(value);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1)).toISOString().slice(0, 7);
  };
  const endOfMonth = (value) => {
    const date = parseMonth(value);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  };
  const months = (start, end) => {
    const values = [];
    for (let cursor = month(start); cursor <= month(end); cursor = addMonths(cursor, 1)) values.push(cursor);
    return values;
  };
  const legalRateFromFactors = (selicFactor, ipcaFactor) =>
    Math.max(0, Number(((Number(selicFactor) / Number(ipcaFactor) - 1) * 100).toFixed(6)));
  const normalizeCorrectionType = (type) => type === "IPCA-15" ? "IPCA15" : type;
  function requireBcb() {
    if (!bcbApi?.monthly || !bcbApi?.series || !bcbApi.SERIES) throw new Error("A fonte BACEN não foi carregada.");
    return bcbApi;
  }
  function assertCompleteMonths(rates, start, end, label) {
    const missing = months(start, end).filter((key) => !Object.prototype.hasOwnProperty.call(rates, key));
    if (missing.length) throw new Error(`O BACEN não forneceu ${label} para ${missing.join(", ")}.`);
  }
  async function monthlySeries(seriesId, start, end, label) {
    const api = requireBcb();
    const rates = await api.monthly(seriesId, { start: `${month(start)}-01`, end: endOfMonth(end) });
    assertCompleteMonths(rates, start, end, label);
    return rates;
  }
  async function correction(type, start, end) {
    const normalized = normalizeCorrectionType(type);
    const seriesByType = {
      INPC: ["inpcMonthly", "INPC"],
      IPCA: ["ipcaMonthly", "IPCA"],
      "IPCA-E": ["ipcaEMonthly", "IPCA-E"],
      IPCA15: ["ipca15Monthly", "IPCA-15"],
    };
    if (seriesByType[normalized]) {
      const [seriesKey, label] = seriesByType[normalized];
      return monthlySeries(requireBcb().SERIES[seriesKey], start, end, label);
    }
    return {};
  }
  async function legal(start, end) {
    const targetMonths = months(start, end);
    const sourceStart = addMonths(targetMonths[0], -1), sourceEnd = addMonths(targetMonths.at(-1), -1);
    const api = requireBcb();
    const ipca15 = await monthlySeries(api.SERIES.ipca15Monthly, sourceStart, sourceEnd, "IPCA-15");
    const first = parseMonth(sourceStart), last = parseMonth(sourceEnd);
    const daily = await api.series(api.SERIES.selicDaily, { start: first.toISOString().slice(0, 10), end: endOfMonth(sourceEnd) });
    const grouped = {};
    daily.forEach((item) => {
      (grouped[month(item.date)] ||= []).push(Number(item.value));
    });
    return Object.fromEntries(targetMonths.map((target) => {
      const source = addMonths(target, -1);
      if (!(source in ipca15) || !grouped[source]?.length)
        throw new Error(`Dados oficiais insuficientes para calcular a Taxa Legal de ${target}.`);
      const selicFactor = Number(grouped[source].reduce((factor, rate) => factor * (1 + rate / 100), 1).toFixed(8));
      const ipcaFactor = Number((1 + ipca15[source] / 100).toFixed(4));
      return [target, legalRateFromFactors(selicFactor, ipcaFactor)];
    }));
  }
  async function snapshot({ correctionType, interestType, start, end }) {
    const legalStart = month(start) < LEGAL_RATE_START_MONTH ? LEGAL_RATE_START_MONTH : month(start);
    const [correctionRates, legalRates] = await Promise.all([
      correctionType === "none" ? {} : correction(correctionType, start, end),
      interestType === "legal" && month(end) >= LEGAL_RATE_START_MONTH ? legal(legalStart, end) : {},
    ]);
    const correctionSource = {
      INPC: SOURCES.inpc,
      IPCA: SOURCES.ipca,
      "IPCA-E": SOURCES.ipcaE,
      IPCA15: SOURCES.ipca15,
    }[normalizeCorrectionType(correctionType)];
    const sources = [...new Set([
      correctionSource,
      interestType === "legal" ? SOURCES.ipca15 : null,
      interestType === "legal" ? SOURCES.selic : null,
      SOURCES.law,
      SOURCES.resolution,
      SOURCES.minimumWage,
    ].filter(Boolean))];
    return {
      fetchedAt: new Date().toISOString(), start: month(start), end: month(end),
      correctionType: normalizeCorrectionType(correctionType), legalRates,
      correctionRates, sources,
    };
  }
  return { LEGAL_RATE_START_MONTH, SOURCES, correction, legal, legalRateFromFactors, months, normalizeCorrectionType, snapshot };
});
