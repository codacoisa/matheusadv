(() => {
  "use strict";
  const officeConfig = window.OFFICEJUR_CONFIG?.office || {};
  const statementDescriptor = officeConfig.statementDescriptor || "OFFICEJUR";
  const gistSettings = window.OfficeJurGistSettings;
  const financeFiles = window.FinanceFiles;
  const SCHEMA = "gm-financeiro-v6";
  const DATA_KEY = "gm-financeiro-data-v2",
    SYNC_STATE_KEY = "gm-financeiro-sync-state-v1",
    MP_KEY = "gm-financeiro-mp-v2",
    FILE = "financeiro-juridico.json",
    FILES_FILE = "financeiro-arquivos.json",
    LEGACY_FILES_BACKUP = "financeiro-arquivos-legado-v1.json",
    FILES_DB = "gm-financeiro-arquivos-db-v1",
    FILES_STORE = "state",
    FILES_CONTENT_STORE = "content",
    FILES_RECORD = "financeiro-arquivos",
    FILES_META_RECORD = "financeiro-arquivos-v2",
    GIST_RAW_MAX_SIZE = 10 * 1024 * 1024;
  const DOCUMENT_HANDOFF_PREFIX = "gm-document-handoff-v1:",
    DOCUMENT_HANDOFF_TTL = 5 * 60 * 1000;
  const DOCUMENT_ROUTES = {
    procuracao: "../documentos/procuracao/",
    honorarios: "../documentos/honorarios/",
  };
  const PHONE_DEFAULT_COUNTRY = "BR",
    PHONE_PRIORITY = [
      "BR",
      "CH",
      "PT",
      "US",
      "CA",
      "AR",
      "UY",
      "PY",
      "ES",
      "FR",
      "IT",
      "DE",
      "GB",
    ];
  const phoneApi = globalThis.libphonenumber;
  const {
    blankAgreement,
    buildSchedule,
    fixedModeOf,
    fixedTotal,
    normalizeAgreement,
    validateAgreement,
  } = globalThis.FinanceContracts;
  const { cashFlowSeries } = globalThis.FinanceMetrics;
  const {
    hasDuplicateCaseReference,
    hasDuplicateDocument,
    planPaymentAllocation,
    realizedAmountOf,
    remainingAmountOf,
    statusOf: ledgerStatusOf,
  } = globalThis.FinanceLedger;
  const incomeCats = [
    "Honorários fixos",
    "Honorários parcelados",
    "Honorários mensais",
    "Honorários por etapa",
    "Honorários de êxito",
    "Honorários sucumbenciais",
    "Reembolso de despesas",
    "Consultoria",
    "Outras receitas",
  ];
  const expenseCats = [
    "Custas processuais",
    "Diligências e correspondentes",
    "Peritos e assistentes",
    "Repasses a parceiros",
    "Pessoal e pró-labore",
    "Tributos",
    "Aluguel e estrutura",
    "Tecnologia",
    "Marketing",
    "Outras despesas",
  ];
  const $ = (s) => document.querySelector(s),
    $$ = (s) => [...document.querySelectorAll(s)];
  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const fileSize = (value) =>
    Number(value || 0) < 1024 * 1024
      ? `${Math.max(1, Math.round(Number(value || 0) / 1024))} KB`
      : `${(Number(value || 0) / (1024 * 1024)).toLocaleString("pt-BR", {
          maximumFractionDigits: 2,
        })} MB`;
  const uid = () =>
    crypto.randomUUID?.() ||
    `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const iso = () => new Date().toISOString().slice(0, 10),
    now = () => new Date().toISOString();
  const monthOf = (d) => String(d || "").slice(0, 7),
    currentMonth = () => iso().slice(0, 7);
  const money = (v) =>
    Number(v || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  const num = (v) => {
    const s = String(v ?? "")
      .trim()
      .replace(/[^\d,.-]/g, "");
    const n = s.includes(",")
      ? Number(s.replace(/\./g, "").replace(",", "."))
      : Number(s);
    return Number.isFinite(n) ? n : 0;
  };
  function titleCaseName(value, { company = false } = {}) {
    const particles = new Set(["a", "as", "da", "das", "de", "do", "dos", "e"]),
      companyTerms = new Map([
        ["me", "ME"],
        ["epp", "EPP"],
        ["mei", "MEI"],
        ["ltda", "LTDA"],
        ["slu", "SLU"],
        ["sa", "S.A."],
        ["s/a", "S/A"],
        ["ss", "S/S"],
      ]);
    return String(value || "")
      .normalize("NFC")
      .trim()
      .toLocaleLowerCase("pt-BR")
      .split(/\s+/)
      .filter(Boolean)
      .map((part, index) => {
        const plain = part.replace(/[.,]/g, "");
        if (company && companyTerms.has(plain)) return companyTerms.get(plain);
        if (index && particles.has(part)) return part;
        return part
          .split("-")
          .map(
            (piece) =>
              piece.charAt(0).toLocaleUpperCase("pt-BR") + piece.slice(1),
          )
          .join("-");
      })
      .join(" ");
  }
  const normalizeDocumentPhrase = (value) =>
    String(value || "")
      .normalize("NFC")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("pt-BR");
  const isCompanyDocument = (value) =>
    String(value || "").replace(/\D/g, "").length > 11;
  const maskCpf = (value) =>
    String(value || "")
      .replace(/\D/g, "")
      .slice(0, 11)
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  const maskCnpj = (value) =>
    String(value || "")
      .replace(/\D/g, "")
      .slice(0, 14)
      .replace(/(\d{2})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1/$2")
      .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
  const maskDocument = (value) => {
    const d = String(value || "").replace(/\D/g, "");
    return d.length > 11 ? maskCnpj(d) : maskCpf(d);
  };
  const maskZip = (value) =>
    String(value || "")
      .replace(/\D/g, "")
      .slice(0, 8)
      .replace(/(\d{2})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,3})$/, "$1-$2");
  const maskPhone = (value) => {
    let d = String(value || "").replace(/\D/g, "");
    if (d.startsWith("55") && (d.length === 12 || d.length === 13))
      d = d.slice(2);
    d = d.slice(0, 11);
    if (d.length <= 2) return d ? `(${d}` : "";
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return d.length <= 10
      ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
      : `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
  };
  const flagEmoji = (country) =>
    String(country || "")
      .toUpperCase()
      .replace(/[A-Z]/g, (letter) =>
        String.fromCodePoint(127397 + letter.charCodeAt()),
      );
  const countryNames =
    typeof Intl.DisplayNames === "function"
      ? new Intl.DisplayNames(["pt-BR"], { type: "region" })
      : null;
  const phoneCountryName = (country) => countryNames?.of(country) || country;
  const phoneCallingCode = (country) => phoneApi.getCountryCallingCode(country);
  function parsePhone(value, country = PHONE_DEFAULT_COUNTRY) {
    try {
      return (
        phoneApi.parsePhoneNumberFromString(String(value || ""), country) ||
        null
      );
    } catch {
      return null;
    }
  }
  function phoneDetails(value, country = PHONE_DEFAULT_COUNTRY) {
    const parsed = parsePhone(value, country);
    return parsed
      ? {
          country: parsed.country || country,
          national: parsed.nationalNumber,
          international: parsed.formatInternational(),
          e164: parsed.number,
        }
      : {
          country: country || PHONE_DEFAULT_COUNTRY,
          national: String(value || "").replace(/\D/g, ""),
          international: String(value || ""),
          e164: "",
        };
  }
  function formatPhoneNational(value, country) {
    const raw = String(value || "").trim(),
      international = raw.startsWith("+") ? parsePhone(raw) : null,
      selected = international?.country || country || PHONE_DEFAULT_COUNTRY,
      national = international?.nationalNumber || raw.replace(/\D/g, ""),
      callingCode = phoneCallingCode(selected),
      formatted = new phoneApi.AsYouType()
        .input(`+${callingCode}${national}`)
        .replace(new RegExp(`^\\+${callingCode}\\s*`), "");
    return { country: selected, value: formatted };
  }
  function displayPhone(client) {
    return (
      phoneDetails(client?.phone, client?.phoneCountry).international ||
      "Sem telefone"
    );
  }
  function setupPhoneCountries() {
    const select = $("#client-form [name=phoneCountry]"),
      countries = phoneApi.getCountries(),
      priority = new Map(
        PHONE_PRIORITY.map((country, index) => [country, index]),
      );
    countries
      .sort(
        (a, b) =>
          (priority.get(a) ?? 999) - (priority.get(b) ?? 999) ||
          phoneCountryName(a).localeCompare(phoneCountryName(b), "pt-BR"),
      )
      .forEach((country) => {
        const option = document.createElement("option");
        option.value = country;
        option.textContent = `${flagEmoji(country)} ${phoneCountryName(country)} (+${phoneCallingCode(country)})`;
        select.appendChild(option);
      });
    select.value = PHONE_DEFAULT_COUNTRY;
    syncPhoneField();
  }
  function syncPhoneField(value) {
    const form = $("#client-form"),
      select = form.elements.phoneCountry,
      input = form.elements.phoneNational,
      formatted = formatPhoneNational(value ?? input.value, select.value);
    if (formatted.country !== select.value) select.value = formatted.country;
    input.value = formatted.value;
    $("#phone-prefix").textContent = `+${phoneCallingCode(select.value)}`;
    $("#phone-hint").textContent =
      `${flagEmoji(select.value)} ${phoneCountryName(select.value)} · digite o número sem o DDI.`;
  }
  function validCpf(value) {
    const d = String(value || "").replace(/\D/g, "");
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    const digit = (size) => {
      let sum = 0;
      for (let i = 0; i < size; i++) sum += Number(d[i]) * (size + 1 - i);
      const r = (sum * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return digit(9) === Number(d[9]) && digit(10) === Number(d[10]);
  }
  const date = (v) =>
    v ? new Date(`${v}T12:00:00`).toLocaleDateString("pt-BR") : "—";
  const monthLabel = (v) =>
    new Date(`${v}-02T12:00:00`).toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });
  const deletedKeys = [
    "deletedClients",
    "deletedCases",
    "deletedPackages",
    "deletedTeam",
    "deletedEntries",
    "deletedCharges",
  ];
  function normalizeDeleted(list) {
    const map = new Map();
    (Array.isArray(list) ? list : []).forEach((item) => {
      if (!item || typeof item !== "object" || !item.id) return;
      const normalized = {
        id: String(item.id),
        deletedAt: String(item.deletedAt || ""),
      };
      const current = map.get(normalized.id);
      if (!current || normalized.deletedAt > current.deletedAt)
        map.set(normalized.id, normalized);
    });
    return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
  function emptyData() {
    return {
      schema: SCHEMA,
      updatedAt: now(),
      clients: [],
      cases: [],
      packages: [],
      team: [],
      entries: [],
      charges: [],
      accounts: [
        { id: "checking", name: "Conta corrente", initialBalance: 0 },
        { id: "cash", name: "Caixa", initialBalance: 0 },
        { id: "pix", name: "PIX", initialBalance: 0 },
        { id: "court", name: "Conta judicial", initialBalance: 0 },
      ],
      deletedClients: [],
      deletedCases: [],
      deletedPackages: [],
      deletedTeam: [],
      deletedEntries: [],
      deletedCharges: [],
    };
  }
  function normalizeClient(item = {}) {
    const fields = [
      "id",
      "type",
      "name",
      "document",
      "birthDate",
      "phone",
      "phoneCountry",
      "whatsapp",
      "email",
      "nationality",
      "maritalStatus",
      "profession",
      "rg",
      "rgIssuer",
      "street",
      "addressNumber",
      "complement",
      "neighborhood",
      "city",
      "state",
      "zip",
      "notes",
      "createdAt",
      "updatedAt",
    ];
    return Object.fromEntries(
      fields
        .filter((field) => item[field] !== undefined)
        .map((field) => [field, item[field]]),
    );
  }
  function normalizeCase(item = {}) {
    const fields = [
      "id",
      "clientId",
      "type",
      "area",
      "number",
      "title",
      "status",
      "contractScope",
      "packageId",
      "notes",
      "createdAt",
      "updatedAt",
    ];
    const normalized = Object.fromEntries(
      fields.map((field) => [field, item[field] ?? ""]),
    );
    normalized.contractScope = ["own", "package"].includes(
      normalized.contractScope,
    )
      ? normalized.contractScope
      : "";
    normalized.agreement = normalizeAgreement(item.agreement);
    normalized.assignments = Array.isArray(item.assignments)
      ? item.assignments
      : [];
    return normalized;
  }
  function normalizePackage(item = {}) {
    return {
      id: item.id ?? "",
      clientId: item.clientId ?? "",
      name: item.name ?? "",
      status: item.status === "closed" ? "closed" : "active",
      agreement: normalizeAgreement(item.agreement),
      notes: item.notes ?? "",
      createdAt: item.createdAt ?? "",
      updatedAt: item.updatedAt ?? "",
    };
  }
  function normalize(raw) {
    const d = { ...emptyData(), ...(raw || {}) };
    d.clients = (Array.isArray(d.clients) ? d.clients : []).map(
      normalizeClient,
    );
    d.cases = (Array.isArray(d.cases) ? d.cases : []).map(normalizeCase);
    d.packages = (Array.isArray(d.packages) ? d.packages : []).map(
      normalizePackage,
    );
    d.team = Array.isArray(d.team) ? d.team : [];
    d.entries = (Array.isArray(d.entries) ? d.entries : []).map((entry) => {
      const paidAmount = realizedAmountOf(entry);
      return {
        ...entry,
        paidAmount,
        status:
          paidAmount >= Number(entry.amount || 0) && Number(entry.amount || 0)
            ? "paid"
            : paidAmount > 0
              ? "partial"
              : "pending",
        caseId: entry.caseId || "",
        packageId: entry.packageId || "",
        contractSource: entry.contractSource || "",
        contractId: entry.contractId || "",
        scheduleItemId: entry.scheduleItemId || "",
        billingScope: entry.packageId
          ? "package"
          : entry.caseId
            ? "case"
            : entry.clientId
              ? "client"
              : "office",
        allocations: Array.isArray(entry.allocations) ? entry.allocations : [],
      };
    });
    d.charges = Array.isArray(d.charges) ? d.charges : [];
    d.accounts = Array.isArray(d.accounts) ? d.accounts : emptyData().accounts;
    deletedKeys.forEach((key) => (d[key] = normalizeDeleted(d[key])));
    return d;
  }
  function currentData(raw) {
    if (!raw || raw.schema !== SCHEMA)
      throw new Error("Os dados não usam o formato atual do Financeiro.");
    return raw;
  }
  function load() {
    try {
      const saved = localStorage.getItem(DATA_KEY);
      return saved ? normalize(currentData(JSON.parse(saved))) : emptyData();
    } catch {
      return emptyData();
    }
  }
  function openFilesDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(FILES_DB, 2);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(FILES_STORE))
          request.result.createObjectStore(FILES_STORE);
        if (!request.result.objectStoreNames.contains(FILES_CONTENT_STORE))
          request.result.createObjectStore(FILES_CONTENT_STORE, {
            keyPath: "id",
          });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(
          request.error ||
            new Error("Não foi possível abrir o armazenamento de arquivos."),
        );
    });
  }
  function filesTransaction(database, stores, mode, callback) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(stores, mode);
      callback(transaction);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
  async function loadFilesState() {
    try {
      const database = await openFilesDatabase();
      const result = await new Promise((resolve, reject) => {
        const transaction = database.transaction(FILES_STORE, "readonly"),
          store = transaction.objectStore(FILES_STORE),
          metaRequest = store.get(FILES_META_RECORD),
          legacyRequest = store.get(FILES_RECORD);
        transaction.oncomplete = () =>
          resolve({
            data: metaRequest.result
              ? financeFiles.normalizeData(metaRequest.result)
              : financeFiles.emptyData(),
            hasCurrentData: Boolean(metaRequest.result),
            legacy: financeFiles.normalizeLegacyData(legacyRequest.result),
          });
        metaRequest.onerror = () => reject(metaRequest.error);
        legacyRequest.onerror = () => reject(legacyRequest.error);
      });
      database.close();
      return result;
    } catch {
      return { data: financeFiles.emptyData(), legacy: null };
    }
  }
  async function saveFilesData(nextData) {
    const normalized = financeFiles.normalizeData(nextData),
      database = await openFilesDatabase();
    await filesTransaction(database, FILES_STORE, "readwrite", (transaction) =>
      transaction.objectStore(FILES_STORE).put(normalized, FILES_META_RECORD),
    );
    database.close();
    return normalized;
  }
  async function getFileContent(id) {
    const database = await openFilesDatabase();
    try {
      let result;
      await filesTransaction(database, FILES_CONTENT_STORE, "readonly", (transaction) => {
        const request = transaction.objectStore(FILES_CONTENT_STORE).get(id);
        request.onsuccess = () => (result = request.result || null);
      });
      return result;
    } finally {
      database.close();
    }
  }
  async function saveFileContent(item, blob) {
    const database = await openFilesDatabase();
    try {
      await filesTransaction(database, FILES_CONTENT_STORE, "readwrite", (transaction) =>
        transaction.objectStore(FILES_CONTENT_STORE).put({
          id: item.id,
          blob,
          sha256: item.sha256 || "",
          updatedAt: item.updatedAt || now(),
        }),
      );
    } finally {
      database.close();
    }
  }
  async function removeFileContent(id) {
    const database = await openFilesDatabase();
    try {
      await filesTransaction(database, FILES_CONTENT_STORE, "readwrite", (transaction) =>
        transaction.objectStore(FILES_CONTENT_STORE).delete(id),
      );
    } finally {
      database.close();
    }
  }
  async function prepareLegacyFiles(legacy) {
    if (!legacy?.files?.length)
      return { data: financeFiles.emptyData(), contents: new Map() };
    const migrated = financeFiles.emptyData(legacy.updatedAt || now());
    migrated.deletedFiles = legacy.deletedFiles || [];
    const contents = new Map();
    for (const legacyFile of legacy.files) {
      const blob = new Blob([financeFiles.fromBase64(legacyFile.base64)], {
          type: "application/pdf",
        });
      const item = {
        ...legacyFile,
        sha256: legacyFile.sha256 || (await financeFiles.sha256(blob)),
        payloadFile: legacyFile.payloadFile || financeFiles.payloadFileName(legacyFile.id),
      };
      delete item.base64;
      migrated.files.push(item);
      contents.set(item.id, { item, blob });
    }
    return { data: financeFiles.normalizeData(migrated), contents };
  }
  async function migrateLegacyFiles(legacy) {
    const prepared = await prepareLegacyFiles(legacy);
    if (!prepared?.data) return financeFiles.emptyData();
    for (const { item, blob } of prepared.contents.values())
      await saveFileContent(item, blob);
    const migrated = prepared.data;
    return saveFilesData(migrated);
  }
  function loadSettings() {
    const defaults = {
      gistId: "",
      token: "",
      autoSync: false,
      lastSyncAt: "",
      lastSyncSignature: "",
    };
    try {
      const syncState = JSON.parse(
          localStorage.getItem(SYNC_STATE_KEY) || "{}",
        ),
        globalSettings = gistSettings.load();
      return { ...defaults, ...syncState, ...globalSettings };
    } catch {
      return defaults;
    }
  }
  function loadMp() {
    try {
      return {
        environment: "test",
        publicKey: "",
        apiUrl: "",
        returnUrl: location.href.split("#")[0],
        statementDescriptor,
        autoReturn: true,
        ...JSON.parse(localStorage.getItem(MP_KEY) || "{}"),
      };
    } catch {
      return {
        environment: "test",
        publicKey: "",
        apiUrl: "",
        returnUrl: location.href.split("#")[0],
        statementDescriptor,
        autoReturn: true,
      };
    }
  }
  function clientDocumentPerson(client) {
    return {
      type: "pf",
      name: client.name || "",
      nationality: normalizeDocumentPhrase(client.nationality),
      maritalStatus: normalizeDocumentPhrase(client.maritalStatus),
      profession: normalizeDocumentPhrase(client.profession),
      rg: client.rg || "",
      rgIssuer: client.rgIssuer || "",
      cpf: client.document || "",
      phone: displayPhone(client),
      email: client.email || "",
      street: client.street || "",
      number: client.addressNumber || "",
      complement: client.complement || "",
      neighborhood: client.neighborhood || "",
      city: client.city || "",
      state: client.state || "",
      zip: client.zip || "",
    };
  }
  function pruneDocumentHandoffs() {
    const cutoff = Date.now() - DOCUMENT_HANDOFF_TTL;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key?.startsWith(DOCUMENT_HANDOFF_PREFIX)) continue;
      try {
        const item = JSON.parse(localStorage.getItem(key) || "{}");
        if (!item.createdAt || item.createdAt < cutoff)
          localStorage.removeItem(key);
      } catch {
        localStorage.removeItem(key);
      }
    }
  }
  function openClientDocument(clientId, type) {
    const client = data.clients.find((item) => item.id === clientId),
      route = DOCUMENT_ROUTES[type];
    if (!client || !route) return;
    pruneDocumentHandoffs();
    const token = uid(),
      key = `${DOCUMENT_HANDOFF_PREFIX}${token}`,
      payload = {
        version: 1,
        source: "financeiro",
        target: type,
        createdAt: Date.now(),
        person: clientDocumentPerson(client),
      };
    try {
      localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      return toast("Não foi possível preparar os dados do cliente.");
    }
    const url = new URL(route, location.href);
    url.searchParams.set("handoff", token);
    const link = document.createElement("a");
    link.href = url.toString();
    link.target = "_blank";
    link.rel = "noopener";
    link.click();
    setTimeout(() => localStorage.removeItem(key), DOCUMENT_HANDOFF_TTL);
    document
      .querySelectorAll(".document-menu[open]")
      .forEach((menu) => menu.removeAttribute("open"));
    toast(
      type === "procuracao"
        ? "Procuração aberta com os dados do cliente."
        : "Contrato aberto com os dados do cliente.",
    );
  }
  let data = load(),
    filesData = financeFiles.emptyData(),
    legacyFilesData = null,
    settings = loadSettings(),
    mp = loadMp(),
    syncTimer = 0,
    syncInFlight = null,
    syncPending = false,
    caseTeamFilterId = "",
    currentFilesClientId = "",
    filePreviewUrl = "";
  const filesReady = loadFilesState().then(async (loaded) => {
    legacyFilesData = loaded.legacy;
    filesData = loaded.data;
    if (financeFiles.shouldMigrateLegacy(loaded.hasCurrentData, legacyFilesData))
      filesData = await migrateLegacyFiles(legacyFilesData);
    renderClients();
    if (currentFilesClientId) renderClientFiles();
    return loaded;
  });
  setupPhoneCountries();
  setupAgreementEditor($("#case-agreement-editor"));
  setupAgreementEditor($("#package-agreement-editor"));
  function captureMissingDeletions() {
    let previous;
    try {
      previous = normalize(
        currentData(JSON.parse(localStorage.getItem(DATA_KEY) || "{}")),
      );
    } catch {
      return;
    }
    const collections = {
        clients: "deletedClients",
        cases: "deletedCases",
        packages: "deletedPackages",
        team: "deletedTeam",
        entries: "deletedEntries",
        charges: "deletedCharges",
      },
      deletedAt = now();
    Object.entries(collections).forEach(([collection, key]) => {
      const currentIds = new Set(
        (data[collection] || []).map((item) => item.id),
      );
      (previous[collection] || []).forEach((item) => {
        if (!currentIds.has(item.id)) markDeleted(key, item.id, deletedAt);
      });
    });
  }
  function persist(skipSync = false) {
    captureMissingDeletions();
    data.updatedAt = now();
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
    render();
    if (!skipSync) scheduleAutoSync();
  }
  function scheduleAutoSync() {
    if (!settings.autoSync || !settings.gistId || !settings.token) return;
    clearTimeout(syncTimer);
    if (syncSignature() === settings.lastSyncSignature) return;
    syncTimer = setTimeout(
      () => pushGist().catch((error) => toast(error.message)),
      1400,
    );
  }
  async function persistFiles(nextData, skipSync = false) {
    const candidate = {
      ...nextData,
      updatedAt: now(),
    };
    try {
      filesData = await saveFilesData(candidate);
    } catch {
      throw new Error(
        "Não foi possível salvar o PDF neste navegador. Verifique o espaço disponível.",
      );
    }
    renderClients();
    if (currentFilesClientId) renderClientFiles();
    if (!skipSync) scheduleAutoSync();
  }
  function markDeleted(key, id, deletedAt = now()) {
    if (!id) return;
    data[key] = normalizeDeleted([...(data[key] || []), { id, deletedAt }]);
  }
  function statusOf(e) {
    return ledgerStatusOf(e, iso());
  }
  function selectedMonth() {
    return $("#month-filter").value || currentMonth();
  }
  function filteredMonth() {
    return data.entries.filter((e) => monthOf(e.dueDate) === selectedMonth());
  }
  function totals(list) {
    return list.reduce(
      (a, e) => {
        const k = e.kind === "income" ? "income" : "expense";
        a[k] += e.amount;
        a[`${k}Paid`] += realizedAmountOf(e);
        if (
          e.kind === "income" &&
          e.dueDate < iso() &&
          remainingAmountOf(e) > 0
        )
          a.overdue += remainingAmountOf(e);
        return a;
      },
      { income: 0, expense: 0, incomePaid: 0, expensePaid: 0, overdue: 0 },
    );
  }
  function metric(icon, label, value, hint, cls = "") {
    return `<article class="metric ${cls}"><span class="icon"><i class="fa-solid ${icon}"></i></span><small>${label}</small><strong>${value}</strong><em>${hint}</em></article>`;
  }
  function render() {
    renderDashboard();
    renderEntries();
    renderClients();
    renderPackages();
    renderCases();
    renderTeam();
    renderCharges();
    renderReports();
    renderGistStatus();
  }
  function renderDashboard() {
    const list = filteredMonth(),
      t = totals(list);
    $("#period-label").textContent =
      `Competência de ${monthLabel(selectedMonth())}`;
    $("#metrics").innerHTML =
      metric(
        "fa-arrow-trend-up",
        "Receitas previstas",
        money(t.income),
        `${money(t.incomePaid)} já recebido`,
      ) +
      metric(
        "fa-arrow-trend-down",
        "Despesas previstas",
        money(t.expense),
        `${money(t.expensePaid)} já pago`,
      ) +
      metric(
        "fa-wallet",
        "Resultado realizado",
        money(t.incomePaid - t.expensePaid),
        "Regime de caixa",
      ) +
      metric(
        "fa-triangle-exclamation",
        "Inadimplência",
        money(t.overdue),
        "Recebíveis vencidos",
        "bad",
      );
    renderChart();
    const dues = data.entries
      .filter((e) => e.kind === "income" && statusOf(e) !== "paid")
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 5);
    $("#due-list").innerHTML = dues.length
      ? dues.map((e) => rowEntry(e)).join("")
      : '<div class="empty">Nenhum recebimento pendente.</div>';
    const groups = {};
    list
      .filter((e) => e.kind === "income")
      .forEach(
        (e) => (groups[e.category] = (groups[e.category] || 0) + e.amount),
      );
    const max = Math.max(1, ...Object.values(groups));
    $("#revenue-breakdown").innerHTML =
      Object.entries(groups)
        .sort((a, b) => b[1] - a[1])
        .map(
          ([k, v]) =>
            `<div class="break-row"><span>${k}</span><span class="progress"><i style="width:${(v / max) * 100}%"></i></span><strong>${money(v)}</strong></div>`,
        )
        .join("") || '<div class="empty">Sem receitas nesta competência.</div>';
    const cs = data.clients
      .map((c) => {
        const cases = data.cases.filter((x) => x.clientId === c.id),
          es = data.entries.filter(
            (e) => e.clientId === c.id && e.kind === "income",
          ),
          received = es.reduce((s, e) => s + realizedAmountOf(e), 0),
          contract =
            cases
              .filter((x) => x.contractScope === "own")
              .reduce((sum, item) => sum + fixedTotal(item.agreement), 0) +
            data.packages
              .filter((item) => item.clientId === c.id)
              .reduce((sum, item) => sum + fixedTotal(item.agreement), 0);
        return {
          c,
          cases,
          received,
          balance: Math.max(0, contract - received),
        };
      })
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 4);
    $("#case-summary").innerHTML = cs
      .map(
        (x) =>
          `<div class="row-item"><div><strong>${x.c.name}</strong><small>${x.cases.length} ${x.cases.length === 1 ? "caso" : "casos"}</small></div><div class="amount">${money(x.balance)}<small>a receber</small></div></div>`,
      )
      .join("");
  }
  function renderChart() {
    const values = cashFlowSeries(data.entries, selectedMonth());
    const max = Math.max(
      1,
      ...values.flatMap((item) => [item.income, item.expense]),
    );
    $("#cash-chart").innerHTML = values
      .map(
        ({ month, income, expense }) =>
          `<div class="bar-group"><div class="bars"><i class="bar" title="Recebido: ${money(income)}" style="height:${(income / max) * 100}%"></i><i class="bar expense" title="Pago: ${money(expense)}" style="height:${(expense / max) * 100}%"></i></div><small>${monthLabel(month).split(" ")[0].slice(0, 3)}</small></div>`,
      )
      .join("");
  }
  function clientName(id) {
    return data.clients.find((c) => c.id === id)?.name || "Sem vínculo";
  }
  function findCase(clientId, caseId) {
    return data.cases.find(
      (x) => x.id === caseId && (!clientId || x.clientId === clientId),
    );
  }
  function findPackage(clientId, packageId) {
    return data.packages.find(
      (item) =>
        item.id === packageId && (!clientId || item.clientId === clientId),
    );
  }
  function packageStats(packageId) {
    const item = data.packages.find((entry) => entry.id === packageId),
      entries = data.entries.filter(
        (entry) => entry.packageId === packageId && entry.kind === "income",
      ),
      contracted = item ? fixedTotal(item.agreement) : 0,
      received = entries.reduce(
        (sum, entry) => sum + realizedAmountOf(entry),
        0,
      ),
      pending = entries.reduce(
        (sum, entry) => sum + remainingAmountOf(entry),
        0,
      );
    return {
      contracted,
      received,
      pending,
      balance: Math.max(0, contracted - received),
    };
  }
  function agreementLabel(agreement) {
    const labels = {
      cash: "À vista",
      installments: "Parcelado",
      monthly: "Mensal",
      stages: "Por etapas",
      success: "Somente no êxito",
      mixed: "Fixo + êxito",
      custom: "Personalizado",
    };
    return labels[agreement?.mode] || "Não informada";
  }
  function caseName(entry) {
    if (!entry.clientId) return "Sem vínculo";
    if (entry.packageId) {
      const item = findPackage(entry.clientId, entry.packageId);
      return item ? `Pacote · ${item.name}` : "Pacote não encontrado";
    }
    if (!entry.caseId) return "Receita geral do cliente";
    const c = findCase(entry.clientId, entry.caseId);
    return c ? `${c.number} · ${c.title}` : "Caso não encontrado";
  }
  function buildAllocations(caseId, amount) {
    const item = data.cases.find((x) => x.id === caseId);
    return (item?.assignments || [])
      .filter((a) => Number(a.sharePercent || 0) > 0)
      .map((a) => ({
        personId: a.personId,
        personName: teamName(a.personId),
        assignmentRole: a.assignmentRole || "",
        isLead: Boolean(a.isLead),
        percent: Number(a.sharePercent || 0),
        amount: Number(
          ((Number(amount || 0) * Number(a.sharePercent || 0)) / 100).toFixed(
            2,
          ),
        ),
      }));
  }
  function renderAllocationPreview() {
    const f = $("#entry-form"),
      box = $("#entry-allocation-preview"),
      kind = f.elements.kind.value,
      clientId = f.elements.clientId.value,
      packageId = f.elements.packageId.value,
      caseId = f.elements.caseId.value,
      amount = num(f.elements.amount.value);
    if (kind !== "income") {
      box.innerHTML =
        '<span><i class="fa-solid fa-building"></i> Despesa: a vinculação serve para rastreabilidade, sem distribuição de receita.</span>';
      return;
    }
    if (!clientId) {
      box.innerHTML =
        '<span class="warn"><i class="fa-solid fa-triangle-exclamation"></i> Selecione o cliente para registrar esta receita.</span>';
      return;
    }
    if (packageId) {
      const item = findPackage(clientId, packageId);
      box.innerHTML = `<span><i class="fa-solid fa-layer-group"></i> Receita vinculada ao pacote <strong>${item?.name || "não encontrado"}</strong>, compartilhada por seus casos.</span>`;
      return;
    }
    if (!caseId) {
      box.innerHTML =
        '<span><i class="fa-solid fa-user"></i> Receita geral do cliente, sem pacote ou caso específico.</span>';
      return;
    }
    const allocations = buildAllocations(caseId, amount),
      total = allocations.reduce((s, a) => s + a.percent, 0);
    box.innerHTML = allocations.length
      ? `<header><strong>Distribuição registrada no lançamento</strong><span>${total}% distribuído · ${100 - total}% escritório</span></header>${allocations.map((a) => `<div><span>${a.personName}${a.isLead ? " · Responsável" : ""}</span><strong>${a.percent}% · ${money(a.amount)}</strong></div>`).join("")}`
      : '<span class="warn"><i class="fa-solid fa-user-group"></i> Este caso não possui percentuais de equipe. A receita ficará 100% atribuída ao escritório.</span>';
  }
  function rowEntry(e) {
    const st = statusOf(e),
      labels = {
        paid: "Realizado",
        partial: "Parcial",
        pending: "Pendente",
        overdue: "Em atraso",
      },
      balance = remainingAmountOf(e);
    return `<div class="row-item"><div><strong>${e.description}</strong><small>${clientName(e.clientId)} · ${date(e.dueDate)}${st === "partial" ? ` · saldo ${money(balance)}` : ""}</small></div><div><span class="badge ${st}">${labels[st]}</span><span class="amount ${e.kind}"> ${money(e.amount)}</span></div></div>`;
  }
  function getEntryFilters() {
    return {
      q: $("#entry-search")?.value.toLowerCase() || "",
      kind: $("#entry-kind")?.value || "",
      status: $("#entry-status")?.value || "",
    };
  }
  function renderEntries() {
    const f = getEntryFilters();
    const rows = data.entries
      .filter(
        (e) =>
          f.status === "receivable" || monthOf(e.dueDate) === selectedMonth(),
      )
      .filter(
        (e) =>
          (!f.q ||
            `${e.description} ${e.category} ${clientName(e.clientId)} ${caseName(e)}`
              .toLowerCase()
              .includes(f.q)) &&
          (!f.kind || e.kind === f.kind) &&
          (!f.status ||
            (f.status === "receivable"
              ? e.kind === "income" && statusOf(e) !== "paid"
              : statusOf(e) === f.status)),
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    $("#entries-table").innerHTML = rows.length
      ? rows
          .map(
            (e) =>
              `<tr><td>${date(e.dueDate)}</td><td><strong>${e.description}</strong><br><small>${e.category}${e.allocations?.length ? ` · ${e.allocations.length} participações` : ""}${statusOf(e) === "partial" ? ` · ${money(realizedAmountOf(e))} realizado · saldo ${money(remainingAmountOf(e))}` : ""}</small></td><td>${clientName(e.clientId)}<br><small>${caseName(e)}</small></td><td>${e.account}</td><td class="status-column"><span class="badge ${statusOf(e)}">${{ paid: "Realizado", partial: "Parcial", pending: "Pendente", overdue: "Em atraso" }[statusOf(e)]}</span></td><td class="money amount ${e.kind}">${e.kind === "expense" ? "−" : ""}${money(e.amount)}</td><td class="table-actions"><button title="Visualizar" data-view-entry="${e.id}"><i class="fa-solid fa-eye"></i></button><button title="Editar" data-edit-entry="${e.id}"><i class="fa-solid fa-pen"></i></button><button title="Excluir" data-delete-entry="${e.id}"><i class="fa-solid fa-trash"></i></button></td></tr>`,
          )
          .join("")
      : '<tr><td colspan="7" class="empty">Nenhum lançamento encontrado.</td></tr>';
  }
  function waUrl(phone, country) {
    const number = phoneDetails(phone, country).e164.replace(/\D/g, "");
    return number ? `https://wa.me/${number}` : "";
  }
  function renderClients() {
    const q = $("#client-search")?.value.toLowerCase() || "";
    const clients = data.clients.filter((c) =>
      `${c.name} ${c.document} ${displayPhone(c)} ${c.email}`
        .toLowerCase()
        .includes(q),
    );
    $("#clients-grid").innerHTML = clients.length
      ? clients
          .map((c) => {
            const cases = data.cases.filter((x) => x.clientId === c.id),
              clientFiles = filesData.files.filter(
                (file) => file.clientId === c.id,
              ),
              es = data.entries.filter((e) => e.clientId === c.id),
              rec = es
                .filter((e) => e.kind === "income")
                .reduce((s, e) => s + realizedAmountOf(e), 0);
            return `<article class="client-card contact-card"><header><span class="avatar">${c.name
              .split(/\s+/)
              .slice(0, 2)
              .map((x) => x[0])
              .join("")
              .toUpperCase()}</span><span>${c.whatsapp && c.phone ? `<a class="contact-icon whatsapp" href="${waUrl(c.phone, c.phoneCountry)}" target="_blank" rel="noopener" title="Conversar pelo WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>` : ""}<button class="link-btn file-folder-btn" data-client-files="${c.id}" title="Arquivos do cliente" aria-label="Arquivos do cliente"><i class="fa-solid ${clientFiles.length ? "fa-folder-open" : "fa-folder"}"></i>${clientFiles.length ? `<b>${clientFiles.length}</b>` : ""}</button><button class="link-btn" data-view-client="${c.id}" title="Visualizar cliente"><i class="fa-solid fa-eye"></i></button><button class="link-btn" data-edit-client="${c.id}" title="Editar cliente"><i class="fa-solid fa-pen"></i></button></span></header><h3>${c.name}</h3><p>${c.document || "CPF não informado"}${c.birthDate ? ` · ${date(c.birthDate)}` : ""}</p><div class="contact-lines"><span><i class="fa-solid fa-phone"></i>${displayPhone(c)}</span>${c.email ? `<span><i class="fa-solid fa-envelope"></i>${c.email}</span>` : ""}${c.city ? `<span><i class="fa-solid fa-location-dot"></i>${c.city}${c.state ? `/${c.state}` : ""}</span>` : ""}</div><div class="case-line"><div><strong>${cases.length}</strong><small>${cases.length === 1 ? "caso vinculado" : "casos vinculados"}</small></div><div class="amount income">${money(rec)}<small>recebido</small></div></div><details class="document-menu"><summary><span><i class="fa-solid fa-file-signature"></i> Gerar documento</span><i class="fa-solid fa-chevron-down"></i></summary><div class="document-options"><button type="button" data-client-document="${c.id}" data-document-type="procuracao"><i class="fa-solid fa-file-signature"></i><span><strong>Procuração</strong><small>Abrir gerador preenchido</small></span></button><button type="button" data-client-document="${c.id}" data-document-type="honorarios"><i class="fa-solid fa-scale-balanced"></i><span><strong>Contrato de honorários</strong><small>Abrir gerador preenchido</small></span></button></div></details><button class="add-case-btn" data-new-case="${c.id}"><i class="fa-solid fa-folder-plus"></i> Cadastrar caso para este cliente</button></article>`;
          })
          .join("")
      : '<div class="panel empty">Nenhum cliente encontrado.</div>';
  }
  function clientFileCases(clientId) {
    return data.cases
      .filter((item) => item.clientId === clientId)
      .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  }
  function closeFilePreview() {
    $("#file-preview").hidden = true;
    $("#file-preview-frame").removeAttribute("src");
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    filePreviewUrl = "";
  }
  async function fileBlob(item) {
    const local = await getFileContent(item.id);
    if (
      local?.blob &&
      (!item.sha256 ||
        (local.sha256 === item.sha256 &&
          (await financeFiles.sha256(local.blob)) === item.sha256))
    )
      return local.blob;
    const { gist } = await fetchGistFiles(),
      payload = gist.files?.[item.payloadFile];
    if (!payload)
      throw new Error("O conteúdo deste PDF ainda não está disponível neste navegador ou no Gist.");
    const encoded = await readGistText(
      payload,
      "Não foi possível baixar o PDF armazenado no Gist.",
    );
    const blob = new Blob([financeFiles.fromBase64(encoded)], {
      type: "application/pdf",
    });
    if (item.sha256 && (await financeFiles.sha256(blob)) !== item.sha256)
      throw new Error("O PDF baixado não passou na verificação de integridade.");
    await saveFileContent(item, blob);
    return blob;
  }
  function renderClientFiles() {
    const client = data.clients.find(
      (item) => item.id === currentFilesClientId,
    );
    if (!client) return;
    const records = filesData.files
        .filter((item) => item.clientId === client.id)
        .sort((a, b) => timestamp(b).localeCompare(timestamp(a))),
      cases = clientFileCases(client.id),
      totalSize = records.reduce((sum, item) => sum + item.size, 0);
    $("#client-files-title").textContent = `Pasta de ${client.name}`;
    $("#client-files-subtitle").textContent =
      `${records.length} ${records.length === 1 ? "PDF armazenado" : "PDFs armazenados"} com índice em financeiro-arquivos.json`;
    $("#client-file-case").innerHTML =
      '<option value="">Geral do cliente</option>' +
      cases
        .map(
          (item) =>
            `<option value="${item.id}">${escapeHtml(item.title)} · ${escapeHtml(item.number)}</option>`,
        )
        .join("");
    $("#file-storage-summary").textContent = records.length
      ? `${fileSize(totalSize)} em PDFs · cada conteúdo é sincronizado separadamente em Base64`
      : "Nenhum arquivo armazenado nesta pasta.";
    $("#client-files-list").innerHTML = records.length
      ? records
          .map((item) => {
            const tags = item.caseIds
                .map((caseId) =>
                  cases.find((caseItem) => caseItem.id === caseId),
                )
                .filter(Boolean),
              availableCases = cases.filter(
                (caseItem) => !item.caseIds.includes(caseItem.id),
              );
            return `<article class="client-file-card">
              <span class="file-icon"><i class="fa-solid fa-file-pdf"></i></span>
              <div class="file-content">
                <strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong>
                <small>${fileSize(item.size)} · ${item.pageCount} ${item.pageCount === 1 ? "página" : "páginas"} · ${date(item.createdAt.slice(0, 10))}</small>
                <div class="file-tags">
                  ${
                    tags.length
                      ? tags
                          .map(
                            (caseItem) =>
                              `<span><i class="fa-solid fa-tag"></i>${escapeHtml(caseItem.title)}<button type="button" data-remove-file-case="${item.id}" data-case-id="${caseItem.id}" title="Remover tag"><i class="fa-solid fa-xmark"></i></button></span>`,
                          )
                          .join("")
                      : '<em>Geral do cliente</em>'
                  }
                  ${
                    availableCases.length
                      ? `<label><i class="fa-solid fa-plus"></i><select data-add-file-case="${item.id}" aria-label="Adicionar tag de caso"><option value="">Adicionar tag</option>${availableCases.map((caseItem) => `<option value="${caseItem.id}">${escapeHtml(caseItem.title)}</option>`).join("")}</select></label>`
                      : ""
                  }
                </div>
              </div>
              <div class="file-actions">
                <button type="button" data-view-file="${item.id}" title="Visualizar PDF"><i class="fa-solid fa-eye"></i></button>
                <button type="button" data-download-file="${item.id}" title="Baixar PDF"><i class="fa-solid fa-download"></i></button>
                <button type="button" data-delete-file="${item.id}" title="Excluir PDF"><i class="fa-solid fa-trash"></i></button>
              </div>
            </article>`;
          })
          .join("")
      : '<div class="file-empty"><i class="fa-regular fa-folder-open"></i><strong>Pasta vazia</strong><p>Selecione um PDF para armazená-lo codificado em Base64.</p></div>';
  }
  async function openClientFiles(clientId) {
    await filesReady;
    const client = data.clients.find((item) => item.id === clientId);
    if (!client) return;
    currentFilesClientId = client.id;
    closeFilePreview();
    $("#client-file-input").value = "";
    renderClientFiles();
    $("#client-files-dialog").showModal();
  }
  async function viewClientFile(id) {
    const item = filesData.files.find((candidate) => candidate.id === id);
    if (!item) return;
    closeFilePreview();
    filePreviewUrl = URL.createObjectURL(await fileBlob(item));
    $("#file-preview-title").textContent = item.name;
    $("#file-preview-detail").textContent =
      `${fileSize(item.size)} · ${item.pageCount} ${item.pageCount === 1 ? "página" : "páginas"}`;
    $("#file-preview-frame").src = filePreviewUrl;
    $("#file-preview").hidden = false;
    $("#file-preview").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function downloadClientFile(id) {
    const item = filesData.files.find((candidate) => candidate.id === id);
    if (!item) return;
    const url = URL.createObjectURL(await fileBlob(item)),
      link = document.createElement("a");
    link.href = url;
    link.download = item.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function changeFileCase(id, caseId, remove = false) {
    const item = filesData.files.find((candidate) => candidate.id === id),
      validCase = data.cases.some(
        (candidate) =>
          candidate.id === caseId && candidate.clientId === item?.clientId,
      );
    if (!item || (!remove && !validCase)) return;
    const caseIds = remove
      ? item.caseIds.filter((candidate) => candidate !== caseId)
      : [...new Set([...item.caseIds, caseId])];
    await persistFiles({
      ...filesData,
      files: filesData.files.map((candidate) =>
        candidate.id === id
          ? { ...candidate, caseIds, updatedAt: now() }
          : candidate,
      ),
    });
    toast(remove ? "Tag removida do arquivo." : "Tag adicionada ao arquivo.");
  }
  async function deleteClientFile(id) {
    const item = filesData.files.find((candidate) => candidate.id === id);
    if (
      !item ||
      !(await askConfirmation({
        title: "Excluir PDF?",
        message: `Você está prestes a excluir “${item.name}”.`,
        impact:
          "O conteúdo será removido deste navegador e deixará de aparecer no índice sincronizado. O payload remoto é preservado como medida de recuperação.",
      }))
    )
      return;
    closeFilePreview();
    await persistFiles({
      ...filesData,
      files: filesData.files.filter((candidate) => candidate.id !== id),
      deletedFiles: [
        ...filesData.deletedFiles.filter(
          (candidate) => candidate.id !== item.id,
        ),
        { id: item.id, deletedAt: now() },
      ],
    });
    await removeFileContent(item.id);
    toast("PDF excluído da pasta do cliente.");
  }
  function renderPackages() {
    const grid = $("#packages-grid");
    if (!grid) return;
    $("#package-count").textContent =
      `${data.packages.length} ${data.packages.length === 1 ? "pacote" : "pacotes"}`;
    grid.innerHTML = data.packages.length
      ? data.packages
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
          .map((item) => {
            const stats = packageStats(item.id),
              cases = data.cases.filter(
                (caseItem) => caseItem.packageId === item.id,
              );
            return `<article class="package-card"><header><div><h3>${item.name}</h3><p>${clientName(item.clientId)} · ${agreementLabel(item.agreement)}</p></div><span><button class="link-btn" data-view-package="${item.id}" title="Visualizar pacote"><i class="fa-solid fa-eye"></i></button><button class="link-btn" data-edit-package="${item.id}" title="Editar pacote"><i class="fa-solid fa-pen"></i></button></span></header><div class="package-values"><span><small>Contratado</small><strong>${money(stats.contracted)}</strong></span><span><small>Recebido</small><strong>${money(stats.received)}</strong></span><span class="balance"><small>Saldo</small><strong>${money(stats.balance)}</strong></span></div><div class="package-cases"><i class="fa-solid fa-folder-tree"></i>${cases.length} ${cases.length === 1 ? "caso vinculado" : "casos vinculados"}</div></article>`;
          })
          .join("")
      : '<p class="detail-empty">Nenhum pacote cadastrado. Crie um pacote para compartilhar a mesma contratação entre vários casos.</p>';
  }
  function renderCases() {
    const q = $("#case-search")?.value.toLowerCase() || "",
      status = $("#case-status-filter")?.value || "",
      filterPerson = data.team.find((p) => p.id === caseTeamFilterId),
      filterBox = $("#case-team-filter");
    if (caseTeamFilterId && !filterPerson) caseTeamFilterId = "";
    filterBox.hidden = !filterPerson;
    filterBox.innerHTML = filterPerson
      ? `<span><i class="fa-solid fa-user-tie"></i> Exibindo apenas os casos de <strong>${filterPerson.name}</strong></span><button type="button" data-clear-team-cases><i class="fa-solid fa-xmark"></i> Limpar filtro</button>`
      : "";
    const cases = data.cases.filter(
      (item) =>
        (!filterPerson ||
          item.assignments.some(
            (entry) => entry.personId === filterPerson.id,
          )) &&
        (!status || item.status === status) &&
        `${item.number} ${item.title} ${item.area} ${clientName(item.clientId)} ${item.assignments.map((entry) => teamName(entry.personId)).join(" ")}`
          .toLowerCase()
          .includes(q),
    );
    $("#cases-grid").innerHTML = cases.length
      ? cases
          .map((item) => {
            const client = data.clients.find(
                (entry) => entry.id === item.clientId,
              ),
              lead = item.assignments.find((entry) => entry.isLead),
              teamShare = item.assignments.reduce(
                (sum, entry) => sum + Number(entry.sharePercent || 0),
                0,
              ),
              ownEntries = data.entries.filter(
                (entry) => entry.caseId === item.id && entry.kind === "income",
              ),
              ownReceived = ownEntries.reduce(
                (sum, entry) => sum + realizedAmountOf(entry),
                0,
              ),
              packageItem = findPackage(item.clientId, item.packageId),
              packageSummary = packageItem
                ? packageStats(packageItem.id)
                : null,
              contracted =
                item.contractScope === "own"
                  ? fixedTotal(item.agreement)
                  : packageSummary?.contracted || 0,
              received = packageSummary?.received ?? ownReceived,
              balance = Math.max(0, contracted - received),
              settled = contracted > 0 && balance < 0.005,
              successAgreement = packageItem?.agreement || item.agreement,
              success = ["success", "mixed"].includes(successAgreement.mode),
              statusClass = settled ? " complete" : "",
              statusIcon =
                item.contractScope === "package"
                  ? "fa-layer-group"
                  : settled
                    ? "fa-circle-check"
                    : "fa-file-invoice-dollar",
              statusTitle = packageItem
                ? `Pacote · ${packageItem.name}`
                : item.contractScope === "package"
                  ? "Pacote não encontrado"
                  : item.contractScope === "own"
                    ? agreementLabel(item.agreement)
                    : "Contratação não informada",
              packageCases = packageItem
                ? data.cases.filter(
                    (entry) => entry.packageId === packageItem.id,
                  ).length
                : 0,
              statusText = packageItem
                ? `${money(received)} recebidos em conjunto · saldo ${money(balance)} · ${packageCases} caso(s)`
                : contracted
                  ? `${money(received)} de ${money(contracted)} recebidos · saldo ${money(balance)}${success ? ` · êxito de ${successAgreement.successRate}% à parte` : ""}`
                  : `${money(ownReceived)} recebido neste caso`;
            return `<article class="client-card case-card"><header><span class="case-type"><i class="fa-solid ${item.type === "judicial" ? "fa-scale-balanced" : item.type === "consulting" ? "fa-comments" : "fa-folder"}"></i>${item.area}</span><span><button class="link-btn" data-view-case="${item.id}" title="Visualizar caso"><i class="fa-solid fa-eye"></i></button><button class="link-btn" data-manage-team="${item.clientId}:${item.id}" title="Equipe do caso"><i class="fa-solid fa-user-group"></i></button><button class="link-btn" data-edit-case="${item.clientId}:${item.id}" title="Editar caso"><i class="fa-solid fa-pen"></i></button></span></header><h3>${item.title}</h3><p>${item.number}</p><a class="case-client-link" data-show-client="${item.clientId}" href="#clients"><i class="fa-solid fa-user"></i>${client?.name || "Cliente não encontrado"}</a><div class="package-line${statusClass}"><i class="fa-solid ${statusIcon}"></i><span><strong>${statusTitle}</strong><small>${statusText}</small></span></div><div class="case-team-summary"><span><i class="fa-solid fa-user-tie"></i>${lead ? teamName(lead.personId) : "Sem responsável principal"}</span><strong>${item.assignments.length} pessoa(s) · ${teamShare}%</strong></div></article>`;
          })
          .join("")
      : '<div class="panel empty">Nenhum caso encontrado para os filtros selecionados.</div>';
  }
  function teamName(id) {
    return id
      ? data.team.find((p) => p.id === id)?.name || "Pessoa não encontrada"
      : "Não informado";
  }
  function roleLabel(role) {
    return (
      {
        partner: "Sócio(a)",
        lawyer: "Advogado(a)",
        associate: "Associado(a)",
        intern: "Estagiário(a)",
        administrative: "Administrativo",
        correspondent: "Correspondente",
        contractor: "Prestador(a)",
        other: "Outro",
      }[role] || role
    );
  }
  function assignmentRoleLabel(role) {
    return (
      {
        lead: "Responsável principal",
        lawyer: "Advogado no caso",
        support: "Apoio jurídico",
        hearing: "Audiências",
        correspondent: "Correspondente",
        administrative: "Apoio administrativo",
        other: "Outra atuação",
      }[role] || "Atuação não informada"
    );
  }
  function personCases(id) {
    return data.cases
      .map((x) => ({
        client: data.clients.find((c) => c.id === x.clientId),
        caseItem: x,
        assignment: (x.assignments || []).find((v) => v.personId === id),
      }))
      .filter((x) => x.assignment);
  }
  function renderTeam() {
    const q = $("#team-search")?.value.toLowerCase() || "",
      status = $("#team-status")?.value || "";
    const people = data.team.filter(
      (p) =>
        (!status || p.status === status) &&
        `${p.name} ${p.registration} ${p.specialties} ${roleLabel(p.role)}`
          .toLowerCase()
          .includes(q),
    );
    $("#team-grid").innerHTML = people.length
      ? people
          .map((p) => {
            const cases = personCases(p.id),
              expected = data.entries
                .filter((e) => e.kind === "income" && realizedAmountOf(e) > 0)
                .reduce(
                  (sum, entry) =>
                    sum +
                    (entry.allocations || [])
                      .filter((allocation) => allocation.personId === p.id)
                      .reduce(
                        (allocationSum, allocation) =>
                          allocationSum +
                          (realizedAmountOf(entry) *
                            Number(allocation.percent || 0)) /
                            100,
                        0,
                      ),
                  0,
                ),
              leadCount = cases.filter((x) => x.assignment.isLead).length;
            return `<article class="client-card team-card"><header><span class="avatar"><i class="fa-solid ${p.role === "lawyer" || p.role === "partner" || p.role === "associate" ? "fa-scale-balanced" : "fa-user"}"></i></span><span><button class="link-btn" data-view-team="${p.id}" title="Visualizar pessoa"><i class="fa-solid fa-eye"></i></button><button class="link-btn" data-edit-team="${p.id}" title="Editar pessoa"><i class="fa-solid fa-pen"></i></button></span></header><h3>${p.name}</h3><p>${roleLabel(p.role)}${p.registration ? ` · ${p.registration}` : ""}</p><div class="team-stats"><span><strong>${cases.length}</strong><small>casos</small></span><span><strong>${leadCount}</strong><small>responsável</small></span><span><strong>${money(expected)}</strong><small>participação registrada</small></span></div><button class="team-cases-btn" type="button" ${cases.length ? `data-show-team-cases="${p.id}"` : "disabled"}><i class="fa-solid ${cases.length ? "fa-folder-open" : "fa-folder"}"></i><span><strong>${cases.length ? "Ver casos e processos" : "Nenhum caso atribuído"}</strong><small>${cases.length ? `${cases.length} ${cases.length === 1 ? "vínculo" : "vínculos"} · ${leadCount} como responsável` : "Cadastre a pessoa na equipe de um caso"}</small></span>${cases.length ? '<i class="fa-solid fa-chevron-right"></i>' : ""}</button></article>`;
          })
          .join("")
      : '<div class="panel empty">Nenhuma pessoa encontrada.</div>';
  }
  function renderCharges() {
    const configured = Boolean(mp.apiUrl);
    $("#mp-alert").innerHTML = configured
      ? `<div class="integration-alert success"><i class="fa-solid fa-circle-check"></i><div><strong>Integração configurada em ${mp.environment === "production" ? "produção" : "testes"}</strong><p>As preferências são criadas pelo serviço seguro, sem expor o Access Token.</p></div></div>`
      : `<div class="integration-alert"><i class="fa-solid fa-triangle-exclamation"></i><div><strong>Configure o serviço seguro antes de cobrar</strong><p>Informe a URL do backend e as opções públicas no painel “Configurar conta”.</p></div></div>`;
    const charges = data.charges || [],
      paid = charges
        .filter((c) => c.status === "approved")
        .reduce((s, c) => s + c.amount, 0),
      open = charges
        .filter((c) => !["approved", "cancelled"].includes(c.status))
        .reduce((s, c) => s + c.amount, 0);
    $("#charge-metrics").innerHTML =
      metric(
        "fa-link",
        "Links gerados",
        String(charges.length),
        "Histórico completo",
      ) +
      metric(
        "fa-hourglass-half",
        "Aguardando",
        money(open),
        "Cobranças abertas",
      ) +
      metric(
        "fa-circle-check",
        "Confirmado",
        money(paid),
        "Pagamentos identificados",
      ) +
      metric(
        "fa-plug-circle-check",
        "Ambiente",
        mp.environment === "production" ? "Produção" : "Testes",
        configured ? "Serviço configurado" : "Configuração pendente",
      );
    const labels = {
      pending: "Aguardando",
      approved: "Aprovado",
      cancelled: "Cancelado",
      expired: "Expirado",
    };
    $("#charges-table").innerHTML = charges.length
      ? charges
          .slice()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map(
            (c) =>
              `<tr><td>${date(c.createdAt.slice(0, 10))}</td><td><strong>${c.description}</strong><br><small>${c.preferenceId || c.externalReference}</small></td><td>${clientName(c.clientId)}</td><td><span class="badge ${c.status === "approved" ? "paid" : "pending"}">${labels[c.status] || c.status}</span></td><td class="money amount income">${money(c.amount)}</td><td class="charge-actions">${c.checkoutUrl ? `<a href="${c.checkoutUrl}" target="_blank" rel="noopener" title="Abrir cobrança"><i class="fa-solid fa-arrow-up-right-from-square"></i></a><button data-copy-charge="${c.id}" title="Copiar link"><i class="fa-solid fa-copy"></i></button>` : ""}<button data-refresh-charge="${c.id}" title="Consultar status"><i class="fa-solid fa-rotate"></i></button><button data-delete-charge="${c.id}" title="Remover"><i class="fa-solid fa-trash"></i></button></td></tr>`,
          )
          .join("")
      : '<tr><td colspan="6" class="empty">Nenhuma cobrança gerada.</td></tr>';
  }
  function openMpSettings() {
    const f = $("#mp-settings-form");
    Object.entries(mp).forEach(([k, v]) => {
      if (!f.elements[k]) return;
      if (f.elements[k].type === "checkbox") f.elements[k].checked = Boolean(v);
      else f.elements[k].value = v;
    });
    $("#mp-settings-dialog").showModal();
  }
  function openCharge() {
    if (!mp.apiUrl) {
      openMpSettings();
      return toast("Configure o serviço seguro antes de gerar cobranças.");
    }
    const pending = data.entries.filter(
        (e) => e.kind === "income" && statusOf(e) !== "paid",
      ),
      f = $("#charge-form");
    f.reset();
    f.entryId.innerHTML = pending.length
      ? pending
          .map(
            (e) =>
              `<option value="${e.id}">${clientName(e.clientId)} — ${e.description} (saldo ${money(remainingAmountOf(e))})</option>`,
          )
          .join("")
      : '<option value="">Nenhum recebível pendente</option>';
    if (pending[0]) fillChargeFromEntry(pending[0].id);
    $("#charge-dialog").showModal();
  }
  function fillChargeFromEntry(id) {
    const e = data.entries.find((x) => x.id === id),
      f = $("#charge-form");
    if (!e) return;
    const c = data.clients.find((x) => x.id === e.clientId);
    f.amount.value = remainingAmountOf(e).toFixed(2).replace(".", ",");
    f.expiresAt.value = e.dueDate;
    f.description.value = e.description;
    f.payerName.value = c?.name || "";
    f.payerEmail.value = c?.email || "";
    f.externalReference.value = `FIN-${e.id}`;
  }
  async function mpRequest(path, options = {}) {
    const base = mp.apiUrl.replace(/\/$/, "");
    const r = await fetch(`${base}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok)
      throw new Error(
        body.message ||
          body.error ||
          `Falha no serviço de cobrança (${r.status})`,
      );
    return body;
  }
  async function createCharge(payload) {
    return mpRequest("/preferences", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        returnUrl: mp.returnUrl,
        statementDescriptor: mp.statementDescriptor,
        autoReturn: mp.autoReturn,
        environment: mp.environment,
      }),
    });
  }
  async function refreshCharge(id) {
    const c = data.charges.find((x) => x.id === id);
    if (!c?.preferenceId) return;
    const wasApproved = c.status === "approved";
    const result = await mpRequest(
      `/preferences/${encodeURIComponent(c.preferenceId)}?external_reference=${encodeURIComponent(c.externalReference)}`,
    );
    c.status = result.status || c.status;
    c.paymentId = result.paymentId || c.paymentId;
    c.updatedAt = now();
    if (c.status === "approved" && !wasApproved) {
      const e = data.entries.find((x) => x.id === c.entryId);
      if (e) {
        e.paidAmount = Math.min(
          Number(e.amount || 0),
          realizedAmountOf(e) + Number(c.amount || 0),
        );
        e.status =
          e.paidAmount >= Number(e.amount || 0) ? "paid" : "partial";
        e.paidDate = result.paidDate?.slice(0, 10) || iso();
        e.method = "Mercado Pago";
        e.updatedAt = now();
      }
    }
    persist();
    toast(
      c.status === "approved" ? "Pagamento confirmado." : "Status atualizado.",
    );
  }
  function renderReports() {
    const paid = data.entries.filter((e) => realizedAmountOf(e) > 0),
      t = totals(paid),
      margin = t.incomePaid
        ? ((t.incomePaid - t.expensePaid) / t.incomePaid) * 100
        : 0;
    $("#report-metrics").innerHTML =
      metric(
        "fa-sack-dollar",
        "Recebido total",
        money(t.incomePaid),
        "Histórico completo",
      ) +
      metric(
        "fa-receipt",
        "Pago total",
        money(t.expensePaid),
        "Histórico completo",
      ) +
      metric(
        "fa-scale-balanced",
        "Resultado",
        money(t.incomePaid - t.expensePaid),
        "Entradas menos saídas",
      ) +
      metric(
        "fa-percent",
        "Margem",
        `${margin.toFixed(1).replace(".", ",")}%`,
        "Sobre receitas realizadas",
      );
    const accounts = {};
    paid.forEach(
      (e) =>
        (accounts[e.account] =
          (accounts[e.account] || 0) +
          (e.kind === "income"
            ? realizedAmountOf(e)
            : -realizedAmountOf(e))),
    );
    $("#accounts-report").innerHTML =
      Object.entries(accounts)
        .map(
          ([k, v]) =>
            `<div class="row-item"><strong>${k}</strong><span class="amount ${v >= 0 ? "income" : "expense"}">${money(v)}</span></div>`,
        )
        .join("") || '<div class="empty">Sem movimentação.</div>';
    const debts = {};
    data.entries
      .filter(
        (e) =>
          e.kind === "income" &&
          e.dueDate < iso() &&
          remainingAmountOf(e) > 0,
      )
      .forEach(
        (e) =>
          (debts[e.clientId] =
            (debts[e.clientId] || 0) + remainingAmountOf(e)),
      );
    $("#delinquency-report").innerHTML =
      Object.entries(debts)
        .sort((a, b) => b[1] - a[1])
        .map(
          ([id, v]) =>
            `<div class="row-item"><strong>${clientName(id)}</strong><span class="amount expense">${money(v)}</span></div>`,
        )
        .join("") || '<div class="empty">Nenhuma inadimplência.</div>';
  }
  function showView(v) {
    $$(".view").forEach((x) =>
      x.classList.toggle("active", x.id === `${v}-view`),
    );
    $$("#nav button").forEach((x) =>
      x.classList.toggle("active", x.dataset.view === v),
    );
    location.hash = v;
  }
  function showTeamCases(id) {
    if (!data.team.some((p) => p.id === id)) return;
    caseTeamFilterId = id;
    $("#case-search").value = "";
    $("#case-status-filter").value = "";
    if ($("#detail-dialog").open) $("#detail-dialog").close();
    showView("cases");
    renderCases();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function fillCategories(kind, selected = "") {
    const s = $("#entry-form [name=category]"),
      cats = kind === "income" ? incomeCats : expenseCats;
    s.innerHTML = cats
      .map((c) => `<option ${c === selected ? "selected" : ""}>${c}</option>`)
      .join("");
  }
  function agreementEditorMarkup() {
    return `<div class="agreement-heading"><div><strong>Condições financeiras</strong><small>Os vencimentos fixos serão incluídos automaticamente nos lançamentos.</small></div><span class="agreement-summary" data-agreement-summary>Selecione a modalidade</span></div><div class="agreement-grid"><label class="span-2">Modalidade<select data-agreement-field="mode"><option value="">Selecione</option><option value="cash">Valor à vista</option><option value="installments">Entrada e parcelas</option><option value="monthly">Mensalidades</option><option value="stages">Pagamento por etapas</option><option value="success">Somente êxito</option><option value="mixed">Parte fixa e êxito</option><option value="custom">Condição personalizada</option></select></label><label class="span-2" data-agreement-block="mixed">Forma da parte fixa<select data-agreement-field="fixedMode"><option value="">Selecione</option><option value="cash">Valor à vista</option><option value="installments">Entrada e parcelas</option><option value="monthly">Mensalidades</option><option value="stages">Pagamento por etapas</option></select></label><label data-agreement-block="total">Valor total (R$)<input data-agreement-field="totalAmount" inputmode="decimal" placeholder="0,00"></label><label data-agreement-block="cash">Vencimento<input data-agreement-field="cashDueDate" type="date"></label><div class="agreement-block span-2" data-agreement-block="installments"><div class="agreement-grid"><label>Entrada (R$)<input data-agreement-field="downPaymentAmount" inputmode="decimal" placeholder="0,00"></label><label>Vencimento da entrada<input data-agreement-field="downPaymentDueDate" type="date"></label><label>Quantidade de parcelas<input data-agreement-field="installmentCount" type="number" min="1" step="1"></label><label>Vencimento da 1ª parcela<input data-agreement-field="firstInstallmentDueDate" type="date"></label></div></div><div class="agreement-block span-2" data-agreement-block="monthly"><div class="agreement-grid"><label>Valor mensal (R$)<input data-agreement-field="monthlyAmount" inputmode="decimal" placeholder="0,00"></label><label>Quantidade de mensalidades<input data-agreement-field="monthlyCount" type="number" min="1" step="1"></label><label>Vencimento da 1ª mensalidade<input data-agreement-field="firstMonthlyDueDate" type="date"></label></div></div><div class="agreement-block span-2" data-agreement-block="stages"><div class="stage-heading"><strong>Etapas contratadas</strong><button class="btn ghost compact" type="button" data-add-stage><i class="fa-solid fa-plus"></i> Adicionar etapa</button></div><div class="stage-list" data-stage-list></div></div><div class="agreement-block span-2" data-agreement-block="success"><div class="agreement-grid"><label>Percentual de êxito (%)<input data-agreement-field="successRate" inputmode="decimal" placeholder="0"></label><label>Base de cálculo<input data-agreement-field="successBase" placeholder="Ex.: proveito econômico bruto"></label><label class="span-2">Condição de exigibilidade<textarea data-agreement-field="successCondition" rows="2" placeholder="Ex.: após o efetivo recebimento pelo cliente"></textarea></label></div></div><label class="span-2" data-agreement-block="custom">Condições personalizadas<textarea data-agreement-field="customTerms" rows="4" placeholder="Descreva valores, eventos e vencimentos aplicáveis"></textarea></label></div>`;
  }
  function agreementField(root, name) {
    return root.querySelector(`[data-agreement-field="${name}"]`);
  }
  function addStageRow(root, stage = {}) {
    const row = document.createElement("div");
    row.className = "stage-row";
    row.dataset.stageId = stage.id || uid();
    row.innerHTML = `<input data-stage-field="description" value="${stage.description || ""}" placeholder="Descrição da etapa"><input data-stage-field="amount" value="${stage.amount || ""}" inputmode="decimal" placeholder="Valor (R$)"><input data-stage-field="dueDate" value="${stage.dueDate || ""}" type="date"><button class="icon-btn dark" type="button" data-remove-stage title="Remover etapa"><i class="fa-solid fa-trash"></i></button>`;
    root.querySelector("[data-stage-list]").appendChild(row);
  }
  function readAgreementEditor(root) {
    const value = (name) => agreementField(root, name)?.value || "";
    return normalizeAgreement({
      mode: value("mode"),
      fixedMode: value("fixedMode"),
      totalAmount: num(value("totalAmount")) || "",
      cashDueDate: value("cashDueDate"),
      downPaymentAmount:
        value("downPaymentAmount") === ""
          ? ""
          : num(value("downPaymentAmount")),
      downPaymentDueDate: value("downPaymentDueDate"),
      installmentCount: value("installmentCount"),
      firstInstallmentDueDate: value("firstInstallmentDueDate"),
      monthlyAmount: num(value("monthlyAmount")) || "",
      monthlyCount: value("monthlyCount"),
      firstMonthlyDueDate: value("firstMonthlyDueDate"),
      stages: [...root.querySelectorAll(".stage-row")].map((row) => ({
        id: row.dataset.stageId,
        description: row.querySelector('[data-stage-field="description"]')
          .value,
        amount:
          num(row.querySelector('[data-stage-field="amount"]').value) || "",
        dueDate: row.querySelector('[data-stage-field="dueDate"]').value,
      })),
      successRate: num(value("successRate")) || "",
      successBase: value("successBase"),
      successCondition: value("successCondition"),
      customTerms: value("customTerms"),
    });
  }
  function updateAgreementEditor(root) {
    const agreement = readAgreementEditor(root),
      fixedMode = fixedModeOf(agreement),
      visible = {
        mixed: agreement.mode === "mixed",
        total: ["cash", "installments"].includes(fixedMode),
        cash: fixedMode === "cash",
        installments: fixedMode === "installments",
        monthly: fixedMode === "monthly",
        stages: fixedMode === "stages",
        success: ["success", "mixed"].includes(agreement.mode),
        custom: agreement.mode === "custom",
      };
    root.querySelectorAll("[data-agreement-block]").forEach((block) => {
      block.hidden = !visible[block.dataset.agreementBlock];
    });
    const summary = root.querySelector("[data-agreement-summary]"),
      errors = validateAgreement(agreement),
      schedule = errors.length ? [] : buildSchedule(agreement);
    summary.classList.toggle("warn", Boolean(agreement.mode && errors.length));
    summary.textContent = !agreement.mode
      ? "Selecione a modalidade"
      : errors.length
        ? errors[0]
        : schedule.length
          ? `${schedule.length} recebível(is) · ${money(fixedTotal(agreement))}`
          : agreement.mode === "success"
            ? `Êxito de ${agreement.successRate}%`
            : "Condição registrada sem vencimento automático";
  }
  function fillAgreementEditor(root, raw) {
    const agreement = normalizeAgreement(raw);
    root.querySelectorAll("[data-agreement-field]").forEach((field) => {
      field.value = agreement[field.dataset.agreementField] ?? "";
    });
    root.querySelector("[data-stage-list]").innerHTML = "";
    agreement.stages.forEach((stage) => addStageRow(root, stage));
    updateAgreementEditor(root);
  }
  function setupAgreementEditor(root) {
    root.innerHTML = agreementEditorMarkup();
    root.addEventListener("input", () => updateAgreementEditor(root));
    root.addEventListener("change", () => updateAgreementEditor(root));
    root.addEventListener("click", (event) => {
      if (event.target.closest("[data-add-stage]")) addStageRow(root);
      const remove = event.target.closest("[data-remove-stage]");
      if (remove) remove.closest(".stage-row").remove();
      updateAgreementEditor(root);
    });
    fillAgreementEditor(root, blankAgreement());
  }
  function clearPendingContractEntries(source, id) {
    const deletedAt = now();
    data.entries = data.entries.filter((entry) => {
      const remove =
        entry.contractSource === source &&
        entry.contractId === id &&
        realizedAmountOf(entry) === 0;
      if (remove) markDeleted("deletedEntries", entry.id, deletedAt);
      return !remove;
    });
  }
  function syncContractEntries({
    source,
    id,
    clientId,
    caseId = "",
    packageId = "",
    title,
    agreement,
  }) {
    const schedule = buildSchedule(agreement),
      existing = data.entries.filter(
        (entry) => entry.contractSource === source && entry.contractId === id,
      ),
      byItem = new Map(existing.map((entry) => [entry.scheduleItemId, entry])),
      currentIds = new Set(schedule.map((item) => item.id)),
      updatedAt = now();
    schedule.forEach((item) => {
      const old = byItem.get(item.id),
        hasRealization = old && realizedAmountOf(old) > 0,
        entry = hasRealization
          ? old
          : {
              ...old,
              id: old?.id || uid(),
              kind: "income",
              category: item.category,
              description: `${item.description} · ${title}`,
              amount: item.amount,
              paidAmount: 0,
              dueDate: item.dueDate,
              status: "pending",
              paidDate: "",
              clientId,
              caseId,
              packageId,
              billingScope: packageId ? "package" : "case",
              allocations: caseId ? buildAllocations(caseId, item.amount) : [],
              account: old?.account || "Conta corrente",
              method: old?.method || "PIX",
              notes:
                old?.notes ||
                "Recebível gerado pelas condições da contratação.",
              contractSource: source,
              contractId: id,
              scheduleItemId: item.id,
              createdAt: old?.createdAt || updatedAt,
              updatedAt,
            };
      if (!old) data.entries.push(entry);
      else
        data.entries = data.entries.map((candidate) =>
          candidate.id === old.id ? entry : candidate,
        );
    });
    existing
      .filter(
        (entry) =>
          realizedAmountOf(entry) === 0 &&
          !currentIds.has(entry.scheduleItemId),
      )
      .forEach((entry) => {
        markDeleted("deletedEntries", entry.id, updatedAt);
        data.entries = data.entries.filter(
          (candidate) => candidate.id !== entry.id,
        );
      });
  }
  function fillClientSelects(
    selected = "",
    caseSelected = "",
    packageSelected = "",
  ) {
    const opts =
      '<option value="">Sem vínculo</option>' +
      data.clients
        .map(
          (c) =>
            `<option value="${c.id}" ${c.id === selected ? "selected" : ""}>${c.name}</option>`,
        )
        .join("");
    $("#entry-form [name=clientId]").innerHTML = opts;
    fillCaseSelect(selected, caseSelected);
    fillPackageSelect(selected, packageSelected, "#entry-form");
  }
  function fillCaseSelect(clientId, selected = "") {
    const s = $("#entry-form [name=caseId]");
    s.innerHTML =
      `<option value="">${clientId ? "Nenhum caso" : "Sem vínculo"}</option>` +
      data.cases
        .filter((x) => x.clientId === clientId)
        .map(
          (x) =>
            `<option value="${x.id}" ${x.id === selected ? "selected" : ""}>${x.number} — ${x.title}</option>`,
        )
        .join("");
    s.disabled = !clientId;
  }
  function fillPackageSelect(
    clientId,
    selected = "",
    formSelector = "#case-form",
  ) {
    const s = $(`${formSelector} [name=packageId]`);
    s.innerHTML =
      '<option value="">Selecione o pacote</option>' +
      data.packages
        .filter((item) => item.clientId === clientId)
        .map(
          (item) =>
            `<option value="${item.id}" ${item.id === selected ? "selected" : ""}>${item.name}</option>`,
        )
        .join("");
    s.disabled = !clientId;
  }
  function updateEntryPaymentRequirement() {
    const form = $("#entry-form"),
      paidDate = form.elements.paidDate,
      paidAmount = form.elements.paidAmount,
      status = form.elements.status.value,
      hasPayment = status === "paid" || status === "partial";
    paidDate.required = hasPayment;
    paidAmount.required = status === "partial";
    $("#paid-amount-field").hidden = status !== "partial";
    $("#paid-date-label").textContent = hasPayment
      ? "Data do pagamento *"
      : "Data do pagamento";
    if (!hasPayment) {
      paidDate.value = "";
      paidAmount.value = "";
    }
  }
  function openEntry(id = "") {
    const f = $("#entry-form");
    f.reset();
    f.elements.id.value = id;
    const e = data.entries.find((x) => x.id === id);
    fillCategories(e?.kind || "income", e?.category);
    fillClientSelects(e?.clientId, e?.caseId, e?.packageId);
    if (e)
      Object.entries(e).forEach(([k, v]) => {
        if (f.elements[k]) f.elements[k].value = v;
      });
    else {
      f.elements.dueDate.value = iso();
      f.elements.status.value = "pending";
    }
    updateEntryPaymentRequirement();
    $("#entry-modal-title").textContent = e
      ? "Editar lançamento"
      : "Novo lançamento";
    renderAllocationPreview();
    $("#entry-dialog").showModal();
  }
  function openClient(id = "") {
    const f = $("#client-form");
    f.reset();
    f.elements.id.value = id;
    f.elements.phoneCountry.value = PHONE_DEFAULT_COUNTRY;
    const c = data.clients.find((x) => x.id === id);
    if (c) {
      Object.entries(c).forEach(([k, v]) => {
        if (!f.elements[k]) return;
        if (f.elements[k].type === "checkbox")
          f.elements[k].checked = Boolean(v);
        else f.elements[k].value = v;
      });
      const phone = phoneDetails(c.phone, c.phoneCountry);
      f.elements.phoneCountry.value = phone.country;
      f.elements.phoneNational.value = phone.national;
      f.elements.document.value = maskCpf(c.document);
      f.elements.zip.value = maskZip(c.zip);
      f.elements.state.value = String(c.state || "").toUpperCase();
    }
    syncPhoneField();
    $("#client-modal-title").textContent = c
      ? "Editar cliente"
      : "Novo cliente";
    $("#delete-client").hidden = !c;
    $("#client-dialog").showModal();
  }
  function updateCaseContractFields() {
    const form = $("#case-form"),
      scope = form.elements.contractScope.value,
      clientId = form.elements.clientId.value;
    fillPackageSelect(clientId, form.elements.packageId.value, "#case-form");
    $("#case-package-field").hidden = scope !== "package";
    $("#case-agreement-editor").hidden = scope !== "own";
  }
  function openCase(clientId = "", caseId = "") {
    if (!data.clients.length) {
      showView("clients");
      openClient();
      toast("Cadastre o cliente antes de criar um caso.");
      return;
    }
    const f = $("#case-form");
    f.reset();
    f.elements.id.value = caseId;
    f.elements.clientId.innerHTML =
      '<option value="">Selecione o cliente</option>' +
      data.clients
        .map(
          (c) =>
            `<option value="${c.id}">${c.name} — ${c.document || "sem CPF"}</option>`,
        )
        .join("");
    const item = data.cases.find((x) => x.id === caseId);
    if (item) {
      [
        "clientId",
        "type",
        "area",
        "number",
        "title",
        "status",
        "contractScope",
        "notes",
      ].forEach((name) => {
        f.elements[name].value = item[name] || "";
      });
    } else if (clientId) f.elements.clientId.value = clientId;
    fillPackageSelect(
      f.elements.clientId.value,
      item?.packageId || "",
      "#case-form",
    );
    fillAgreementEditor(
      $("#case-agreement-editor"),
      item?.agreement || blankAgreement(),
    );
    updateCaseContractFields();
    $("#case-modal-title").textContent = item
      ? "Editar processo ou caso"
      : "Novo processo ou caso";
    $("#delete-case").hidden = !item;
    $("#case-dialog").showModal();
  }
  function openPackage(id = "", clientId = "") {
    if (!data.clients.length) {
      showView("clients");
      openClient();
      toast("Cadastre o cliente antes de criar um pacote.");
      return;
    }
    const form = $("#package-form"),
      item = data.packages.find((entry) => entry.id === id);
    form.reset();
    form.elements.id.value = id;
    form.elements.clientId.disabled = Boolean(item);
    form.elements.clientId.innerHTML =
      '<option value="">Selecione o cliente</option>' +
      data.clients
        .map(
          (client) =>
            `<option value="${client.id}">${client.name} — ${client.document || "sem CPF"}</option>`,
        )
        .join("");
    if (item) {
      form.elements.clientId.value = item.clientId;
      form.elements.name.value = item.name;
      form.elements.status.value = item.status;
      form.elements.notes.value = item.notes;
    } else if (clientId) form.elements.clientId.value = clientId;
    fillAgreementEditor(
      $("#package-agreement-editor"),
      item?.agreement || blankAgreement(),
    );
    $("#package-modal-title").textContent = item
      ? "Editar pacote"
      : "Novo pacote";
    $("#delete-package").hidden = !item;
    $("#package-dialog").showModal();
  }
  function openTeamMember(id = "") {
    const f = $("#team-form");
    f.reset();
    f.elements.id.value = id;
    const p = data.team.find((x) => x.id === id);
    if (p) {
      Object.entries(p).forEach(([k, v]) => {
        if (f.elements[k]) f.elements[k].value = v;
      });
      f.elements.document.value = maskDocument(p.document);
      f.elements.phone.value = maskPhone(p.phone);
      f.elements.registration.value = String(
        p.registration || "",
      ).toUpperCase();
    }
    $("#team-modal-title").textContent = p ? "Editar pessoa" : "Nova pessoa";
    $("#delete-team-member").hidden = !p;
    $("#team-dialog").showModal();
  }
  function openAssignments(clientId, caseId) {
    if (!data.team.length) {
      showView("team");
      toast("Cadastre ao menos uma pessoa antes de montar a equipe do caso.");
      return;
    }
    const client = data.clients.find((c) => c.id === clientId),
      item = data.cases.find((x) => x.id === caseId && x.clientId === clientId);
    if (!item) return;
    const f = $("#assignments-form");
    f.elements.clientId.value = clientId;
    f.elements.caseId.value = caseId;
    $("#assignments-subtitle").textContent = `${client.name} · ${item.number}`;
    $("#assignment-rows").innerHTML = "";
    (item.assignments || []).forEach(addAssignmentRow);
    if (!item.assignments?.length) addAssignmentRow();
    updateAllocationSummary();
    $("#assignments-dialog").showModal();
  }
  function addAssignmentRow(value = {}) {
    const row = document.createElement("div");
    row.className = "assignment-row";
    row.innerHTML = `<label>Pessoa<select name="personId" required><option value="">Selecione</option>${data.team
      .filter((p) => p.status === "active" || p.id === value.personId)
      .map(
        (p) =>
          `<option value="${p.id}" ${p.id === value.personId ? "selected" : ""}>${p.name} — ${roleLabel(p.role)}</option>`,
      )
      .join(
        "",
      )}</select></label><label>Atuação<select name="assignmentRole"><option value="lead">Responsável principal</option><option value="lawyer">Advogado no caso</option><option value="support">Apoio jurídico</option><option value="hearing">Audiências</option><option value="correspondent">Correspondente</option><option value="administrative">Apoio administrativo</option><option value="other">Outra</option></select></label><label>Participação (%)<input name="sharePercent" inputmode="decimal" value="${value.sharePercent ?? 0}"></label><label class="lead-check"><input name="isLead" type="checkbox" ${value.isLead ? "checked" : ""}> Responsável</label><label class="assignment-notes">Observação<input name="notes" value="${value.notes || ""}" placeholder="Atuação ou regra de divisão"></label><button class="remove-assignment" type="button" title="Remover"><i class="fa-solid fa-trash"></i></button>`;
    const role = row.querySelector("[name=assignmentRole]"),
      lead = row.querySelector("[name=isLead]");
    role.value = value.assignmentRole || "lawyer";
    role.onchange = () => {
      if (role.value === "lead") lead.checked = true;
      updateAllocationSummary();
    };
    row
      .querySelectorAll("input,select")
      .forEach((x) => x.addEventListener("input", updateAllocationSummary));
    row.querySelector(".remove-assignment").onclick = async () => {
      const person = row.querySelector("[name=personId]"),
        name = person.options[person.selectedIndex]?.text || "esta pessoa";
      if (
        !(await askConfirmation({
          title: "Remover participação?",
          message: `Deseja remover ${name} da equipe deste caso?`,
          impact:
            "A alteração somente será efetivada quando você salvar a equipe do caso.",
          label: "Remover",
        }))
      )
        return;
      row.remove();
      updateAllocationSummary();
    };
    $("#assignment-rows").appendChild(row);
  }
  function assignmentValues() {
    return $$("#assignment-rows .assignment-row")
      .map((row) => ({
        personId: row.querySelector("[name=personId]").value,
        assignmentRole: row.querySelector("[name=assignmentRole]").value,
        sharePercent: num(row.querySelector("[name=sharePercent]").value),
        isLead: row.querySelector("[name=isLead]").checked,
        notes: row.querySelector("[name=notes]").value.trim(),
      }))
      .filter((x) => x.personId);
  }
  function updateAllocationSummary() {
    const values = assignmentValues(),
      total = values.reduce((s, x) => s + x.sharePercent, 0),
      leads = values.filter((x) => x.isLead).length;
    $("#allocation-summary").className =
      `allocation-summary ${total > 100 ? "invalid" : total === 100 ? "complete" : ""}`;
    $("#allocation-summary").innerHTML =
      `<span><i class="fa-solid fa-chart-pie"></i> Participação distribuída</span><strong>${total.toFixed(2).replace(".", ",")}%</strong><small>${leads ? `${leads} responsável(is) principal(is)` : "Nenhum responsável principal definido"}${total > 100 ? " · Reduza para no máximo 100%" : ""}</small>`;
  }
  function detailField(label, value, icon = "fa-circle-info") {
    return `<div class="detail-field"><i class="fa-solid ${icon}"></i><span><small>${label}</small><strong>${value || "Não informado"}</strong></span></div>`;
  }
  function showDetail({ eyebrow, title, subtitle, body, links = "", onEdit }) {
    const dialog = $("#detail-dialog");
    $("#detail-eyebrow").textContent = eyebrow;
    $("#detail-title").textContent = title;
    $("#detail-subtitle").textContent = subtitle || "";
    $("#detail-body").innerHTML = body;
    $("#detail-links").innerHTML = links;
    $("#detail-edit").onclick = () => {
      dialog.close();
      onEdit?.();
    };
    if (!dialog.open) dialog.showModal();
  }
  function viewClient(id) {
    const c = data.clients.find((x) => x.id === id);
    if (!c) return;
    const cases = data.cases.filter((x) => x.clientId === id),
      entries = data.entries.filter((e) => e.clientId === id),
      t = totals(entries),
      address = [
        c.street,
        c.addressNumber,
        c.complement,
        c.neighborhood,
        c.city,
        c.state,
        c.zip,
      ]
        .filter(Boolean)
        .join(", ");
    showDetail({
      eyebrow: "CLIENTE",
      title: c.name,
      subtitle: `CPF ${c.document} · Nascimento ${date(c.birthDate)}`,
      body: `<div class="detail-grid">${detailField("Telefone", displayPhone(c), "fa-phone")}${detailField("E-mail", c.email, "fa-envelope")}${detailField("Profissão", c.profession, "fa-briefcase")}${detailField("Estado civil", c.maritalStatus, "fa-heart")}${detailField("RG", c.rg ? `${c.rg}${c.rgIssuer ? ` · ${c.rgIssuer}` : ""}` : "", "fa-id-card")}${detailField("Endereço", address, "fa-location-dot")}</div>${c.notes ? `<div class="detail-note"><strong>Observações</strong><p>${c.notes}</p></div>` : ""}<div class="detail-section"><header><strong>Casos vinculados</strong><span>${cases.length}</span></header>${cases.map((x) => `<button class="detail-list-row" data-view-case="${x.id}"><span><strong>${x.title}</strong><small>${x.number} · ${x.area}</small></span><i class="fa-solid fa-chevron-right"></i></button>`).join("") || '<p class="detail-empty">Nenhum caso vinculado.</p>'}</div><div class="detail-totals"><span><small>Receitas</small><strong>${money(t.income)}</strong></span><span><small>Recebido</small><strong>${money(t.incomePaid)}</strong></span><span><small>Despesas</small><strong>${money(t.expense)}</strong></span></div>`,
      links: `${c.whatsapp && c.phone ? `<a class="btn whatsapp-btn" href="${waUrl(c.phone, c.phoneCountry)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>` : ""}${c.email ? `<a class="btn ghost" href="mailto:${c.email}"><i class="fa-solid fa-envelope"></i> E-mail</a>` : ""}<button class="btn ghost" type="button" data-new-case="${c.id}"><i class="fa-solid fa-folder-plus"></i> Novo caso</button>`,
      onEdit: () => openClient(id),
    });
  }
  function viewCase(id) {
    const x = data.cases.find((v) => v.id === id);
    if (!x) return;
    const client = data.clients.find((c) => c.id === x.clientId),
      entries = data.entries.filter((e) => e.caseId === id),
      t = totals(entries),
      assignments = x.assignments || [],
      packageItem = findPackage(x.clientId, x.packageId),
      stats = packageItem
        ? packageStats(packageItem.id)
        : {
            contracted: x.contractScope === "own" ? fixedTotal(x.agreement) : 0,
            received: t.incomePaid,
          },
      balance = Math.max(0, stats.contracted - stats.received),
      agreement = packageItem?.agreement || x.agreement,
      financialStatus = packageItem
        ? `${money(stats.received)} recebidos em conjunto · saldo ${money(balance)}`
        : x.contractScope === "own"
          ? `${money(stats.received)} recebidos · saldo ${money(balance)}`
          : "Contratação não informada";
    showDetail({
      eyebrow: "PROCESSO / CASO",
      title: x.title,
      subtitle: `${x.number} · ${x.area} · ${{ active: "Ativo", suspended: "Suspenso", closed: "Encerrado" }[x.status] || x.status}`,
      body: `<div class="detail-grid">${detailField("Cliente", client?.name, "fa-user")}${detailField("Tipo", { judicial: "Judicial", administrative: "Administrativo", extrajudicial: "Extrajudicial", consulting: "Consultivo" }[x.type], "fa-folder")}${detailField("Contratação", packageItem ? `Pacote · ${packageItem.name}` : x.contractScope === "own" ? agreementLabel(agreement) : "Não informada", "fa-file-invoice-dollar")}${detailField("Parte fixa", stats.contracted ? money(stats.contracted) : "Não informada", "fa-coins")}${detailField("Situação financeira", financialStatus, balance < 0.005 && stats.contracted ? "fa-circle-check" : "fa-chart-line")}${detailField("Êxito", ["success", "mixed"].includes(agreement.mode) ? `${agreement.successRate}% · ${agreement.successBase || "base não informada"}` : "Não aplicável", "fa-percent")}${detailField("Responsável", teamName(assignments.find((a) => a.isLead)?.personId), "fa-user-tie")}</div>${x.notes ? `<div class="detail-note"><strong>Observações</strong><p>${x.notes}</p></div>` : ""}<div class="detail-section"><header><strong>Equipe e participações</strong><span>${assignments.reduce((s, a) => s + Number(a.sharePercent || 0), 0)}%</span></header>${assignments.map((a) => `<button class="detail-list-row" data-view-team="${a.personId}"><span><strong>${teamName(a.personId)}${a.isLead ? " · Responsável" : ""}</strong><small>${assignmentRoleLabel(a.assignmentRole)}${a.notes ? ` · ${a.notes}` : ""}</small></span><b>${a.sharePercent || 0}%</b></button>`).join("") || '<p class="detail-empty">Nenhuma pessoa atribuída.</p>'}</div><div class="detail-totals"><span><small>Receitas deste caso</small><strong>${money(t.income)}</strong></span><span><small>Recebido neste caso</small><strong>${money(t.incomePaid)}</strong></span><span><small>Despesas</small><strong>${money(t.expense)}</strong></span></div>`,
      links: `<button class="btn ghost" type="button" data-view-client="${x.clientId}"><i class="fa-solid fa-user"></i> Ver cliente</button><button class="btn ghost" type="button" data-manage-team="${x.clientId}:${x.id}"><i class="fa-solid fa-user-group"></i> Equipe</button>`,
      onEdit: () => openCase(x.clientId, id),
    });
  }
  function viewPackage(id) {
    const item = data.packages.find((candidate) => candidate.id === id);
    if (!item) return;
    const client = data.clients.find(
        (candidate) => candidate.id === item.clientId,
      ),
      cases = data.cases.filter((caseItem) => caseItem.packageId === item.id),
      stats = packageStats(item.id),
      schedule = buildSchedule(item.agreement);
    showDetail({
      eyebrow: "PACOTE DE HONORÁRIOS",
      title: item.name,
      subtitle: `${client?.name || "Cliente não encontrado"} · ${item.status === "closed" ? "Encerrado" : "Ativo"}`,
      body: `<div class="detail-grid">${detailField("Modalidade", agreementLabel(item.agreement), "fa-file-invoice-dollar")}${detailField("Parte fixa", money(stats.contracted), "fa-coins")}${detailField("Recebido em conjunto", money(stats.received), "fa-circle-check")}${detailField("Saldo do pacote", money(stats.balance), "fa-chart-line")}${detailField("Casos vinculados", String(cases.length), "fa-folder-tree")}${detailField("Recebíveis previstos", String(schedule.length), "fa-calendar-check")}</div>${item.notes ? `<div class="detail-note"><strong>Observações</strong><p>${item.notes}</p></div>` : ""}<div class="detail-section"><header><strong>Casos do pacote</strong><span>${cases.length}</span></header>${cases.map((caseItem) => `<button class="detail-list-row" data-view-case="${caseItem.id}"><span><strong>${caseItem.title}</strong><small>${caseItem.number} · ${caseItem.area}</small></span><i class="fa-solid fa-chevron-right"></i></button>`).join("") || '<p class="detail-empty">Nenhum caso vinculado.</p>'}</div>`,
      links: `<button class="btn ghost" type="button" data-view-client="${item.clientId}"><i class="fa-solid fa-user"></i> Ver cliente</button><button class="btn ghost" type="button" data-new-case="${item.clientId}"><i class="fa-solid fa-folder-plus"></i> Novo caso</button>`,
      onEdit: () => openPackage(id),
    });
  }
  function viewTeamMember(id) {
    const p = data.team.find((x) => x.id === id);
    if (!p) return;
    const cases = personCases(id),
      expected = data.entries
        .filter((e) => e.kind === "income" && realizedAmountOf(e) > 0)
        .reduce(
          (sum, entry) =>
            sum +
            (entry.allocations || [])
              .filter((allocation) => allocation.personId === id)
              .reduce(
                (allocationSum, allocation) =>
                  allocationSum +
                  (realizedAmountOf(entry) *
                    Number(allocation.percent || 0)) /
                    100,
                0,
              ),
          0,
        );
    showDetail({
      eyebrow: "EQUIPE",
      title: p.name,
      subtitle: `${roleLabel(p.role)} · ${p.status === "active" ? "Ativo" : "Inativo"} · ${cases.length} ${cases.length === 1 ? "caso" : "casos"}`,
      body: `<div class="detail-grid">${detailField("OAB / registro", p.registration, "fa-id-badge")}${detailField("CPF/CNPJ", p.document, "fa-id-card")}${detailField("Telefone", p.phone, "fa-phone")}${detailField("E-mail", p.email, "fa-envelope")}${detailField("Especialidades", p.specialties, "fa-scale-balanced")}${detailField("Participação registrada", money(expected), "fa-coins")}</div>${p.notes ? `<div class="detail-note"><strong>Observações</strong><p>${p.notes}</p></div>` : ""}`,
      links: `${cases.length ? `<button class="btn ghost" type="button" data-show-team-cases="${p.id}"><i class="fa-solid fa-folder-open"></i> Ver casos e processos</button>` : ""}${p.phone ? `<a class="btn ghost" href="tel:${String(p.phone).replace(/[^\d+]/g, "")}"><i class="fa-solid fa-phone"></i> Ligar</a>` : ""}${p.email ? `<a class="btn ghost" href="mailto:${p.email}"><i class="fa-solid fa-envelope"></i> E-mail</a>` : ""}`,
      onEdit: () => openTeamMember(id),
    });
  }
  function viewEntry(id) {
    const e = data.entries.find((x) => x.id === id);
    if (!e) return;
    const labels = {
        paid: "Realizado",
        partial: "Parcialmente realizado",
        pending: "Pendente",
        overdue: "Em atraso",
      },
      allocations = e.allocations || [],
      total = allocations.reduce((s, a) => s + Number(a.percent || 0), 0);
    showDetail({
      eyebrow: e.kind === "income" ? "RECEITA" : "DESPESA",
      title: e.description,
      subtitle: `${e.category} · ${labels[statusOf(e)]}`,
      body: `<div class="detail-grid">${detailField("Valor previsto", money(e.amount), "fa-coins")}${detailField("Valor realizado", money(realizedAmountOf(e)), "fa-circle-check")}${detailField("Saldo restante", money(remainingAmountOf(e)), "fa-hourglass-half")}${detailField("Vencimento", date(e.dueDate), "fa-calendar")}${detailField("Data da realização", date(e.paidDate), "fa-circle-check")}${detailField("Cliente", clientName(e.clientId), "fa-user")}${detailField("Vinculação", caseName(e), "fa-folder")}${detailField("Conta e forma", `${e.account} · ${e.method}`, "fa-building-columns")}</div>${allocations.length ? `<div class="detail-section"><header><strong>Distribuição prevista</strong><span>${total}%</span></header>${allocations.map((a) => `<button class="detail-list-row" data-view-team="${a.personId}"><span><strong>${a.personName || teamName(a.personId)}</strong><small>${a.isLead ? "Responsável principal · " : ""}${assignmentRoleLabel(a.assignmentRole)}</small></span><b>${a.percent}% · ${money(a.amount)}</b></button>`).join("")}<div class="office-margin"><span>Parcela do escritório</span><strong>${100 - total}% · ${money(e.amount - allocations.reduce((s, a) => s + Number(a.amount || 0), 0))}</strong></div></div>` : ""}${e.notes ? `<div class="detail-note"><strong>Observações</strong><p>${e.notes}</p></div>` : ""}`,
      links: e.clientId
        ? `<button class="btn ghost" type="button" data-view-client="${e.clientId}"><i class="fa-solid fa-user"></i> Ver cliente</button>`
        : "",
      onEdit: () => openEntry(id),
    });
  }
  let toastTimer = null,
    toastHideTimer = null;
  function closeToast(t) {
    t.classList.remove("show");
    clearTimeout(toastHideTimer);
    toastHideTimer = setTimeout(() => {
      if (
        typeof t.hidePopover === "function" &&
        t.matches(":popover-open") &&
        !t.classList.contains("show")
      )
        t.hidePopover();
    }, 220);
  }
  function toast(msg) {
    const t = $("#toast");
    clearTimeout(toastTimer);
    clearTimeout(toastHideTimer);
    t.textContent = msg;
    if (typeof t.showPopover === "function") {
      if (t.matches(":popover-open")) t.hidePopover();
      t.showPopover();
    } else {
      const dialogs = $$(`dialog[open]`),
        topDialog = dialogs.at(-1);
      if (topDialog && t.parentElement !== topDialog) topDialog.appendChild(t);
      else if (!topDialog && t.parentElement !== document.body)
        document.body.appendChild(t);
    }
    requestAnimationFrame(() => t.classList.add("show"));
    toastTimer = setTimeout(() => closeToast(t), 2600);
  }
  let confirmResolver = null;
  function askConfirmation({
    title,
    message,
    impact = "",
    label = "Excluir",
    cancelLabel = "Cancelar",
    icon = "fa-trash",
    tone = "danger",
  }) {
    const dialog = $("#confirm-dialog"),
      impactBox = $("#confirm-impact"),
      action = $("#confirm-action"),
      cancel = $("#confirm-cancel");
    $("#confirm-title").textContent = title;
    $("#confirm-message").textContent = message;
    impactBox.textContent = impact;
    impactBox.hidden = !impact;
    action.className = `btn ${tone}`;
    action.innerHTML = `<i class="fa-solid ${icon}"></i> ${label}`;
    cancel.textContent = cancelLabel;
    dialog.returnValue = "cancel";
    dialog.showModal();
    return new Promise((resolve) => (confirmResolver = resolve));
  }
  $("#confirm-dialog").addEventListener("close", (e) => {
    if (!confirmResolver) return;
    const resolve = confirmResolver;
    confirmResolver = null;
    resolve(e.currentTarget.returnValue === "confirm");
  });
  async function api(path, opts = {}) {
    const r = await fetch(`https://api.github.com${path}`, {
      ...opts,
      headers: {
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.token}`,
        ...opts.headers,
      },
    });
    if (!r.ok)
      throw new Error(
        (await r.json().catch(() => ({}))).message ||
          `Falha no GitHub (${r.status})`,
      );
    return r.json();
  }
  async function fetchGistFiles() {
    refreshGistCredentials();
    if (!settings.gistId || !settings.token)
      throw new Error("Configure o Gist nas Configurações do OfficeJur.");
    const gist = await api(`/gists/${encodeURIComponent(settings.gistId)}`);
    return {
      gist,
      dataFile: gist.files?.[FILE],
      filesFile: gist.files?.[FILES_FILE],
      legacyFilesFile: gist.files?.[LEGACY_FILES_BACKUP],
    };
  }
  async function readGistText(file, missingMessage) {
    if (!file) throw new Error("Arquivo JSON não encontrado.");
    let content;
    if (!file.truncated && typeof file.content === "string")
      content = file.content;
    else {
      if (Number(file.size || 0) > GIST_RAW_MAX_SIZE)
        throw new Error(
          missingMessage ||
            "Este arquivo excede o limite de leitura pela API do Gist.",
        );
      if (!file.raw_url)
        throw new Error(
          missingMessage ||
            "O GitHub não retornou o conteúdo completo do arquivo.",
        );
      const response = await fetch(file.raw_url, {
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          missingMessage ||
            "Não foi possível ler o conteúdo completo do Gist.",
        );
      content = await response.text();
    }
    return content;
  }
  async function readGistFile(file, parser, missingMessage) {
    return parser(JSON.parse(await readGistText(file, missingMessage)));
  }
  function timestamp(item) {
    return String(item?.updatedAt || item?.createdAt || item?.deletedAt || "");
  }
  function mergeDeleted(a, b) {
    return normalizeDeleted([...(a || []), ...(b || [])]);
  }
  function mergeRecords(a, b, deleted) {
    const deletedMap = new Map(
        deleted.map((item) => [item.id, item.deletedAt]),
      ),
      map = new Map();
    [...(a || []), ...(b || [])].forEach((item) => {
      if (!item?.id) return;
      const current = map.get(item.id);
      if (!current || timestamp(item) >= timestamp(current))
        map.set(item.id, item);
    });
    return [...map.values()]
      .filter(
        (item) =>
          !deletedMap.get(item.id) || deletedMap.get(item.id) < timestamp(item),
      )
      .sort((x, y) => String(x.id).localeCompare(String(y.id)));
  }
  function mergeData(leftData, rightData) {
    const left = normalize(leftData),
      right = normalize(rightData),
      deletedClients = mergeDeleted(left.deletedClients, right.deletedClients),
      deletedCases = mergeDeleted(left.deletedCases, right.deletedCases),
      deletedPackages = mergeDeleted(
        left.deletedPackages,
        right.deletedPackages,
      ),
      deletedTeam = mergeDeleted(left.deletedTeam, right.deletedTeam),
      deletedEntries = mergeDeleted(left.deletedEntries, right.deletedEntries),
      deletedCharges = mergeDeleted(left.deletedCharges, right.deletedCharges);
    return normalize({
      ...left,
      updatedAt: [left.updatedAt, right.updatedAt].sort().pop() || now(),
      clients: mergeRecords(left.clients, right.clients, deletedClients),
      cases: mergeRecords(left.cases, right.cases, deletedCases),
      packages: mergeRecords(left.packages, right.packages, deletedPackages),
      team: mergeRecords(left.team, right.team, deletedTeam),
      entries: mergeRecords(left.entries, right.entries, deletedEntries),
      charges: mergeRecords(left.charges, right.charges, deletedCharges),
      deletedClients,
      deletedCases,
      deletedPackages,
      deletedTeam,
      deletedEntries,
      deletedCharges,
    });
  }
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object")
      return Object.keys(value)
        .sort()
        .reduce((out, key) => {
          out[key] = canonical(value[key]);
          return out;
        }, {});
    return value;
  }
  function dataSignature(value) {
    const comparable = normalize(value),
      copy = { ...comparable };
    delete copy.updatedAt;
    [
      "clients",
      "cases",
      "packages",
      "team",
      "entries",
      "charges",
      "accounts",
      ...deletedKeys,
    ].forEach(
      (key) =>
        (copy[key] = [...(copy[key] || [])].sort((a, b) =>
          String(a.id).localeCompare(String(b.id)),
        )),
    );
    return JSON.stringify(canonical(copy));
  }
  function syncSignature() {
    return JSON.stringify({
      data: dataSignature(data),
      files: financeFiles.signature(filesData),
    });
  }
  function saveSyncState() {
    settings.lastSyncAt = now();
    settings.lastSyncSignature = syncSignature();
    localStorage.setItem(
      SYNC_STATE_KEY,
      JSON.stringify({
        lastSyncAt: settings.lastSyncAt,
        lastSyncSignature: settings.lastSyncSignature,
      }),
    );
    renderGistStatus();
  }
  async function pushGist() {
    if (syncInFlight) {
      syncPending = true;
      return syncInFlight;
    }
    refreshGistCredentials();
    if (!settings.gistId || !settings.token)
      throw new Error("Configure o Gist nas Configurações do OfficeJur.");
    syncInFlight = (async () => {
      await filesReady;
      const { dataFile, filesFile, legacyFilesFile } = await fetchGistFiles();
      let remote = emptyData(),
        remoteFiles = financeFiles.emptyData();
      if (dataFile)
        remote = normalize(
          await readGistFile(
            dataFile,
            currentData,
            "Não foi possível ler os dados financeiros completos.",
          ),
        );
      let legacyRemote = null;
      let legacyRemoteContents = new Map();
      if (filesFile) {
        if (Number(filesFile.size || 0) > GIST_RAW_MAX_SIZE) {
          if (!legacyFilesData?.files?.length && !filesData.files.length)
            throw new Error(
              "O arquivo antigo de PDFs no Gist excede 10 MB e não há cópia local para migrá-lo. Restaure-o em um navegador que tenha os PDFs ou faça um backup pelo Git antes de sincronizar.",
            );
          legacyRemote = { tooLarge: true };
        } else {
          const rawFiles = JSON.parse(
            await readGistText(
              filesFile,
              "Não foi possível ler o índice de arquivos do Gist.",
            ),
          );
          if (financeFiles.isLegacyData(rawFiles)) legacyRemote = rawFiles;
          else remoteFiles = financeFiles.normalizeData(rawFiles);
        }
      }
      if (legacyRemote && !legacyRemote.tooLarge) {
        legacyFilesData = financeFiles.normalizeLegacyData(legacyRemote);
        const prepared = await prepareLegacyFiles(legacyFilesData);
        remoteFiles = prepared.data;
        legacyRemoteContents = prepared.contents;
      }
      if (legacyRemote) {
        if (legacyFilesFile)
          throw new Error(
            "Foi encontrado um índice legado e também um backup legado no Gist. Nenhum arquivo foi alterado para evitar sobrescrever a recuperação existente.",
          );
        await api(`/gists/${encodeURIComponent(settings.gistId)}`, {
          method: "PATCH",
          body: JSON.stringify({
            files: { [FILES_FILE]: { filename: LEGACY_FILES_BACKUP } },
          }),
        });
      }
      data = mergeData(data, remote);
      filesData = financeFiles.mergeData(filesData, remoteFiles);
      for (const remoteItem of remoteFiles.files) {
        const selected = filesData.files.find((item) => item.id === remoteItem.id),
          content = legacyRemoteContents.get(remoteItem.id);
        if (selected?.sha256 === remoteItem.sha256 && content)
          await saveFileContent(selected, content.blob);
      }
      localStorage.setItem(DATA_KEY, JSON.stringify(data));
      await saveFilesData(filesData);
      render();
      if (currentFilesClientId) renderClientFiles();
      const dataChanged =
          !dataFile || dataSignature(data) !== dataSignature(remote),
        filesChanged =
          !filesFile ||
          financeFiles.signature(filesData) !==
            financeFiles.signature(remoteFiles);
      if (!dataChanged && !filesChanged && !legacyRemote) {
        saveSyncState();
        toast("Dados e arquivos já estavam atualizados no Gist.");
        return;
      }
      const changedFiles = {};
      if (dataChanged)
        changedFiles[FILE] = {
          content: JSON.stringify(data, null, 2),
        };
      const remoteById = new Map(remoteFiles.files.map((item) => [item.id, item]));
      for (const item of filesData.files) {
        const remoteItem = remoteById.get(item.id);
        if (!financeFiles.needsPayloadUpload(item, remoteItem, Boolean(legacyRemote)))
          continue;
        const content = await getFileContent(item.id);
        if (!content?.blob)
          throw new Error(
            `O PDF “${item.name}” não está disponível neste navegador para concluir a sincronização. Abra ou baixe o arquivo antes de sincronizar.`,
          );
        const encoded = financeFiles.toBase64(await content.blob.arrayBuffer());
        await api(`/gists/${encodeURIComponent(settings.gistId)}`, {
          method: "PATCH",
          body: JSON.stringify({
            files: { [item.payloadFile]: { content: encoded } },
          }),
        });
      }
      if (filesChanged || legacyRemote)
        changedFiles[FILES_FILE] = {
          content: JSON.stringify(filesData, null, 2),
        };
      if (Object.keys(changedFiles).length)
        await api(`/gists/${encodeURIComponent(settings.gistId)}`, {
          method: "PATCH",
          body: JSON.stringify({ files: changedFiles }),
        });
      saveSyncState();
      toast("Dados e arquivos sincronizados.");
      renderGistStatus();
    })();
    try {
      await syncInFlight;
    } finally {
      syncInFlight = null;
      if (syncPending) {
        syncPending = false;
        await pushGist();
      }
    }
  }
  function refreshGistCredentials() {
    settings = { ...settings, ...gistSettings.load() };
    return settings;
  }
  function renderGistStatus() {
    refreshGistCredentials();
    $("#sync-label").innerHTML = settings.gistId
      ? '<i class="fa-solid fa-cloud"></i> Gist configurado'
      : '<i class="fa-solid fa-hard-drive"></i> Neste navegador';
  }
  function exportCsv() {
    const q = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const rows = [
      [
        "Vencimento",
        "Status",
        "Natureza",
        "Categoria",
        "Descrição",
        "Cliente",
        "Vinculação",
        "Processo",
        "Responsável",
        "Distribuição registrada",
        "Conta",
        "Forma",
        "Valor previsto",
        "Valor realizado",
        "Saldo restante",
      ],
      ...data.entries.map((e) => {
        const allocations = e.allocations || [],
          lead = allocations.find((a) => a.isLead);
        return [
          date(e.dueDate),
          statusOf(e),
          e.kind,
          e.category,
          e.description,
          clientName(e.clientId),
          e.packageId
            ? "Pacote de honorários"
            : e.caseId
              ? "Caso específico"
              : e.clientId
                ? "Receita geral do cliente"
                : "Escritório",
          caseName(e),
          lead?.personName || "",
          allocations
            .map(
              (a) =>
                `${a.personName || teamName(a.personId)}: ${a.percent || 0}% (${money(a.amount)})`,
            )
            .join(" | "),
          e.account,
          e.method,
          e.amount.toFixed(2).replace(".", ","),
          realizedAmountOf(e).toFixed(2).replace(".", ","),
          remainingAmountOf(e).toFixed(2).replace(".", ","),
        ];
      }),
    ];
    const blob = new Blob(
        ["\ufeff" + rows.map((r) => r.map(q).join(";")).join("\n")],
        { type: "text/csv;charset=utf-8" },
      ),
      a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `financeiro-${iso()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const sidebar = $("#sidebar"),
    menuButton = $("#mobile-menu-btn"),
    closeMobileMenu = () => {
      sidebar.classList.remove("is-open");
      document.body.classList.remove("menu-open");
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.setAttribute("aria-label", "Abrir menu");
      menuButton.querySelector("i").className = "fa-solid fa-bars";
    },
    toggleMobileMenu = () => {
      const opening = !sidebar.classList.contains("is-open");
      sidebar.classList.toggle("is-open", opening);
      document.body.classList.toggle("menu-open", opening);
      menuButton.setAttribute("aria-expanded", String(opening));
      menuButton.setAttribute(
        "aria-label",
        opening ? "Fechar menu" : "Abrir menu",
      );
      menuButton.querySelector("i").className = opening
        ? "fa-solid fa-xmark"
        : "fa-solid fa-bars";
    };
  menuButton.onclick = toggleMobileMenu;
  $("#nav-backdrop").onclick = closeMobileMenu;
  window.addEventListener("resize", () => {
    if (innerWidth > 720) closeMobileMenu();
  });
  $("#nav").addEventListener("click", (e) => {
    const b = e.target.closest("[data-view]");
    if (b) {
      if (b.dataset.view === "cases") caseTeamFilterId = "";
      showView(b.dataset.view);
      renderCases();
      closeMobileMenu();
    }
  });
  $("#show-receivables").onclick = () => {
    $("#entry-search").value = "";
    $("#entry-kind").value = "income";
    $("#entry-status").value = "receivable";
    showView("transactions");
    renderEntries();
  };
  const monthFilter = $("#month-filter"),
    monthDialog = $("#month-dialog"),
    monthNames = [
      "Janeiro",
      "Fevereiro",
      "Março",
      "Abril",
      "Maio",
      "Junho",
      "Julho",
      "Agosto",
      "Setembro",
      "Outubro",
      "Novembro",
      "Dezembro",
    ];
  let pickerYear = new Date().getFullYear();
  const updateMonthDisplay = () => {
      $("#month-display").textContent = monthLabel(monthFilter.value).replace(
        /^./,
        (c) => c.toLocaleUpperCase("pt-BR"),
      );
    },
    renderMonthPicker = () => {
      $("#month-picker-year").textContent = pickerYear;
      $("#month-picker-grid").innerHTML = monthNames
        .map((name, index) => {
          const value = `${pickerYear}-${String(index + 1).padStart(2, "0")}`;
          return `<button type="button" data-month-value="${value}" class="${value === monthFilter.value ? "selected" : ""}" aria-pressed="${value === monthFilter.value}">${name.slice(0, 3)}</button>`;
        })
        .join("");
    },
    selectMonth = (value) => {
      monthFilter.value = value;
      updateMonthDisplay();
      monthDialog.close();
      render();
    };
  monthFilter.value = currentMonth();
  updateMonthDisplay();
  $("#open-month-picker").onclick = () => {
    pickerYear =
      Number(monthFilter.value.slice(0, 4)) || new Date().getFullYear();
    renderMonthPicker();
    monthDialog.showModal();
  };
  $("#close-month-picker").onclick = () => monthDialog.close();
  $("#previous-month-year").onclick = () => {
    pickerYear--;
    renderMonthPicker();
  };
  $("#next-month-year").onclick = () => {
    pickerYear++;
    renderMonthPicker();
  };
  $("#current-month").onclick = () => selectMonth(currentMonth());
  $("#month-picker-grid").onclick = (e) => {
    const button = e.target.closest("[data-month-value]");
    if (button) selectMonth(button.dataset.monthValue);
  };
  $("#new-entry").onclick = () => openEntry();
  $$("[data-new-entry]").forEach((b) => (b.onclick = () => openEntry()));
  $("#quick-client").onclick = () => openClient();
  $$("[data-new-client]").forEach((b) => (b.onclick = () => openClient()));
  $("#close-detail").onclick = () => $("#detail-dialog").close();
  $("#entry-form [name=kind]").onchange = (e) => {
    fillCategories(e.target.value);
    renderAllocationPreview();
  };
  $("#entry-form [name=clientId]").onchange = (e) => {
    fillCaseSelect(e.target.value, "");
    fillPackageSelect(e.target.value, "", "#entry-form");
    renderAllocationPreview();
  };
  $("#entry-form [name=packageId]").onchange = (event) => {
    if (event.target.value) $("#entry-form [name=caseId]").value = "";
    renderAllocationPreview();
  };
  $("#entry-form [name=caseId]").onchange = (event) => {
    if (event.target.value) $("#entry-form [name=packageId]").value = "";
    renderAllocationPreview();
  };
  $("#entry-form [name=amount]").oninput = renderAllocationPreview;
  $("#entry-form [name=status]").onchange = updateEntryPaymentRequirement;
  $("#entry-form").addEventListener("submit", async (e) => {
    if (e.submitter?.value === "cancel") return;
    e.preventDefault();
    const f = e.currentTarget,
      fd = Object.fromEntries(new FormData(f)),
      amount = num(fd.amount),
      old = data.entries.find((x) => x.id === fd.id);
    let paidAmount =
        fd.status === "paid"
          ? amount
          : fd.status === "partial"
            ? num(fd.paidAmount)
            : 0,
      overflowPlan = null,
      distributeOverflow = false,
      limitedToCurrent = false;
    if (!fd.description || !amount || !fd.dueDate)
      return toast("Preencha descrição, valor e vencimento.");
    if (fd.kind === "income" && !fd.clientId)
      return toast("Toda receita deve estar vinculada a um cliente.");
    if (fd.status === "partial" && paidAmount <= 0)
      return toast("Informe um valor realizado maior que zero.");
    if (paidAmount > 0 && !fd.paidDate)
      return toast("Informe a data do pagamento.");
    if (
      fd.caseId &&
      !data.cases.some((x) => x.id === fd.caseId && x.clientId === fd.clientId)
    )
      return toast("O caso selecionado não pertence ao cliente informado.");
    if (
      fd.packageId &&
      !data.packages.some(
        (item) => item.id === fd.packageId && item.clientId === fd.clientId,
      )
    )
      return toast("O pacote selecionado não pertence ao cliente informado.");
    if (fd.caseId && fd.packageId)
      return toast("Vincule o lançamento a um pacote ou a um caso.");

    if (fd.status === "partial" && paidAmount >= amount) {
      if (paidAmount > amount) {
        overflowPlan = planPaymentAllocation(
          data.entries,
          fd.id,
          paidAmount,
          amount,
        );
        if (overflowPlan.unallocated > 0 && overflowPlan.updates.length) {
          return toast(
            `O valor supera em ${money(overflowPlan.unallocated)} o saldo de todas as parcelas futuras. Informe no máximo ${money(amount + overflowPlan.availableFuture)}.`,
          );
        }
        if (overflowPlan.updates.length) {
          const preview = overflowPlan.updates
              .slice(0, 3)
              .map(
                (update) =>
                  `${update.description}: ${update.status === "paid" ? "realizada" : `parcial em ${money(update.paidAmount)}`}`,
              )
              .join(" · "),
            remainingCount = Math.max(0, overflowPlan.updates.length - 3);
          distributeOverflow = await askConfirmation({
            title: "Distribuir pagamento excedente?",
            message: `O valor informado excede esta parcela em ${money(overflowPlan.excess)}. Deseja complementar as próximas parcelas da mesma contratação?`,
            impact: `${preview}${remainingCount ? ` · e mais ${remainingCount} parcela(s)` : ""}. Todas receberão a data ${date(fd.paidDate)}.`,
            label: "Sim, distribuir",
            cancelLabel: "Não, limitar",
            icon: "fa-arrow-right-arrow-left",
            tone: "primary",
          });
        } else {
          limitedToCurrent = true;
        }
      }
      paidAmount = amount;
      fd.status = "paid";
      if (overflowPlan && !distributeOverflow) limitedToCurrent = true;
    }

    const sameBasis =
        old &&
        old.kind === fd.kind &&
        old.clientId === fd.clientId &&
        old.packageId === fd.packageId &&
        old.caseId === fd.caseId &&
        Number(old.amount) === amount,
      allocations =
        fd.kind === "income" && fd.caseId
          ? sameBasis && Array.isArray(old.allocations)
            ? old.allocations
            : buildAllocations(fd.caseId, amount)
          : [],
      obj = {
        ...old,
        ...fd,
        id: fd.id || uid(),
        amount,
        paidAmount,
        allocations,
        billingScope: fd.packageId
          ? "package"
          : fd.caseId
            ? "case"
            : fd.clientId
              ? "client"
              : "office",
        createdAt: old?.createdAt || now(),
        updatedAt: now(),
      };
    if (!paidAmount) obj.paidDate = "";
    if (old)
      data.entries = data.entries.map((x) => (x.id === obj.id ? obj : x));
    else data.entries.push(obj);
    if (distributeOverflow) {
      const updates = new Map(
        overflowPlan.updates.map((update) => [update.id, update]),
      );
      data.entries = data.entries.map((entry) => {
        const update = updates.get(entry.id);
        return update
          ? {
              ...entry,
              paidAmount: update.paidAmount,
              status: update.status,
              paidDate: fd.paidDate,
              account: fd.account,
              method: fd.method,
              updatedAt: now(),
            }
          : entry;
      });
    }
    $("#entry-dialog").close();
    persist();
    if (distributeOverflow)
      return toast(
        `Pagamento distribuído entre a parcela atual e ${overflowPlan.updates.length} parcela(s) seguinte(s).`,
      );
    if (limitedToCurrent)
      return toast("Valor limitado ao total da parcela atual.");
    toast(
      obj.packageId
        ? "Lançamento vinculado ao pacote."
        : obj.caseId
          ? "Lançamento e distribuição vinculados ao caso."
          : obj.clientId
            ? "Lançamento vinculado ao cliente."
            : "Despesa geral do escritório salva.",
    );
  });
  $("#client-form [name=document]").addEventListener(
    "input",
    (e) => (e.target.value = maskCpf(e.target.value)),
  );
  $("#client-form [name=phoneNational]").addEventListener("input", (e) =>
    syncPhoneField(e.target.value),
  );
  $("#client-form [name=phoneCountry]").addEventListener("change", () =>
    syncPhoneField(),
  );
  $("#client-form [name=zip]").addEventListener(
    "input",
    (e) => (e.target.value = maskZip(e.target.value)),
  );
  $("#client-form [name=state]").addEventListener(
    "input",
    (e) =>
      (e.target.value = e.target.value
        .replace(/[^a-z]/gi, "")
        .toUpperCase()
        .slice(0, 2)),
  );
  $("#client-form [name=name]").addEventListener(
    "blur",
    (e) => (e.target.value = titleCaseName(e.target.value)),
  );
  ["nationality", "maritalStatus", "profession"].forEach((name) =>
    $("#client-form [name=" + name + "]").addEventListener(
      "blur",
      (e) => (e.target.value = normalizeDocumentPhrase(e.target.value)),
    ),
  );
  $("#client-form").addEventListener("submit", (e) => {
    if (e.submitter?.value === "cancel") return;
    e.preventDefault();
    const f = e.currentTarget,
      fd = Object.fromEntries(new FormData(f)),
      name = titleCaseName(fd.name),
      phone = parsePhone(fd.phoneNational, fd.phoneCountry);
    if (name.split(/\s+/).length < 2)
      return toast("Informe o nome completo do cliente.");
    if (!validCpf(fd.document)) return toast("Informe um CPF válido.");
    if (!fd.birthDate || fd.birthDate >= iso())
      return toast("Informe uma data de nascimento válida.");
    if (!phone?.isValid())
      return toast(
        `Informe um telefone válido para ${phoneCountryName(fd.phoneCountry)} (+${phoneCallingCode(fd.phoneCountry)}).`,
      );
    if (hasDuplicateDocument(data.clients, fd.document, fd.id))
      return toast("Já existe um cliente cadastrado com este CPF.");
    const old = data.clients.find((x) => x.id === fd.id),
      { phoneNational, ...clientFields } = fd,
      obj = {
        ...old,
        ...clientFields,
        name,
        nationality: normalizeDocumentPhrase(fd.nationality),
        maritalStatus: normalizeDocumentPhrase(fd.maritalStatus),
        profession: normalizeDocumentPhrase(fd.profession),
        document: maskCpf(fd.document),
        phone: phone.number,
        phoneCountry: phone.country || fd.phoneCountry,
        zip: maskZip(fd.zip),
        state: String(fd.state || "").toUpperCase(),
        whatsapp: f.elements.whatsapp.checked,
        id: fd.id || uid(),
        createdAt: old?.createdAt || now(),
        updatedAt: now(),
      };
    if (old)
      data.clients = data.clients.map((x) => (x.id === obj.id ? obj : x));
    else data.clients.push(obj);
    $("#client-dialog").close();
    persist();
    toast("Cliente salvo. Os casos são cadastrados na área própria.");
  });
  $("#case-form").addEventListener("submit", (e) => {
    if (e.submitter?.value === "cancel") return;
    e.preventDefault();
    const f = e.currentTarget,
      fd = Object.fromEntries(new FormData(f)),
      client = data.clients.find((c) => c.id === fd.clientId);
    if (!client) return toast("Selecione um cliente cadastrado.");
    if (!fd.number || !fd.title)
      return toast("Informe a referência e o objeto do caso.");
    if (hasDuplicateCaseReference(data.cases, fd.number, fd.id))
      return toast(
        "Já existe um caso ou processo cadastrado com este número ou referência.",
      );
    const scope = fd.contractScope,
      selectedPackage = data.packages.find(
        (item) => item.id === fd.packageId && item.clientId === client.id,
      );
    if (scope === "package" && !selectedPackage)
      return toast("Selecione um pacote deste cliente.");
    const agreement =
      scope === "own"
        ? readAgreementEditor($("#case-agreement-editor"))
        : blankAgreement();
    const errors = scope === "own" ? validateAgreement(agreement) : [];
    if (errors.length) return toast(errors[0]);
    const old = data.cases.find((x) => x.id === fd.id),
      obj = {
        id: fd.id || uid(),
        clientId: client.id,
        type: fd.type,
        area: fd.area,
        number: fd.number.trim(),
        title: fd.title.trim(),
        status: fd.status,
        contractScope: scope,
        packageId: scope === "package" ? selectedPackage.id : "",
        agreement,
        notes: fd.notes.trim(),
        assignments: old?.assignments || [],
        createdAt: old?.createdAt || now(),
        updatedAt: now(),
      };
    data.cases = old
      ? data.cases.map((x) => (x.id === obj.id ? obj : x))
      : [...data.cases, obj];
    if (scope === "own")
      syncContractEntries({
        source: "case",
        id: obj.id,
        clientId: obj.clientId,
        caseId: obj.id,
        title: obj.title,
        agreement,
      });
    else clearPendingContractEntries("case", obj.id);
    $("#case-dialog").close();
    persist();
    toast(
      scope === "own"
        ? "Caso salvo e recebíveis atualizados."
        : scope === "package"
          ? "Caso salvo e vinculado ao pacote."
          : "Caso salvo com contratação em branco.",
    );
  });
  $("#package-form").addEventListener("submit", (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    const form = event.currentTarget,
      fields = Object.fromEntries(new FormData(form)),
      client = data.clients.find(
        (item) => item.id === form.elements.clientId.value,
      ),
      name = fields.name.trim(),
      agreement = readAgreementEditor($("#package-agreement-editor")),
      errors = validateAgreement(agreement);
    if (!client) return toast("Selecione um cliente cadastrado.");
    if (!name) return toast("Informe o nome do pacote.");
    if (
      data.packages.some(
        (item) =>
          item.id !== fields.id &&
          item.clientId === client.id &&
          item.name.localeCompare(name, "pt-BR", {
            sensitivity: "base",
          }) === 0,
      )
    )
      return toast("Já existe um pacote com este nome para o cliente.");
    if (errors.length) return toast(errors[0]);
    const old = data.packages.find((item) => item.id === fields.id),
      item = {
        id: fields.id || uid(),
        clientId: client.id,
        name,
        status: fields.status,
        agreement,
        notes: fields.notes.trim(),
        createdAt: old?.createdAt || now(),
        updatedAt: now(),
      };
    data.packages = old
      ? data.packages.map((candidate) =>
          candidate.id === item.id ? item : candidate,
        )
      : [...data.packages, item];
    syncContractEntries({
      source: "package",
      id: item.id,
      clientId: item.clientId,
      packageId: item.id,
      title: item.name,
      agreement,
    });
    $("#package-dialog").close();
    persist();
    toast("Pacote salvo e recebíveis compartilhados atualizados.");
  });
  $("#team-form [name=document]").addEventListener(
    "input",
    (e) => (e.target.value = maskDocument(e.target.value)),
  );
  $("#team-form [name=phone]").addEventListener(
    "input",
    (e) => (e.target.value = maskPhone(e.target.value)),
  );
  $("#team-form [name=registration]").addEventListener(
    "input",
    (e) => (e.target.value = e.target.value.toUpperCase()),
  );
  $("#team-form [name=name]").addEventListener(
    "blur",
    (e) =>
      (e.target.value = titleCaseName(e.target.value, {
        company: isCompanyDocument($("#team-form [name=document]").value),
      })),
  );
  $("#team-form").addEventListener("submit", (e) => {
    if (e.submitter?.value === "cancel") return;
    e.preventDefault();
    const f = e.currentTarget,
      fd = Object.fromEntries(new FormData(f)),
      name = titleCaseName(fd.name, {
        company: isCompanyDocument(fd.document),
      });
    if (!name) return toast("Informe o nome da pessoa.");
    if (
      fd.document &&
      hasDuplicateDocument(data.team, fd.document, fd.id)
    )
      return toast("Já existe uma pessoa na equipe com este CPF/CNPJ.");
    const old = data.team.find((x) => x.id === fd.id),
      obj = {
        ...old,
        ...fd,
        name,
        document: maskDocument(fd.document),
        phone: maskPhone(fd.phone),
        registration: fd.registration.toUpperCase(),
        id: fd.id || uid(),
        createdAt: old?.createdAt || now(),
        updatedAt: now(),
      };
    data.team = old
      ? data.team.map((x) => (x.id === obj.id ? obj : x))
      : [...data.team, obj];
    $("#team-dialog").close();
    persist();
    toast("Pessoa salva na equipe.");
  });
  $("#assignments-form").addEventListener("submit", (e) => {
    if (e.submitter?.value === "cancel") return;
    e.preventDefault();
    const f = e.currentTarget,
      item = data.cases.find(
        (x) =>
          x.id === f.elements.caseId.value &&
          x.clientId === f.elements.clientId.value,
      ),
      values = assignmentValues(),
      total = values.reduce((s, x) => s + x.sharePercent, 0);
    if (!item) return;
    if (new Set(values.map((x) => x.personId)).size !== values.length)
      return toast("A mesma pessoa não pode aparecer duas vezes no caso.");
    if (total > 100)
      return toast("A participação total não pode ultrapassar 100%.");
    item.assignments = values;
    item.updatedAt = now();
    $("#assignments-dialog").close();
    persist();
    toast("Equipe e participações do caso salvas.");
  });
  $("#delete-team-member").onclick = async () => {
    const id = $("#team-form").elements.id.value,
      p = data.team.find((x) => x.id === id),
      links = personCases(id);
    if (
      !p ||
      !(await askConfirmation({
        title: "Excluir pessoa da equipe?",
        message: `Você está prestes a excluir ${p.name}.`,
        impact: links.length
          ? `A pessoa será removida também das atribuições em ${links.length} caso(s). Esta ação não pode ser desfeita.`
          : "O cadastro será removido permanentemente. Esta ação não pode ser desfeita.",
      }))
    )
      return;
    const deletedAt = now();
    markDeleted("deletedTeam", id, deletedAt);
    data.team = data.team.filter((x) => x.id !== id);
    data.cases.forEach((x) => {
      if ((x.assignments || []).some((a) => a.personId === id)) {
        x.assignments = x.assignments.filter((a) => a.personId !== id);
        x.updatedAt = deletedAt;
      }
    });
    $("#team-dialog").close();
    persist();
    toast("Pessoa removida da equipe e dos casos.");
  };
  $("#delete-client").onclick = async () => {
    await filesReady;
    const id = $("#client-form").elements.id.value,
      item = data.clients.find((candidate) => candidate.id === id),
      caseCount = data.cases.filter(
        (candidate) => candidate.clientId === id,
      ).length,
      packageCount = data.packages.filter(
        (candidate) => candidate.clientId === id,
      ).length,
      clientFiles = filesData.files.filter(
        (candidate) => candidate.clientId === id,
      );
    if (!item) return;
    if (caseCount || packageCount)
      return toast(
        `Este cliente possui ${caseCount} caso(s) e ${packageCount} pacote(s). Exclua ou transfira os vínculos primeiro.`,
      );
    if (
      !(await askConfirmation({
        title: "Excluir cliente?",
        message: `Você está prestes a excluir o cadastro de ${item.name}.`,
        impact: `${clientFiles.length ? `${clientFiles.length} PDF(s) da pasta também serão excluídos. ` : ""}Os lançamentos gerais serão preservados sem cliente vinculado. Esta ação não pode ser desfeita.`,
      }))
    )
      return;
    const deletedAt = now();
    if (clientFiles.length) {
      await persistFiles(
        {
          ...filesData,
          files: filesData.files.filter(
            (candidate) => candidate.clientId !== id,
          ),
          deletedFiles: [
            ...filesData.deletedFiles,
            ...clientFiles.map((file) => ({ id: file.id, deletedAt })),
          ],
        },
        true,
      );
      await Promise.all(clientFiles.map((file) => removeFileContent(file.id)));
    }
    markDeleted("deletedClients", id, deletedAt);
    data.clients = data.clients.filter((candidate) => candidate.id !== id);
    data.entries = data.entries.map((entry) =>
      entry.clientId === id
        ? {
            ...entry,
            clientId: "",
            caseId: "",
            packageId: "",
            billingScope: "office",
            updatedAt: deletedAt,
          }
        : entry,
    );
    $("#client-dialog").close();
    persist();
    toast("Cliente excluído.");
  };
  $("#add-assignment").onclick = () => addAssignmentRow();
  $("#case-form [name=clientId]").onchange = () => {
    $("#case-form [name=packageId]").value = "";
    updateCaseContractFields();
  };
  $("#case-form [name=contractScope]").onchange = updateCaseContractFields;
  $("#new-package").onclick = () => openPackage();
  $("#show-packages").onclick = () => {
    renderPackages();
    $("#packages-dialog").showModal();
  };
  $("#close-packages").onclick = () => $("#packages-dialog").close();
  $("#delete-package").onclick = async () => {
    const id = $("#package-form").elements.id.value,
      item = data.packages.find((candidate) => candidate.id === id),
      linkedCases = data.cases.filter((caseItem) => caseItem.packageId === id),
      paidEntries = data.entries.filter(
        (entry) =>
          entry.packageId === id &&
          entry.kind === "income" &&
          realizedAmountOf(entry) > 0,
      ),
      manualEntries = data.entries.filter(
        (entry) => entry.packageId === id && !entry.contractSource,
      );
    if (!item) return;
    if (linkedCases.length)
      return toast(
        `Retire ${linkedCases.length} caso(s) deste pacote antes de excluí-lo.`,
      );
    if (paidEntries.length)
      return toast(
        "O pacote possui recebimentos realizados e deve ser mantido no histórico.",
      );
    if (manualEntries.length)
      return toast(
        "Exclua ou desvincule os lançamentos manuais deste pacote primeiro.",
      );
    if (
      !(await askConfirmation({
        title: "Excluir pacote de honorários?",
        message: `Você está prestes a excluir “${item.name}”.`,
        impact:
          "Os recebíveis pendentes gerados pelo pacote serão removidos. Esta ação não pode ser desfeita.",
      }))
    )
      return;
    const deletedAt = now();
    clearPendingContractEntries("package", id);
    markDeleted("deletedPackages", id, deletedAt);
    data.packages = data.packages.filter((candidate) => candidate.id !== id);
    $("#package-dialog").close();
    persist();
    toast("Pacote e recebíveis pendentes excluídos.");
  };
  $("#delete-case").onclick = async () => {
    const f = $("#case-form"),
      clientId = f.elements.clientId.value,
      caseId = f.elements.id.value,
      item = data.cases.find((x) => x.id === caseId);
    if (
      !caseId ||
      !item ||
      !(await askConfirmation({
        title: "Excluir caso ou processo?",
        message: `Você está prestes a excluir “${item.title}”.`,
        impact:
          "Recebimentos realizados serão preservados no histórico do cliente. Recebíveis contratuais pendentes serão removidos.",
      }))
    )
      return;
    await filesReady;
    const deletedAt = now();
    if (
      filesData.files.some((file) => file.caseIds.includes(caseId))
    )
      await persistFiles(
        {
          ...filesData,
          files: filesData.files.map((file) =>
            file.caseIds.includes(caseId)
              ? {
                  ...file,
                  caseIds: file.caseIds.filter(
                    (candidate) => candidate !== caseId,
                  ),
                  updatedAt: deletedAt,
                }
              : file,
          ),
        },
        true,
      );
    markDeleted("deletedCases", caseId, deletedAt);
    data.cases = data.cases.filter((x) => x.id !== caseId);
    clearPendingContractEntries("case", caseId);
    data.entries = data.entries.map((entry) =>
      entry.clientId === clientId && entry.caseId === caseId
        ? {
            ...entry,
            caseId: "",
            billingScope: "client",
            updatedAt: deletedAt,
          }
        : entry,
    );
    $("#case-dialog").close();
    persist();
    toast("Caso excluído e histórico financeiro preservado no cliente.");
  };
  document.addEventListener("click", async (e) => {
    const edit = e.target.closest("[data-edit-entry]"),
      del = e.target.closest("[data-delete-entry]"),
      ec = e.target.closest("[data-edit-client]"),
      nc = e.target.closest("[data-new-case],#new-case"),
      nt = e.target.closest("#new-team-member"),
      np = e.target.closest("[data-new-package]"),
      xc = e.target.closest("[data-edit-case]"),
      xp = e.target.closest("[data-edit-package]"),
      mt = e.target.closest("[data-manage-team]"),
      et = e.target.closest("[data-edit-team]"),
      sc = e.target.closest("[data-show-client]"),
      vc = e.target.closest("[data-view-client]"),
      vx = e.target.closest("[data-view-case]"),
      vp = e.target.closest("[data-view-package]"),
      vt = e.target.closest("[data-view-team]"),
      ve = e.target.closest("[data-view-entry]");
    if (vc) viewClient(vc.dataset.viewClient);
    if (vx) viewCase(vx.dataset.viewCase);
    if (vp) viewPackage(vp.dataset.viewPackage);
    if (vt) viewTeamMember(vt.dataset.viewTeam);
    if (ve) viewEntry(ve.dataset.viewEntry);
    if (edit) openEntry(edit.dataset.editEntry);
    if (del) {
      const item = data.entries.find((x) => x.id === del.dataset.deleteEntry);
      if (
        item &&
        (await askConfirmation({
          title: "Excluir lançamento?",
          message: `Você está prestes a excluir “${item.description}”, no valor de ${money(item.amount)}.`,
          impact:
            "O lançamento e sua distribuição financeira serão removidos permanentemente.",
        }))
      ) {
        markDeleted("deletedEntries", item.id);
        data.entries = data.entries.filter((x) => x.id !== item.id);
        persist();
        toast("Lançamento excluído.");
      }
    }
    if (ec) openClient(ec.dataset.editClient);
    if (et) openTeamMember(et.dataset.editTeam);
    if (nt) openTeamMember();
    if (np) openPackage("", np.dataset.newPackage || "");
    if (nc) {
      if ($("#detail-dialog").open) $("#detail-dialog").close();
      openCase(nc.dataset.newCase || "");
    }
    if (xc) {
      const [clientId, caseId] = xc.dataset.editCase.split(":");
      openCase(clientId, caseId);
    }
    if (xp) openPackage(xp.dataset.editPackage);
    if (mt) {
      if ($("#detail-dialog").open) $("#detail-dialog").close();
      const [clientId, caseId] = mt.dataset.manageTeam.split(":");
      openAssignments(clientId, caseId);
    }
    if (sc) {
      showView("clients");
      $("#client-search").value = clientName(sc.dataset.showClient);
      renderClients();
    }
  });
  document.addEventListener("click", (e) => {
    const show = e.target.closest("[data-show-team-cases]"),
      clear = e.target.closest("[data-clear-team-cases]");
    if (show) showTeamCases(show.dataset.showTeamCases);
    if (clear) {
      caseTeamFilterId = "";
      renderCases();
    }
  });
  ["#entry-search", "#entry-kind", "#entry-status"].forEach((s) =>
    $(s).addEventListener(
      s === "#entry-search" ? "input" : "change",
      renderEntries,
    ),
  );
  $("#client-search").oninput = renderClients;
  $("#case-search").oninput = renderCases;
  $("#case-status-filter").onchange = renderCases;
  $("#team-search").oninput = renderTeam;
  $("#team-status").onchange = renderTeam;
  $("#export-csv").onclick = exportCsv;
  $("#mp-settings-btn").onclick = openMpSettings;
  $("#new-charge").onclick = openCharge;
  $("#charge-form [name=entryId]").onchange = (e) =>
    fillChargeFromEntry(e.target.value);
  $("#charge-form [name=payerName]").addEventListener("blur", (e) => {
    const entry = data.entries.find(
        (x) => x.id === $("#charge-form [name=entryId]").value,
      ),
      client = data.clients.find((x) => x.id === entry?.clientId);
    e.target.value = titleCaseName(e.target.value, {
      company: isCompanyDocument(client?.document),
    });
  });
  $("#mp-settings-form").addEventListener("submit", (e) => {
    if (e.submitter?.value === "cancel") return;
    e.preventDefault();
    const f = e.currentTarget;
    mp = {
      environment: f.environment.value,
      publicKey: f.publicKey.value.trim(),
      apiUrl: f.apiUrl.value.trim().replace(/\/$/, ""),
      returnUrl: f.returnUrl.value.trim(),
      statementDescriptor: f.statementDescriptor.value.trim().toUpperCase(),
      autoReturn: f.autoReturn.checked,
    };
    localStorage.setItem(MP_KEY, JSON.stringify(mp));
    $("#mp-settings-dialog").close();
    renderCharges();
    toast("Configuração do Mercado Pago salva.");
  });
  $("#charge-form").addEventListener("submit", async (e) => {
    if (e.submitter?.value === "cancel") return;
    e.preventDefault();
    const f = e.currentTarget,
      entry = data.entries.find((x) => x.id === f.entryId.value),
      client = data.clients.find((x) => x.id === entry?.clientId),
      button = $("#create-charge-submit"),
      chargeAmount = num(f.amount.value);
    if (!entry) return toast("Selecione um lançamento pendente.");
    if (chargeAmount <= 0 || chargeAmount > remainingAmountOf(entry))
      return toast(
        "Informe um valor de cobrança maior que zero e limitado ao saldo do lançamento.",
      );
    button.disabled = true;
    try {
      const payload = {
          entryId: entry.id,
          externalReference: f.externalReference.value,
          description: f.description.value.trim(),
          amount: chargeAmount,
          expiresAt: f.expiresAt.value,
          payer: {
            name: titleCaseName(f.payerName.value, {
              company: isCompanyDocument(client?.document),
            }),
            email: f.payerEmail.value.trim(),
          },
          clientId: entry.clientId,
          clientDocument: client?.document || "",
        },
        result = await createCharge(payload);
      data.charges.push({
        id: uid(),
        entryId: entry.id,
        clientId: entry.clientId,
        amount: payload.amount,
        description: payload.description,
        externalReference: payload.externalReference,
        preferenceId: result.preferenceId,
        checkoutUrl:
          mp.environment === "test"
            ? result.sandboxUrl || result.checkoutUrl
            : result.checkoutUrl,
        status: "pending",
        createdAt: now(),
        updatedAt: now(),
      });
      $("#charge-dialog").close();
      persist();
      toast("Link de pagamento criado.");
    } catch (err) {
      toast(err.message);
    } finally {
      button.disabled = false;
    }
  });
  document.addEventListener("click", async (e) => {
    const copy = e.target.closest("[data-copy-charge]"),
      refresh = e.target.closest("[data-refresh-charge]"),
      del = e.target.closest("[data-delete-charge]");
    if (copy) {
      const c = data.charges.find((x) => x.id === copy.dataset.copyCharge);
      if (c?.checkoutUrl) {
        await navigator.clipboard.writeText(c.checkoutUrl);
        toast("Link copiado.");
      }
    }
    if (refresh) {
      try {
        await refreshCharge(refresh.dataset.refreshCharge);
      } catch (err) {
        toast(err.message);
      }
    }
    if (del) {
      const charge = data.charges.find(
        (x) => x.id === del.dataset.deleteCharge,
      );
      if (
        charge &&
        (await askConfirmation({
          title: "Remover cobrança do histórico?",
          message: `Você está prestes a remover “${charge.description}”, no valor de ${money(charge.amount)}.`,
          impact:
            "Isso remove somente o registro deste sistema. A preferência de pagamento continuará existindo no Mercado Pago.",
          label: "Remover",
        }))
      ) {
        data.charges = data.charges.filter((x) => x.id !== charge.id);
        persist();
        toast("Cobrança removida.");
      }
    }
  });
  $("#close-client-files").onclick = () => $("#client-files-dialog").close();
  $("#close-file-preview").onclick = closeFilePreview;
  $("#client-files-dialog").addEventListener("close", () => {
    closeFilePreview();
    currentFilesClientId = "";
    $("#client-file-input").value = "";
  });
  $("#client-file-input").addEventListener("change", async (event) => {
    const input = event.currentTarget,
      selected = input.files?.[0],
      client = data.clients.find(
        (item) => item.id === currentFilesClientId,
      );
    if (!selected || !client) return;
    try {
      await filesReady;
      const buffer = await selected.arrayBuffer(),
        pageCount = financeFiles.countPdfPages(buffer),
        validation = financeFiles.validatePdf({
          name: selected.name,
          type: selected.type,
          size: selected.size,
          pageCount,
        });
      if (validation) return toast(validation);
      if (
        filesData.files.some(
          (item) =>
            item.clientId === client.id &&
            item.name.localeCompare(selected.name, "pt-BR", {
              sensitivity: "base",
            }) === 0,
        )
      )
        return toast(
          "Já existe um arquivo com este nome na pasta do cliente.",
        );
      const fileId = uid(),
        caseId = $("#client-file-case").value,
        validCase = data.cases.some(
          (item) => item.id === caseId && item.clientId === client.id,
        ),
        createdAt = now(),
        record = {
          id: fileId,
          clientId: client.id,
          caseIds: validCase ? [caseId] : [],
          name: selected.name,
          mimeType: "application/pdf",
          size: selected.size,
          pageCount,
          sha256: await financeFiles.sha256(buffer),
          payloadFile: financeFiles.payloadFileName(fileId),
          createdAt,
          updatedAt: createdAt,
        };
      await saveFileContent(record, selected);
      await persistFiles({
        ...filesData,
        files: [...filesData.files, record],
      });
      toast(
        `PDF armazenado com ${pageCount} ${pageCount === 1 ? "página" : "páginas"}.`,
      );
    } catch (error) {
      toast(error.message || "Não foi possível armazenar o PDF.");
    } finally {
      input.value = "";
    }
  });
  document.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-add-file-case]");
    if (!select || !select.value) return;
    try {
      await changeFileCase(select.dataset.addFileCase, select.value);
    } catch (error) {
      toast(error.message);
    }
  });
  document.addEventListener("click", async (event) => {
    const folder = event.target.closest("[data-client-files]"),
      view = event.target.closest("[data-view-file]"),
      download = event.target.closest("[data-download-file]"),
      removeCase = event.target.closest("[data-remove-file-case]"),
      removeFile = event.target.closest("[data-delete-file]");
    if (folder) await openClientFiles(folder.dataset.clientFiles);
    if (view)
      try {
        await viewClientFile(view.dataset.viewFile);
      } catch (error) {
        toast(error.message || "Não foi possível abrir o PDF.");
      }
    if (download)
      try {
        await downloadClientFile(download.dataset.downloadFile);
      } catch (error) {
        toast(error.message || "Não foi possível baixar o PDF.");
      }
    if (removeCase)
      try {
        await changeFileCase(
          removeCase.dataset.removeFileCase,
          removeCase.dataset.caseId,
          true,
        );
      } catch (error) {
        toast(error.message);
      }
    if (removeFile)
      try {
        await deleteClientFile(removeFile.dataset.deleteFile);
      } catch (error) {
        toast(error.message);
      }
  });
  $("#sync-now").onclick = () => pushGist().catch((e) => toast(e.message));
  document.addEventListener("click", (e) => {
    const action = e.target.closest("[data-client-document]"),
      currentMenu = e.target.closest(".document-menu");
    if (action)
      openClientDocument(
        action.dataset.clientDocument,
        action.dataset.documentType,
      );
    if (currentMenu && e.target.closest("summary"))
      document.querySelectorAll(".document-menu[open]").forEach((menu) => {
        if (menu !== currentMenu) menu.removeAttribute("open");
      });
    if (!currentMenu)
      document
        .querySelectorAll(".document-menu[open]")
        .forEach((menu) => menu.removeAttribute("open"));
  });
  showView((location.hash || "#dashboard").slice(1));
  render();
  if (settings.gistId && settings.token)
    filesReady
      .then(() => pushGist())
      .catch((error) =>
        toast(`Não foi possível sincronizar ao abrir: ${error.message}`),
      );
})();
