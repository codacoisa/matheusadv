(() => {
  "use strict";

  const API_BASE = "https://api.opencnpj.org";
  const CNPJ_BODY_LENGTH = 12;
  const CNPJ_LENGTH = 14;
  const CNPJ_PATTERN = /^[A-Z0-9]{12}[0-9]{2}$/;

  function normalizeCnpj(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, CNPJ_LENGTH);
  }

  function maskCnpj(value) {
    const raw = normalizeCnpj(value);
    return [
      raw.slice(0, 2),
      raw.slice(2, 5),
      raw.slice(5, 8),
      raw.slice(8, 12),
      raw.slice(12, 14),
    ].reduce((result, part, index) => {
      if (!part) return result;
      const separator = index === 1 ? "." : index === 2 ? "." : index === 3 ? "/" : index === 4 ? "-" : "";
      return result + separator + part;
    }, "");
  }

  function characterValue(character) {
    return character.charCodeAt(0) - 48;
  }

  function calculateDigit(raw, length) {
    let sum = 0;
    let weight = length - 7;
    for (let index = 0; index < length; index += 1) {
      sum += characterValue(raw[index]) * weight;
      weight -= 1;
      if (weight < 2) weight = 9;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  }

  function validCnpj(value) {
    const raw = normalizeCnpj(value);
    if (!CNPJ_PATTERN.test(raw) || /^([A-Z0-9])\1{13}$/.test(raw)) return false;
    return (
      calculateDigit(raw, CNPJ_BODY_LENGTH) === Number(raw[12]) &&
      calculateDigit(raw, CNPJ_LENGTH - 1) === Number(raw[13])
    );
  }

  function cnpjUrl(value) {
    return `${API_BASE}/${encodeURIComponent(normalizeCnpj(value))}`;
  }

  function firstText(...values) {
    return values
      .map((value) => String(value ?? "").trim())
      .find(Boolean) || "";
  }

  function phoneFromPayload(payload) {
    const phones = Array.isArray(payload.telefones) ? payload.telefones : [];
    const phone = phones.find((item) => !item?.is_fax && !item?.isFax && (item?.ddd || item?.numero));
    if (phone) return `${phone.ddd || ""}${phone.numero || ""}`.replace(/\D/g, "");
    return firstText(payload.ddd_telefone_1, payload.telefone, payload.phone).replace(/\D/g, "");
  }

  function normalizeCompany(payload, requestedCnpj = "") {
    const source = payload?.data && typeof payload.data === "object" ? payload.data : payload || {};
    return {
      cnpj: normalizeCnpj(source.cnpj || requestedCnpj),
      legalName: firstText(source.razao_social, source.legalName, source.legal_name),
      tradeName: firstText(source.nome_fantasia, source.tradeName, source.trade_name),
      legalNature: firstText(source.natureza_juridica, source.legalNature, source.legal_nature),
      phone: phoneFromPayload(source),
      email: firstText(source.email, source.correio_eletronico),
      street: firstText(source.logradouro, source.street),
      addressNumber: firstText(source.numero, source.addressNumber, source.number),
      complement: firstText(source.complemento, source.complement),
      neighborhood: firstText(source.bairro, source.neighborhood),
      zip: firstText(source.cep, source.zip),
      state: firstText(source.uf, source.state).toUpperCase(),
      city: firstText(source.municipio, source.city),
      status: firstText(source.situacao_cadastral, source.situacao, source.status),
    };
  }

  async function lookupCnpj(value) {
    const normalized = normalizeCnpj(value);
    if (!validCnpj(normalized)) throw new Error("CNPJ inválido.");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(cnpjUrl(normalized), {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (response.status === 404) throw new Error("CNPJ não encontrado na base pública.");
      if (response.status === 429) throw new Error("A consulta pública atingiu o limite temporário. Tente novamente em instantes.");
      if (!response.ok) throw new Error(`Consulta indisponível (${response.status}).`);
      const payload = await response.json();
      const company = normalizeCompany(payload, normalized);
      if (!company.legalName) throw new Error("A API retornou uma resposta sem razão social.");
      return company;
    } finally {
      clearTimeout(timeout);
    }
  }

  const api = {
    API_BASE,
    CNPJ_PATTERN,
    cnpjUrl,
    lookupCnpj,
    maskCnpj,
    normalizeCnpj,
    normalizeCompany,
    validCnpj,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalThis.OfficeJurCnpjAssistant = api;
})();
