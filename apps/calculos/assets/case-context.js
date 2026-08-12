((root, factory) => {
  const api = factory();
  root.OfficeJurCalculationCaseContext = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";

  const VERSION = "case-context-1.0.0";

  function normalizeParty(party = {}, source = "financeiro") {
    return {
      id: String(party.id || ""),
      name: String(party.name || "").trim(),
      role: String(party.role || "").trim(),
      source: String(party.source || source),
    };
  }

  function caseContext(data, { clientId = "", caseId = "" } = {}, finance) {
    const client = finance?.findClient(data, clientId) || null;
    const item = finance?.findCase(data, caseId) || null;
    const validCase = item && String(item.clientId) === String(clientId) ? item : null;
    return {
      version: VERSION,
      clientId: client ? String(client.id) : "",
      clientName: client ? String(finance.clientLabel(client)) : "",
      caseId: validCase ? String(validCase.id) : "",
      caseName: validCase ? String(finance.caseLabel(validCase)) : "",
      caseNumber: validCase ? String(validCase.number || "") : "",
      parties: validCase && Array.isArray(validCase.parties)
        ? validCase.parties.map((party) => normalizeParty(party)).filter((party) => party.name)
        : [],
    };
  }

  function validateCaseContext(data, { clientId = "", caseId = "" } = {}, finance) {
    if (!clientId || !finance?.findClient(data, clientId))
      return { valid: false, reason: "client" };
    if (caseId) {
      const item = finance.findCase(data, caseId);
      if (!item || String(item.clientId) !== String(clientId))
        return { valid: false, reason: "case" };
    }
    return { valid: true, reason: "" };
  }

  function applyCaseContext(input, context, { preserveManual = true } = {}) {
    const previousParties = Array.isArray(input.parties) ? input.parties : [];
    const hasManualParties = previousParties.some((party) => party.name && party.source !== "financeiro");
    input.clientId = context.clientId;
    input.clientName = context.clientName;
    input.caseId = context.caseId;
    input.caseName = context.caseName;
    input.caseNumber = context.caseNumber || input.caseNumber || "";
    if (!preserveManual || !hasManualParties || !previousParties.length)
      input.parties = context.parties.map((party) => ({ ...party, source: "financeiro" }));
    return input;
  }

  function partyForRole(contextOrInput, role) {
    return (contextOrInput?.parties || []).find((party) =>
      String(party.role).toLocaleLowerCase("pt-BR") === String(role || "").toLocaleLowerCase("pt-BR"),
    ) || null;
  }

  function opposingParty(contextOrInput, role, roleMap = {}) {
    const opposingRole = roleMap[role];
    if (opposingRole) return partyForRole(contextOrInput, opposingRole);
    return (contextOrInput?.parties || []).find((party) => party.role !== role) || null;
  }

  return { VERSION, applyCaseContext, caseContext, normalizeParty, opposingParty, partyForRole, validateCaseContext };
});
