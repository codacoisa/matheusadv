((root, factory) => {
  const api = factory();
  root.OfficeJurLegalIndices = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";
  const SOURCES = Object.freeze({
    inpc: "https://apisidra.ibge.gov.br/values/t/1736/n1/all/v/44",
    ipca: "https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/63",
    ipca15: "https://apisidra.ibge.gov.br/values/t/7062/n1/all/v/355",
    selic: "https://api.bcb.gov.br/dados/serie/bcdata.sgs.11/dados",
    law: "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/l14905.htm",
    resolution: "https://aprendervalor.bcb.gov.br/content/estabilidadefinanceira/especialnor/Resolu%C3%A7%C3%A3o5171.pdf",
    minimumWage: "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/decreto/d12797.htm",
  });
  const month = (value) => String(value).slice(0, 7);
  const compact = (value) => month(value).replace("-", "");
  const parseMonth = (value) => new Date(`${month(value)}-01T00:00:00Z`);
  const addMonths = (value, amount) => {
    const date = parseMonth(value);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1)).toISOString().slice(0, 7);
  };
  const months = (start, end) => {
    const values = [];
    for (let cursor = month(start); cursor <= month(end); cursor = addMonths(cursor, 1)) values.push(cursor);
    return values;
  };
  const legalRateFromFactors = (selicFactor, ipcaFactor) =>
    Math.max(0, Number(((Number(selicFactor) / Number(ipcaFactor) - 1) * 100).toFixed(6)));
  async function json(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Fonte oficial indisponível (${response.status}).`);
    return response.json();
  }
  async function sidra(table, variable, start, end, classification = "") {
    const period = `${compact(start)}-${compact(end)}`;
    const suffix = classification ? `/c315/${classification}` : "";
    const rows = await json(`https://apisidra.ibge.gov.br/values/t/${table}/n1/all/v/${variable}/p/${period}${suffix}`);
    return Object.fromEntries(rows.slice(1).filter((row) => row.V !== "...").map((row) => [
      `${row.D3C.slice(0, 4)}-${row.D3C.slice(4, 6)}`, Number(String(row.V).replace(",", ".")),
    ]));
  }
  async function correction(type, start, end) {
    if (type === "INPC") return sidra(1736, 44, start, end);
    if (type === "IPCA") return sidra(1737, 63, start, end);
    if (type === "IPCA-E") return sidra(7062, 355, start, end, 7169);
    return {};
  }
  const brDate = (date) => `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
  async function legal(start, end) {
    const targetMonths = months(start, end);
    const sourceStart = addMonths(targetMonths[0], -1), sourceEnd = addMonths(targetMonths.at(-1), -1);
    const ipca15 = await sidra(7062, 355, sourceStart, sourceEnd, 7169);
    const first = parseMonth(sourceStart), last = parseMonth(sourceEnd);
    const lastDay = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 0));
    const daily = await json(`${SOURCES.selic}?formato=json&dataInicial=${brDate(first)}&dataFinal=${brDate(lastDay)}`);
    const grouped = {};
    daily.forEach((item) => {
      const [day, monthNumber, year] = item.data.split("/");
      const key = `${year}-${monthNumber}`;
      (grouped[key] ||= []).push(Number(item.valor));
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
    const legalStart = month(start) < "2024-08" ? "2024-08" : month(start);
    const [correctionRates, legalRates] = await Promise.all([
      correctionType === "none" ? {} : correction(correctionType, start, end),
      interestType === "legal" && month(end) >= "2024-08" ? legal(legalStart, end) : {},
    ]);
    return {
      fetchedAt: new Date().toISOString(), start: month(start), end: month(end),
      correctionType, correctionRates, legalRates,
      sources: [SOURCES.inpc, SOURCES.ipca, SOURCES.ipca15, SOURCES.selic, SOURCES.law, SOURCES.resolution, SOURCES.minimumWage],
    };
  }
  return { SOURCES, correction, legal, legalRateFromFactors, months, snapshot };
});
