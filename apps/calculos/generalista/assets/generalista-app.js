(() => {
  "use strict";

  const app = document.querySelector("#generalista-app");
  const toast = document.querySelector("#toast");
  const syncStatus = document.querySelector("#sync-status");
  const mode = document.body.dataset.calculatorMode === "complete" ? "complete" : "easy";
  const complete = mode === "complete";
  const core = window.OfficeJurGenericCalculations;
  const storage = window.OfficeJurCalculationStorage;
  const finance = window.OfficeJurCalculationFinance;
  const indices = window.OfficeJurLegalIndices;
  const syncFactory = window.OfficeJurCalculationSync;
  const gistSettings = window.OfficeJurGistSettings;
  const gistClient = window.OfficeJurGistClient;
  const access = window.OfficeJurGistAccessLease?.create();
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
  const uid = () => crypto.randomUUID();
  const number = (value) => Number(value || 0);
  const formatMoney = (value) => core.currency(value);
  const indexOptions = (selected = "none") => [
    ["none", "NENHUM"], ["INPC", "INPC"], ["IPCA-E", "IPCA-E"], ["IPCA15", "IPCA-15"], ["IPCA", "IPCA (GERAL)"],
  ].map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");
  const periodicityOptions = (selected = "monthly") => `<option value="monthly" ${selected === "monthly" ? "selected" : ""}>Mensal</option><option value="annual" ${selected === "annual" ? "selected" : ""}>Anual</option>`;
  const typeOptions = (selected = "debit") => `<option value="debit" ${selected === "debit" ? "selected" : ""}>Parcela de débito</option><option value="payment" ${selected === "payment" ? "selected" : ""}>Abatimento / pagamento</option>`;
  const field = (label, name, value, type = "text", cls = "", required = false) => `<div class="field ${cls}"><label class="${required ? "required" : ""}" for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${escape(value)}" ${required ? "required" : ""}></div>`;

  let data = storage.normalize({});
  let localAccessAllowed = true;
  let financeData = finance?.empty?.() || { clients: [], cases: [], loaded: false };
  let step = 1;
  let current = blank();
  let busy = false;

  function notify(message, error = false) {
    toast.textContent = message;
    toast.className = `toast${error ? " error" : ""}`;
    toast.hidden = false;
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => { toast.hidden = true; }, 6_000);
  }
  function persist(status = current.status) {
    if (!localAccessAllowed) return;
    try { access?.canSync(gistSettings.load().gistId); } catch (_) { showBlocked(); return; }
    current.status = status;
    current.updatedAt = new Date().toISOString();
    data = storage.save({ ...data, records: [...data.records.filter((item) => item.id !== current.id), current] });
    void sync.toGist();
  }
  function blankItem() {
    const now = today();
    return { id: uid(), description: "Parcela", date: now, amount: 0, kind: "debit", correctionType: "none", correctionStart: now, correctionEnd: now, correctionProrata: true, interestRate: 0, interestPeriodicity: "monthly", interestStart: now, interestEnd: now, interestProrata: true };
  }
  function blank() {
    const now = today();
    return {
      id: uid(), code: `OJ-GEN-${now.slice(0, 4)}-${uid().slice(0, 6).toUpperCase()}`, type: mode, name: complete ? `Cálculo completo — ${now.split("-").reverse().join("/")}` : `Cálculo fácil — ${now.split("-").reverse().join("/")}`,
      status: "draft", calculationVersion: core.VERSION, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      input: {
        clientId: "", clientName: "", caseNumber: "", judgmentDate: "", parties: [{ id: uid(), name: "", role: "Autor" }], calculationDate: now,
        items: [blankItem()], settings: { correctionType: "none", correctionProrata: true, interestRate: 0, interestPeriodicity: "monthly", interestProrata: true, penaltyRate: 0, feeRate: 0, feeType: "percent", feeAmount: 0 },
        penalties: [], fees: [], costs: [], notes: "",
      }, indexSnapshot: null, result: null,
    };
  }
  function clientOptions(selected) {
    return `<option value="">Selecione um cliente</option>${(financeData.clients || []).map((client) => `<option value="${escape(client.id)}" ${String(selected || "") === String(client.id) ? "selected" : ""}>${escape(finance.clientLabel(client))}</option>`).join("")}`;
  }
  function financeNotice() {
    if (!financeData.loaded) return '<div class="finance-notice error"><strong>Não foi possível ler o Financeiro.</strong><span>Atualize a página para tentar novamente.</span></div>';
    if (!financeData.clients.length) return '<div class="finance-notice"><strong>Cadastre um cliente no Financeiro antes de criar o cálculo.</strong><a href="../../financeiro/" target="_blank" rel="noopener">Abrir Financeiro</a></div>';
    return "";
  }
  function steps() {
    const labels = complete ? [["Dados básicos", "identificação do cálculo e das partes"], ["Parcelas", "débitos, pagamentos e índices"], ["Encargos", "multas, honorários e custas"], ["Resultado", "memória do cálculo"]] : [["Dados do cálculo", "critérios, valores e lançamentos"], ["Resultado", "memória do cálculo"]];
    return `<ol class="wizard-steps steps-${labels.length}">${labels.map((item, index) => `<li class="wizard-step ${step === index + 1 ? "active" : ""} ${step > index + 1 ? "done" : ""}"><span>${index + 1}</span><div><strong>${item[0]}</strong><small>${item[1]}</small></div></li>`).join("")}</ol>`;
  }
  function basicFields(includeParties = complete) {
    const i = current.input;
    return `<div class="form-grid">${financeNotice()}${field("Nome do cálculo", "name", current.name, "text", "full", true)}<div class="field"><label class="required" for="clientId">Cliente</label><select id="clientId" required>${clientOptions(i.clientId)}</select></div>${complete ? `${field("Número do processo", "caseNumber", i.caseNumber)}${field("Data do trânsito em julgado", "judgmentDate", i.judgmentDate, "date")}` : field("Data-base do cálculo", "calculationDate", i.calculationDate, "date", "", true)}${includeParties ? `<div class="field full"><label>Partes envolvidas</label><div class="party-list">${i.parties.map((party, index) => `<div class="party-row" data-party-index="${index}"><input data-party-field="name" aria-label="Nome da parte ${index + 1}" placeholder="Nome da parte ${index + 1}" value="${escape(party.name)}"><select data-party-field="role" aria-label="Tipo da parte ${index + 1}">${["Autor", "Credor", "Devedor", "Réu"].map((role) => `<option ${party.role === role ? "selected" : ""}>${role}</option>`).join("")}</select>${index ? `<button class="danger small" type="button" data-action="remove-party" data-index="${index}" aria-label="Remover parte">×</button>` : ""}</div>`).join("")}<button class="link-button" type="button" data-action="add-party">＋ Adicionar parte envolvida</button></div></div>` : ""}</div>`;
  }
  function easyStep() {
    const i = current.input, s = i.settings;
    return `${basicFields(false)}<div class="form-grid generalista-criteria"><div class="field"><label class="required" for="correctionType">Índice para corrigir os valores</label><select id="correctionType">${indexOptions(s.correctionType)}</select></div><label class="check field"><input id="correctionProrata" type="checkbox" ${s.correctionProrata ? "checked" : ""}><span>Correção pró-rata</span></label>${field("Taxa de juros (%)", "interestRate", s.interestRate, "number", "", false)}<div class="field"><label for="interestPeriodicity">Periodicidade</label><select id="interestPeriodicity">${periodicityOptions(s.interestPeriodicity)}</select></div><label class="check field"><input id="interestProrata" type="checkbox" ${s.interestProrata ? "checked" : ""}><span>Juros pró-rata</span></label>${field("Multa (%)", "penaltyRate", s.penaltyRate, "number") }<label class="check field"><input id="penaltyOnInterest" type="checkbox" ${s.penaltyOnInterest ? "checked" : ""}><span>Multa incide sobre juros</span></label>${field("Valor dos honorários", s.feeType === "fixed" ? "feeAmount" : "feeRate", s.feeType === "fixed" ? s.feeAmount : s.feeRate, "number")}<div class="field"><label for="feeType">Tipo de aplicação</label><select id="feeType"><option value="percent" ${s.feeType !== "fixed" ? "selected" : ""}>Percentual (%)</option><option value="fixed" ${s.feeType === "fixed" ? "selected" : ""}>Fixo (R$)</option></select></div><div class="field full"><button class="secondary" type="button" data-action="load-indices">${current.indexSnapshot ? "Atualizar índices oficiais" : "Carregar índices oficiais"}</button><span class="hint">Os percentuais consultados são congelados no rascunho para auditoria.</span></div></div><section class="items-section"><div class="card-title"><div><h2>Detalhamento dos itens</h2><p class="hint">Inclua débitos e abatimentos na ordem em que ocorreram.</p></div><button class="secondary" type="button" data-action="add-item">＋ Adicionar parcela</button></div>${itemsTable(false)}</section>`;
  }
  function itemFields(item, index, detailed) {
    return `<div class="item-row ${detailed ? "item-detailed" : ""}" data-item-index="${index}"><div class="item-index"><span>${index + 1}</span>${index ? `<button class="danger small" type="button" data-action="remove-item" data-index="${index}" aria-label="Remover item">×</button>` : ""}</div><input data-item-field="description" aria-label="Descrição do item ${index + 1}" value="${escape(item.description)}" placeholder="Descrição do item"><input data-item-field="date" aria-label="Data do item ${index + 1}" type="date" value="${escape(item.date)}" required><input data-item-field="amount" aria-label="Valor do item ${index + 1}" type="number" min="0" step="0.01" value="${escape(item.amount)}" placeholder="R$ 0,00" required><select data-item-field="kind" aria-label="Tipo do item ${index + 1}">${typeOptions(item.kind)}</select>${detailed ? `<select data-item-field="correctionType" aria-label="Índice do item ${index + 1}">${indexOptions(item.correctionType)}</select><input data-item-field="correctionStart" aria-label="Início da correção do item ${index + 1}" type="date" value="${escape(item.correctionStart || item.date)}"><input data-item-field="correctionEnd" aria-label="Fim da correção do item ${index + 1}" type="date" value="${escape(item.correctionEnd || today())}"><label class="check compact"><input data-item-field="correctionProrata" type="checkbox" ${item.correctionProrata ? "checked" : ""}><span>Correção pró-rata</span></label><input data-item-field="interestRate" aria-label="Juros do item ${index + 1}" type="number" min="0" step="0.0001" value="${escape(item.interestRate)}" placeholder="Juros %"><select data-item-field="interestPeriodicity" aria-label="Periodicidade do item ${index + 1}">${periodicityOptions(item.interestPeriodicity)}</select><input data-item-field="interestStart" aria-label="Início dos juros do item ${index + 1}" type="date" value="${escape(item.interestStart || item.date)}"><input data-item-field="interestEnd" aria-label="Fim dos juros do item ${index + 1}" type="date" value="${escape(item.interestEnd || today())}"><label class="check compact"><input data-item-field="interestProrata" type="checkbox" ${item.interestProrata ? "checked" : ""}><span>Juros pró-rata</span></label>` : ""}</div>`;
  }
  function itemsTable(detailed) {
    const labels = detailed ? ["Item", "Descrição", "Data", "Valor", "Tipo", "Índice", "Início", "Fim", "Correção", "Juros", "Período", "Início", "Fim", "Juros"] : ["Item", "Descrição do item", "Data da época", "Digite o valor", "A que se refere esta parcela?"];
    return `<div class="table-wrap generalista-items ${detailed ? "detailed" : ""}"><div class="item-header">${labels.map((label) => `<span>${label}</span>`).join("")}</div>${current.input.items.map((item, index) => itemFields(item, index, detailed)).join("")}</div>`;
  }
  function completeStepOne() { return `<p class="hint">Identifique o cálculo, o processo e as partes envolvidas.</p>${basicFields(true)}`; }
  function completeStepTwo() { return `<div class="card-title"><div><h2>Lançamentos</h2><p class="hint">Cada lançamento pode usar seu próprio índice, taxa e periodicidade.</p></div><button class="secondary" type="button" data-action="add-item">＋ Adicionar parcela</button></div>${itemsTable(true)}<div class="index-actions"><button class="secondary" type="button" data-action="load-indices">${current.indexSnapshot ? "Atualizar índices oficiais" : "Carregar índices oficiais"}</button><span class="hint">Os índices dos itens selecionados serão consultados e preservados no cálculo.</span></div>`; }
  function extraRow(kind, item, index) {
    if (kind === "cost") return `<div class="extra-row" data-extra-kind="cost" data-extra-index="${index}">${field("Valor das custas (R$)", "cost-amount-${index}", item.amount, "number", "", true)}${field("Data", "cost-date-${index}", item.date, "date", "", true)}${field("Descrição de custas", "cost-description-${index}", item.description)}<div class="field"><label>Índice</label><select data-extra-field="correctionType">${indexOptions(item.correctionType)}</select></div><button class="danger small" type="button" data-action="remove-extra" data-kind="cost" data-index="${index}">Remover</button></div>`;
    const isFee = kind === "fee";
    return `<div class="extra-row" data-extra-kind="${kind}" data-extra-index="${index}">${field(isFee ? "Honorários (%)" : "Multa (%)", `${kind}-rate-${index}`, item.rate, "number", "", true)}${isFee ? `<div class="field"><label>Tipo</label><select data-extra-field="type"><option value="percent" ${item.type !== "fixed" ? "selected" : ""}>Percentual (%)</option><option value="fixed" ${item.type === "fixed" ? "selected" : ""}>Fixo (R$)</option></select></div>` : `<label class="check field"><input data-extra-field="onInterest" type="checkbox" ${item.onInterest ? "checked" : ""}><span>Incide sobre juros</span></label>`}${field("Descrição", `${kind}-description-${index}`, item.description)}<button class="danger small" type="button" data-action="remove-extra" data-kind="${kind}" data-index="${index}">Remover</button></div>`;
  }
  function completeStepThree() {
    const i = current.input;
    return `<section class="extra-section"><div class="card-title"><div><h2>Multas e honorários</h2><p class="hint">Adicione os encargos previstos no título ou contrato.</p></div><div class="button-row"><button class="secondary" type="button" data-action="add-extra" data-kind="penalty">＋ Adicionar multa</button><button class="secondary" type="button" data-action="add-extra" data-kind="fee">＋ Adicionar honorários</button></div></div>${i.penalties.map((item, index) => extraRow("penalty", item, index)).join("") || '<div class="empty-inline">Nenhuma multa adicionada.</div>'}${i.fees.map((item, index) => extraRow("fee", item, index)).join("") || '<div class="empty-inline">Nenhum honorário adicionado.</div>'}</section><section class="extra-section"><div class="card-title"><div><h2>Custas processuais</h2><p class="hint">Atualize as custas com índice próprio quando necessário.</p></div><button class="secondary" type="button" data-action="add-extra" data-kind="cost">＋ Adicionar custas processuais</button></div>${i.costs.map((item, index) => extraRow("cost", item, index)).join("") || '<div class="empty-inline">Nenhuma custa processual adicionada.</div>'}</section>${field("Observações", "notes", i.notes, "text", "full")}`;
  }
  function resultStep() {
    const r = current.result;
    if (!r) return '<div class="empty">Calcule os dados para visualizar o resultado.</div>';
    const totals = [["Valor original", r.totals.original], ["Correção", r.totals.correction], ["Juros", r.totals.interest], ["Multa", r.totals.penalty], ["Honorários", r.totals.fees], ["Custas", r.totals.costs], ["Total atualizado", r.totals.total]];
    return `<p class="hint">Data-base: ${escape(r.calculationDate.split("-").reverse().join("/"))}</p><div class="summary">${totals.map(([label, value], index) => `<div class="metric ${index === totals.length - 1 ? "total" : ""}"><span>${label}</span><strong>${formatMoney(value)}</strong></div>`).join("")}</div><h2>Memória por lançamento</h2><div class="table-wrap"><table><thead><tr><th>Data</th><th>Lançamento</th><th>Tipo</th><th>Original</th><th>Correção</th><th>Juros</th><th>Total</th></tr></thead><tbody>${r.ledger.map((item) => `<tr><td>${escape(item.date.split("-").reverse().join("/"))}</td><td>${escape(item.description)}</td><td>${item.sign < 0 ? "Abatimento" : item.kind === "cost" ? "Custa" : "Débito"}</td><td>${formatMoney(item.original)}</td><td>${formatMoney(item.correction)}</td><td>${formatMoney(item.interest)}</td><td><strong>${formatMoney(item.total)}</strong></td></tr>`).join("")}</tbody></table></div>${r.penaltyRows.length || r.feeRows.length ? `<h2>Encargos adicionais</h2><div class="table-wrap"><table><thead><tr><th>Descrição</th><th>Tipo</th><th>Valor</th></tr></thead><tbody>${[...r.penaltyRows.map((item) => ({ ...item, type: "Multa" })), ...r.feeRows.map((item) => ({ ...item, type: "Honorários" }))].map((item) => `<tr><td>${escape(item.description)}</td><td>${item.type}</td><td>${formatMoney(item.amount)}</td></tr>`).join("")}</tbody></table></div>` : ""}<p class="legal-note">${escape(r.methodology.correctionConvention)} ${escape(r.methodology.interestConvention)} Confirme o título judicial, os termos iniciais e o índice aplicável ao caso concreto.</p>`;
  }
  function render() {
    const content = complete ? [completeStepOne, completeStepTwo, completeStepThree, resultStep][step - 1]() : [easyStep, resultStep][step - 1]();
    const last = complete ? 4 : 2;
    app.innerHTML = `<section class="panel wizard-head"><p class="eyebrow">Generalista</p><h1>Atualização monetária ${complete ? "completa" : "simples"}</h1><p class="hint">${escape(current.code)} • versão ${escape(current.calculationVersion)}</p>${steps()}<form id="generalista-form">${content}<div class="wizard-actions"><button class="secondary" type="button" data-action="${step === 1 ? "cancel" : "back"}">${step === 1 ? "Cancelar" : "Voltar"}</button><div>${step < last ? `<button class="secondary" type="button" data-action="save">Salvar rascunho</button><button class="primary" type="submit">${step === last - 1 ? "Calcular" : "Próximo"}</button>` : `<button class="secondary" type="button" data-action="save">Salvar</button><button class="primary" type="button" data-action="print">Imprimir demonstrativo</button>`}</div></div></form></section>`;
    app.focus({ preventScroll: true });
  }
  function captureBasic() {
    const name = document.querySelector("#name")?.value.trim();
    const clientId = document.querySelector("#clientId")?.value || "";
    if (name !== undefined) current.name = name;
    current.input.clientId = clientId;
    current.input.clientName = finance.clientLabel(finance.findClient(financeData, clientId));
    if (document.querySelector("#caseNumber")) current.input.caseNumber = document.querySelector("#caseNumber").value.trim();
    if (document.querySelector("#judgmentDate")) current.input.judgmentDate = document.querySelector("#judgmentDate").value;
    if (document.querySelector("#calculationDate")) current.input.calculationDate = document.querySelector("#calculationDate").value;
    document.querySelectorAll("[data-party-index]").forEach((row) => {
      const party = current.input.parties[Number(row.dataset.partyIndex)];
      if (!party) return;
      party.name = row.querySelector('[data-party-field="name"]').value;
      party.role = row.querySelector('[data-party-field="role"]').value;
    });
    if (!current.name || !clientId) throw new Error("Preencha o nome do cálculo e selecione um cliente.");
    if (!complete && !current.input.calculationDate) throw new Error("Informe a data-base do cálculo.");
  }
  function captureItems() {
    document.querySelectorAll("[data-item-index]").forEach((row) => {
      const item = current.input.items[Number(row.dataset.itemIndex)];
      if (!item) return;
      row.querySelectorAll("[data-item-field]").forEach((element) => {
        const key = element.dataset.itemField;
        item[key] = element.type === "checkbox" ? element.checked : ["amount", "interestRate"].includes(key) ? number(element.value) : element.value;
      });
    });
    if (!current.input.items.some((item) => item.date && number(item.amount) > 0)) throw new Error("Inclua ao menos um item com data e valor.");
  }
  function captureEasy() {
    captureBasic();
    const s = current.input.settings;
    s.correctionType = document.querySelector("#correctionType").value;
    s.correctionProrata = document.querySelector("#correctionProrata").checked;
    s.interestRate = number(document.querySelector("#interestRate").value);
    s.interestPeriodicity = document.querySelector("#interestPeriodicity").value;
    s.interestProrata = document.querySelector("#interestProrata").checked;
    s.penaltyRate = number(document.querySelector("#penaltyRate").value);
    s.penaltyOnInterest = document.querySelector("#penaltyOnInterest").checked;
    s.feeType = document.querySelector("#feeType").value;
    if (s.feeType === "fixed") s.feeAmount = number(document.querySelector("#feeAmount").value); else s.feeRate = number(document.querySelector("#feeRate").value);
    current.input.items.forEach((item) => { item.correctionType = s.correctionType; item.correctionProrata = s.correctionProrata; item.interestRate = s.interestRate; item.interestPeriodicity = s.interestPeriodicity; item.interestProrata = s.interestProrata; });
    captureItems();
  }
  function captureExtras() {
    document.querySelectorAll("[data-extra-kind]").forEach((row) => {
      const kind = row.dataset.extraKind, index = Number(row.dataset.extraIndex), list = kind === "penalty" ? current.input.penalties : kind === "fee" ? current.input.fees : current.input.costs, item = list[index];
      if (!item) return;
      const amount = row.querySelector(`[id="${kind}-rate-${index}"]`) || row.querySelector(`[id="cost-amount-${index}"]`);
      const date = row.querySelector(`[id="cost-date-${index}"]`);
      const description = row.querySelector(`[id="${kind}-description-${index}"]`) || row.querySelector(`[id="cost-description-${index}"]`);
      if (kind === "cost") { item.amount = number(amount?.value); item.date = date?.value || ""; item.description = description?.value || ""; item.correctionType = row.querySelector('[data-extra-field="correctionType"]')?.value || "none"; } else { item.rate = number(amount?.value); item.description = description?.value || ""; item.type = row.querySelector('[data-extra-field="type"]')?.value || item.type; item.onInterest = row.querySelector('[data-extra-field="onInterest"]')?.checked || false; }
    });
    if (document.querySelector("#notes")) current.input.notes = document.querySelector("#notes").value;
  }
  function captureVisible() { if (complete && step === 1) captureBasic(); if (complete && step === 2) { captureItems(); } if (complete && step === 3) captureExtras(); if (!complete && step === 1) captureEasy(); }
  function indexTypes() {
    const types = new Set();
    current.input.items.forEach((item) => { if (item.correctionType && item.correctionType !== "none") types.add(item.correctionType); });
    current.input.costs.forEach((item) => { if (item.correctionType && item.correctionType !== "none") types.add(item.correctionType); });
    if (!complete && current.input.settings.correctionType !== "none") types.add(current.input.settings.correctionType);
    return [...types];
  }
  async function loadIndices() {
    captureVisible();
    const types = indexTypes();
    if (!types.length) { current.indexSnapshot = null; notify("Nenhum índice externo foi selecionado."); return; }
    if (!indices?.snapshot) throw new Error("O módulo de índices oficiais não foi carregado.");
    const dates = [...current.input.items.map((item) => item.date), ...current.input.costs.map((item) => item.date)].filter(Boolean).sort();
    const start = dates[0] || current.input.calculationDate, end = current.input.calculationDate;
    busy = true; syncStatus.textContent = "Consultando índices oficiais…";
    try {
      const snapshots = await Promise.all(types.map((type) => indices.snapshot({ correctionType: type, interestType: "none", start, end })));
      current.indexSnapshot = { fetchedAt: new Date().toISOString(), start, end, ratesByType: Object.fromEntries(types.map((type, index) => [type, snapshots[index].correctionRates || {}])), sources: snapshots.flatMap((item) => item.sources || []) };
      persist("draft"); notify("Índices oficiais carregados e congelados neste rascunho.");
    } finally { busy = false; syncStatus.textContent = "Dados locais"; }
    render();
  }
  function calculate() {
    captureVisible();
    if (indexTypes().length && !current.indexSnapshot?.ratesByType) throw new Error("Carregue os índices oficiais antes de calcular.");
    current.result = core.calculateGeneric({ ...current.input, ratesByType: current.indexSnapshot?.ratesByType || {} });
    persist("final"); step = complete ? 4 : 2; notify("Cálculo concluído.");
  }
  function addExtra(kind) { captureVisible(); const list = kind === "penalty" ? current.input.penalties : kind === "fee" ? current.input.fees : current.input.costs; list.push(kind === "cost" ? { id: uid(), amount: 0, date: today(), description: "Custas processuais", correctionType: "none" } : { id: uid(), rate: 0, description: kind === "fee" ? "Honorários" : "Multa", type: "percent", onInterest: false }); render(); }
  const sync = syncFactory.create({ storage, gistSettings, gistClient, access, getData: () => data, setData: (value) => { data = value; }, setStatus: (message) => { syncStatus.textContent = message; }, notify });
  function showBlocked() {
    localAccessAllowed = false;
    data = storage.normalize({});
    app.innerHTML = '<section class="panel" role="alert"><h1>Acesso local bloqueado</h1><p>Os dados sincronizados deste navegador foram removidos. Atualize a credencial e sincronize novamente.</p><a class="primary button" href="../../configuracoes/">Abrir Configurações</a></section>';
    syncStatus.textContent = "Acesso local bloqueado";
  }
  access?.subscribe((lease) => {
    if (lease.phase === "purging" || lease.phase === "purged") showBlocked();
  });
  app.addEventListener("change", (event) => {
    if (event.target.id !== "feeType") return;
    try { captureEasy(); } catch (_) { /* a mudança de seletor não deve apagar o formulário incompleto */ }
    current.input.settings.feeType = event.target.value;
    render();
  });
  app.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-action]");
    if (!target || busy) return;
    const action = target.dataset.action;
    try {
      if (action === "cancel") { window.location.href = "../"; return; }
      if (action === "back") { captureVisible(); step = Math.max(1, step - 1); render(); return; }
      if (action === "save") { captureVisible(); persist("draft"); notify("Rascunho salvo."); return; }
      if (action === "print") { window.print(); return; }
      if (action === "load-indices") { await loadIndices(); return; }
      if (action === "add-item") { captureVisible(); current.input.items.push(blankItem()); render(); return; }
      if (action === "remove-item") { captureVisible(); current.input.items.splice(Number(target.dataset.index), 1); render(); return; }
      if (action === "add-party") { captureVisible(); current.input.parties.push({ id: uid(), name: "", role: "Autor" }); render(); return; }
      if (action === "remove-party") { captureVisible(); current.input.parties.splice(Number(target.dataset.index), 1); render(); return; }
      if (action === "add-extra") { addExtra(target.dataset.kind); return; }
      if (action === "remove-extra") { captureVisible(); const list = target.dataset.kind === "penalty" ? current.input.penalties : target.dataset.kind === "fee" ? current.input.fees : current.input.costs; list.splice(Number(target.dataset.index), 1); render(); }
    } catch (error) { notify(error.message || "Não foi possível atualizar o cálculo.", true); }
  });
  app.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy) return;
    try { const last = complete ? 4 : 2; if (step < last - 1) { captureVisible(); step += 1; render(); } else if (step === last - 1) calculate(); render(); } catch (error) { notify(error.message || "Não foi possível concluir o cálculo.", true); }
  });
  function loadRequestedRecord() {
    const requested = new URLSearchParams(window.location.search).get("id");
    if (!requested) return;
    const found = data.records.find((item) => item.id === requested && item.type === mode);
    if (!found) { notify("Cálculo não encontrado.", true); return; }
    current = structuredClone(found);
    if (!current.input.parties) current.input.parties = [{ id: uid(), name: "", role: "Autor" }];
    if (new URLSearchParams(window.location.search).get("pdf") === "1" && current.result) setTimeout(() => window.print(), 300);
    step = current.result ? (complete ? 4 : 2) : 1;
  }
  async function initialize() {
    localAccessAllowed = await access?.guard("calculos", () => { storage.clear(); data = storage.normalize({}); }) ?? true;
    if (!localAccessAllowed) { showBlocked(); return; }
    data = storage.load();
    try { financeData = await finance?.load?.() || { clients: [], cases: [], loaded: false }; } catch (_) { financeData = { clients: [], cases: [], loaded: false }; }
    await sync.fromGist();
    if (!localAccessAllowed) { showBlocked(); return; }
    try { access?.canSync(gistSettings.load().gistId); } catch (_) { showBlocked(); return; }
    loadRequestedRecord(); render();
  }
  void initialize();
})();
