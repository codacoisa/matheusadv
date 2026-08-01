((root, factory) => {
  const api = factory(root);
  root.OfficeJurCalculationFinance = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, (root) => {
  "use strict";

  const empty = () => ({ clients: [], cases: [], loaded: false });

  function clientLabel(client) {
    return String(client?.name || client?.document || "Cliente sem nome").trim();
  }

  function caseLabel(item) {
    if (!item) return "";
    const title = String(item.title || item.name || "").trim();
    const number = String(item.number || "").trim();
    if (title && number) return `${title} — ${number}`;
    return title || number || "Caso sem identificação";
  }

  async function load() {
    const storage = root.FinanceStorage;
    const dataStore = root.FinanceDataStore;
    if (!storage || !dataStore) return empty();
    const domains = await dataStore.load({ financeStorage: storage });
    return {
      clients: (domains.clients?.records || []).slice().sort((a, b) =>
        clientLabel(a).localeCompare(clientLabel(b), "pt-BR"),
      ),
      cases: (domains.cases?.records || []).slice(),
      loaded: true,
    };
  }

  function casesForClient(data, clientId) {
    return (data?.cases || [])
      .filter((item) => String(item.clientId || "") === String(clientId || ""))
      .sort((a, b) => caseLabel(a).localeCompare(caseLabel(b), "pt-BR"));
  }

  function findClient(data, clientId) {
    return (data?.clients || []).find((item) => String(item.id) === String(clientId)) || null;
  }

  function findCase(data, caseId) {
    return (data?.cases || []).find((item) => String(item.id) === String(caseId)) || null;
  }

  return { caseLabel, casesForClient, clientLabel, empty, findCase, findClient, load };
});
