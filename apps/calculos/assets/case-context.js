((root, factory) => {
  const api = factory();
  root.OfficeJurCalculationCaseContext = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";

  const VERSION = "case-context-2.0.0";
  const ROLE_PAIRS = Object.freeze({
    Autor: "Réu", Réu: "Autor",
    Credor: "Devedor", Devedor: "Credor",
    Exequente: "Executado", Executado: "Exequente",
    Reclamante: "Reclamada", Reclamada: "Reclamante",
    "Exequente / Credor": "Executado / Devedor",
    "Executado / Devedor": "Exequente / Credor",
  });

  function normalizeParty(party = {}, source = "financeiro") {
    return {
      id: String(party.id || party.sourceId || ""),
      name: String(party.name || "").trim(),
      role: String(party.role || "").trim(),
      source: String(party.source || source),
      sourceId: String(party.sourceId || party.id || ""),
    };
  }

  function oppositeRole(role) {
    return ROLE_PAIRS[role] || "";
  }

  function roleOptions(kind = "generic") {
    if (kind === "labor") return ["Reclamante", "Reclamada"];
    if (kind === "pension") return ["Exequente / Credor", "Executado / Devedor"];
    return ["Autor", "Réu", "Credor", "Devedor"];
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
      clientParty: null,
    };
  }

  function partyContext(data, { clientId = "", caseId = "", clientRole = "", clientPartyRole = "", partyType = "" } = {}, finance) {
    const selectedRole = clientRole || clientPartyRole || partyType;
    const base = caseContext(data, { clientId, caseId }, finance);
    const clientParty = base.clientId && selectedRole
      ? normalizeParty({ id: base.clientId, sourceId: base.clientId, name: base.clientName, role: selectedRole, source: "client" }, "client")
      : null;
    return {
      ...base,
      clientParty,
      opposingRole: oppositeRole(selectedRole),
      caseParties: base.parties,
      additionalParties: [],
    };
  }

  function normalizeAdditionalParties(parties = []) {
    return parties.map((party) => normalizeParty(party, party.source || "manual"))
      .filter((party) => party.name || party.source === "manual");
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

  function applyCaseContext(input, context) {
    input.clientId = context.clientId;
    input.clientName = context.clientName;
    input.caseId = context.caseId;
    input.caseName = context.caseName;
    input.caseNumber = context.caseNumber || input.caseNumber || "";
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

  return { VERSION, ROLE_PAIRS, applyCaseContext, caseContext, normalizeAdditionalParties, normalizeParty, oppositeRole, opposingParty, partyContext, partyForRole, roleOptions, validateCaseContext };
});
