(() => {
  "use strict";

  const IBGE_BASE = "https://servicodados.ibge.gov.br/api/v1/localidades";
  const VIACEP_BASE = "https://viacep.com.br/ws";
  const CACHE_PREFIX = "officejur::localidades::";
  const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
  const STATES = [
    ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"],
    ["AM", "Amazonas"], ["BA", "Bahia"], ["CE", "Ceará"],
    ["DF", "Distrito Federal"], ["ES", "Espírito Santo"],
    ["GO", "Goiás"], ["MA", "Maranhão"], ["MT", "Mato Grosso"],
    ["MS", "Mato Grosso do Sul"], ["MG", "Minas Gerais"],
    ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"],
    ["PE", "Pernambuco"], ["PI", "Piauí"],
    ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"],
    ["RS", "Rio Grande do Sul"], ["RO", "Rondônia"],
    ["RR", "Roraima"], ["SC", "Santa Catarina"],
    ["SP", "São Paulo"], ["SE", "Sergipe"], ["TO", "Tocantins"],
  ];
  const controllers = new WeakMap();

  const digits = (value) => String(value || "").replace(/\D/g, "");
  const maskZip = (value) => {
    const raw = digits(value).slice(0, 8);
    return raw.length > 5 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw;
  };
  const municipalitiesUrl = (state) =>
    `${IBGE_BASE}/estados/${encodeURIComponent(String(state || "").toUpperCase())}/municipios?orderBy=nome`;
  const zipUrl = (zip) => `${VIACEP_BASE}/${digits(zip)}/json/`;

  async function requestJson(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Consulta indisponível (${response.status}).`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  function readCachedCities(state) {
    try {
      const cached = JSON.parse(localStorage.getItem(`${CACHE_PREFIX}${state}`));
      if (Date.now() - Number(cached?.savedAt || 0) > CACHE_TTL) return null;
      return Array.isArray(cached?.cities) ? cached.cities : null;
    } catch {
      return null;
    }
  }

  function cacheCities(state, cities) {
    try {
      localStorage.setItem(
        `${CACHE_PREFIX}${state}`,
        JSON.stringify({ savedAt: Date.now(), cities }),
      );
    } catch {
      // A lista continua utilizável nesta sessão mesmo quando o cache está cheio.
    }
  }

  async function citiesFor(state) {
    const uf = String(state || "").toUpperCase();
    if (!STATES.some(([code]) => code === uf)) return [];
    const cached = readCachedCities(uf);
    if (cached) return cached;
    const response = await requestJson(municipalitiesUrl(uf));
    const cities = [...new Set(
      (Array.isArray(response) ? response : [])
        .map((item) => String(item?.nome || "").trim())
        .filter(Boolean),
    )].sort((left, right) => left.localeCompare(right, "pt-BR"));
    cacheCities(uf, cities);
    return cities;
  }

  async function lookupZip(zip) {
    const normalized = digits(zip);
    if (normalized.length !== 8) throw new Error("Informe um CEP com 8 dígitos.");
    const result = await requestJson(zipUrl(normalized));
    if (result?.erro) throw new Error("CEP não encontrado.");
    return {
      zip: maskZip(result.cep || normalized),
      street: String(result.logradouro || "").trim(),
      complement: String(result.complemento || "").trim(),
      neighborhood: String(result.bairro || "").trim(),
      city: String(result.localidade || "").trim(),
      state: String(result.uf || "").trim().toUpperCase(),
    };
  }

  function setOptions(select, values, selected, placeholder) {
    select.replaceChildren();
    const first = document.createElement("option");
    first.value = "";
    first.textContent = placeholder;
    select.append(first);
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = Array.isArray(value) ? value[0] : value;
      option.textContent = Array.isArray(value) ? `${value[0]} — ${value[1]}` : value;
      select.append(option);
    });
    select.value = selected || "";
  }

  function setStatus(form, message = "", kind = "") {
    const status = form.querySelector("[data-address-status]");
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind;
  }

  function createController(form) {
    const state = form.elements.state;
    const city = form.elements.city;
    const zip = form.elements.zip;
    const street = form.elements.street;
    const streetHelp = form.querySelector("[data-address-street-help]");
    const requiresZip = form.dataset.addressStartWithZip === "true";
    if (!state || !city || !zip) return null;
    let cityRequest = 0;
    let lastLookupZip = "";

    function updateStreetAccess() {
      if (!requiresZip || !street) return;
      const unlocked = digits(zip.value).length === 8;
      street.readOnly = !unlocked;
      street.setAttribute("aria-readonly", String(!unlocked));
      street.title = unlocked ? "" : "Preencha o CEP para liberar o logradouro.";
      street.placeholder = unlocked ? "Ex.: Rua das Flores" : "Preencha o CEP primeiro";
      if (streetHelp) {
        streetHelp.textContent = unlocked
          ? "Informe somente o tipo e o nome do logradouro."
          : "Comece pelo CEP para liberar o preenchimento do logradouro.";
      }
    }

    setOptions(state, STATES, state.value.toUpperCase(), "Selecione a UF");

    async function loadCities(selectedCity = "") {
      const request = ++cityRequest;
      const uf = state.value;
      if (!uf) {
        setOptions(city, [], "", "Selecione primeiro a UF");
        city.disabled = true;
        return;
      }
      city.disabled = true;
      setOptions(city, [], "", "Carregando cidades…");
      setStatus(form, "Carregando a lista oficial de cidades…", "loading");
      try {
        const cities = await citiesFor(uf);
        if (request !== cityRequest) return;
        if (selectedCity && !cities.includes(selectedCity)) cities.push(selectedCity);
        cities.sort((left, right) => left.localeCompare(right, "pt-BR"));
        setOptions(city, cities, selectedCity, "Selecione a cidade");
        city.disabled = false;
        setStatus(form);
      } catch {
        if (request !== cityRequest) return;
        const fallback = selectedCity ? [selectedCity] : [];
        setOptions(city, fallback, selectedCity, "Cidades indisponíveis");
        city.disabled = !selectedCity;
        setStatus(form, "Não foi possível consultar o IBGE. Verifique a internet e tente novamente.", "error");
      }
    }

    async function refresh(selectedCityOverride) {
      const selectedState = String(state.value || "").toUpperCase();
      const selectedCity = selectedCityOverride ?? city.value;
      setOptions(state, STATES, selectedState, "Selecione a UF");
      zip.value = maskZip(zip.value);
      updateStreetAccess();
      await loadCities(selectedCity);
    }

    async function fillFromZip() {
      zip.value = maskZip(zip.value);
      const normalizedZip = digits(zip.value);
      if (normalizedZip.length !== 8 || normalizedZip === lastLookupZip) return;
      lastLookupZip = normalizedZip;
      setStatus(form, "Consultando o CEP…", "loading");
      try {
        const address = await lookupZip(zip.value);
        zip.value = address.zip;
        state.value = address.state;
        await loadCities(address.city);
        city.value = address.city;
        ["street", "neighborhood"].forEach((name) => {
          if (form.elements[name] && address[name]) form.elements[name].value = address[name];
        });
        if (form.elements.complement && address.complement && !form.elements.complement.value)
          form.elements.complement.value = address.complement;
        setStatus(form, "Endereço localizado pelo CEP. Confira o número e o complemento.", "success");
      } catch (error) {
        setStatus(form, error.message || "Não foi possível consultar o CEP.", "error");
      }
    }

    state.addEventListener("change", () => loadCities());
    zip.addEventListener("input", () => {
      zip.value = maskZip(zip.value);
      updateStreetAccess();
      if (digits(zip.value).length === 8) void fillFromZip();
      else setStatus(form);
    });
    zip.addEventListener("blur", () => {
      updateStreetAccess();
      if (digits(zip.value).length === 8) void fillFromZip();
    });
    updateStreetAccess();
    void refresh();
    return { fillFromZip, loadCities, refresh };
  }

  function setup(forms = document.querySelectorAll("form")) {
    forms.forEach((form) => {
      if (!controllers.has(form)) controllers.set(form, createController(form));
    });
  }

  function refresh(form, selectedCity) {
    return controllers.get(form)?.refresh(selectedCity) || Promise.resolve();
  }

  function fillFromZip(form) {
    return controllers.get(form)?.fillFromZip() || Promise.resolve();
  }

  const api = { STATES, citiesFor, fillFromZip, lookupZip, maskZip, municipalitiesUrl, refresh, setup, zipUrl };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalThis.OfficeJurAddressAssistant = api;
})();
