((root, factory) => {
  const api = factory();
  root.OfficeJurBcbApi = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";

  const BASE_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs";
  const SERIES = Object.freeze({
    selicDaily: 11,
    inpcMonthly: 188,
    ipcaMonthly: 433,
    ipca15Monthly: 7478,
    ipcaEMonthly: 10764,
  });

  function isoDate(value) {
    const text = String(value || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    if (/^\d{4}-\d{2}$/.test(text)) return `${text}-01`;
    throw new Error(`Data inválida para consulta ao BACEN: ${value || "vazia"}.`);
  }

  function brazilianDate(value) {
    const [year, month, day] = isoDate(value).split("-");
    return `${day}/${month}/${year}`;
  }

  function urlFor(seriesId, start, end) {
    const params = new URLSearchParams({
      formato: "json",
      dataInicial: brazilianDate(start),
      dataFinal: brazilianDate(end),
    });
    return `${BASE_URL}.${encodeURIComponent(String(seriesId))}/dados?${params}`;
  }

  function parseDate(value) {
    const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) throw new Error(`Data recebida do BACEN inválida: ${value || "vazia"}.`);
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  function parseValue(value) {
    const parsed = Number(String(value ?? "").replace(",", "."));
    if (!Number.isFinite(parsed)) throw new Error(`Valor recebido do BACEN inválido: ${value}.`);
    return parsed;
  }

  async function series(seriesId, { start, end, fetchImpl = globalThis.fetch } = {}) {
    if (typeof fetchImpl !== "function") throw new Error("A consulta ao BACEN requer fetch disponível.");
    const response = await fetchImpl(urlFor(seriesId, start, end), { cache: "no-store" });
    if (!response.ok) throw new Error(`BACEN indisponível (${response.status}).`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Resposta do BACEN fora do formato esperado.");
    return rows.map((row) => ({ date: parseDate(row.data), value: parseValue(row.valor) }));
  }

  async function monthly(seriesId, { start, end, fetchImpl = globalThis.fetch } = {}) {
    const rows = await series(seriesId, { start, end, fetchImpl });
    return Object.fromEntries(rows.map((row) => [row.date.slice(0, 7), row.value]));
  }

  return { BASE_URL, SERIES, brazilianDate, monthly, series, urlFor };
});
