(() => {
  "use strict";

  const app = document.querySelector("#generalista-app");
  const toast = document.querySelector("#toast");
  const syncStatus = document.querySelector("#sync-status");
  const mode = document.body.dataset.calculatorMode === "complete" ? "complete" : "easy";
  const complete = mode === "complete";
  const core = window.OfficeJurGenericCalculations;
  const pdf = window.OfficeJurGenericPdf;
  const storage = window.OfficeJurCalculationStorage;
  const finance = window.OfficeJurCalculationFinance;
  const caseContextApi = window.OfficeJurCalculationCaseContext;
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
  const formatDate = (value) => value ? value.split("-").reverse().join("/") : "—";
  const indexOptions = (selected = "none") => [
    ["none", "Nenhum"], ["INPC", "INPC"], ["IPCA-E", "IPCA-E"], ["IPCA15", "IPCA-15"], ["IPCA", "IPCA (geral)"],
  ].map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");
  const interestTypeOptions = (selected = "none") => [
    ["none", "Sem juros"], ["fixed", "Taxa fixa"], ["legal", "Taxa Legal — Lei 14.905/2024"],
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
    return { id: uid(), description: "Parcela", date: now, amount: 0, kind: "debit", correctionType: "none", correctionStart: "", correctionEnd: "", correctionProrata: true, interestType: "none", interestRate: 0, interestPeriodicity: "monthly", interestStart: "", interestEnd: "", interestProrata: true };
  }
  function blank() {
    const now = today();
    return {
      id: uid(), code: `OJ-GEN-${now.slice(0, 4)}-${uid().slice(0, 6).toUpperCase()}`, type: mode, name: complete ? `Cálculo completo — ${now.split("-").reverse().join("/")}` : `Cálculo fácil — ${now.split("-").reverse().join("/")}`,
      status: "draft", calculationVersion: core.VERSION, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      input: {
        clientId: "", clientName: "", caseId: "", caseName: "", caseNumber: "", judgmentDate: "", periodStartDate: "", clientParty: null, opposingParty: null, additionalParties: [], clientRole: "Autor", clientPartyRole: "Autor", parties: [], calculationDate: now,
        items: [blankItem()], settings: { correctionType: "none", correctionProrata: true, interestRate: 0, interestPeriodicity: "monthly", interestProrata: true, penaltyRate: 0, feeRate: 0, feeType: "percent", feeAmount: 0 },
        penalties: [], fees: [], costs: [], notes: "",
      }, indexSnapshot: null, result: null,
    };
  }
  function clientOptions(selected) {
    return `<option value="">Selecione um cliente</option>${(financeData.clients || []).map((client) => `<option value="${escape(client.id)}" ${String(selected || "") === String(client.id) ? "selected" : ""}>${escape(finance.clientLabel(client))}</option>`).join("")}`;
  }
  function caseOptions(clientId, selected) {
    const cases = finance?.casesForClient(financeData, clientId) || [];
    return `<option value="">Nenhum caso vinculado</option>${cases.map((item) => `<option value="${escape(item.id)}" ${String(selected || "") === String(item.id) ? "selected" : ""}>${escape(finance.caseLabel(item))}</option>`).join("")}`;
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
  function additionalPartyOptions(selected) { const context = caseContextApi?.partyContext(financeData, current.input, finance) || {}; const clientName = context.clientParty?.name || ""; return `<option value="manual" ${selected === "manual" ? "selected" : ""}>Preencher manualmente</option>${(context.caseParties || []).filter((party) => party.name !== clientName).map((party) => `<option value="case:${escape(party.id)}" ${selected === `case:${party.id}` ? "selected" : ""}>Importar: ${escape(party.name)} — ${escape(party.role)}</option>`).join("")}`; }
  function removeImportedAdditionalParties() { current.input.additionalParties = (current.input.additionalParties || []).filter((party) => party.source !== "case"); }
  function additionalPartiesHtml() { return `<section class="party-manager" aria-labelledby="additional-parties-title"><div class="party-manager-head"><div><h3 id="additional-parties-title">Partes adicionais</h3><p class="hint">Importe do processo ou inclua manualmente quando necessário.</p></div><button class="link-button" type="button" data-action="add-additional">＋ Adicionar parte adicional</button></div><div class="party-list">${(current.input.additionalParties || []).map((party, index) => { const source = party.source === "case" ? `case:${party.sourceId}` : "manual"; const imported = party.source === "case"; return `<div class="party-row" data-additional-index="${index}"><select data-additional-field="source" aria-label="Origem da parte adicional">${additionalPartyOptions(source)}</select><input data-additional-field="name" aria-label="Nome da parte adicional ${index + 1}" value="${escape(party.name)}" placeholder="Nome da parte" ${imported ? "readonly" : ""}><input data-additional-field="role" aria-label="Polo da parte adicional ${index + 1}" value="${escape(party.role)}" placeholder="Polo" ${imported ? "readonly" : ""}><button class="danger small" type="button" data-action="remove-additional" data-index="${index}" aria-label="Remover parte adicional">×</button></div>`; }).join("")}</div></section>`; }
  function basicFields() {
    const i = current.input, role = i.clientRole || i.clientPartyRole || "Autor", opposingRole = caseContextApi?.oppositeRole(role) || "Réu";
    const calculationField = complete
      ? `${field("Data do trânsito em julgado ou início do período", "periodStartDate", i.periodStartDate || i.judgmentDate, "date")}<p class="hint field full">Use este campo também em execução de título extrajudicial, quando não houver trânsito em julgado. O início pode ser ajustado em cada lançamento.</p>${field("Data-base do cálculo", "calculationDate", i.calculationDate, "date", "", true)}`
      : field("Data-base do cálculo", "calculationDate", i.calculationDate, "date", "", true);
    return `${financeNotice()}<section class="form-section"><div class="section-heading"><div><h2>Identificação</h2><p class="hint">Nomeie o cálculo e vincule-o ao cliente e ao caso, se houver.</p></div></div><div class="form-grid">${field("Nome do cálculo", "name", current.name, "text", "full", true)}<div class="field"><label class="required" for="clientId">Cliente</label><select id="clientId" required>${clientOptions(i.clientId)}</select></div><div class="field"><label for="caseId">Caso / processo (opcional)</label><select id="caseId">${caseOptions(i.clientId, i.caseId)}</select></div>${field("Número do processo", "caseNumber", i.caseNumber, "text", "full")}</div></section><section class="form-section"><div class="section-heading"><div><h2>Partes</h2><p class="hint">Defina o polo do cliente e a parte contrária antes de incluir terceiros.</p></div></div><div class="form-grid"><div class="field"><label>Parte principal — cliente<input id="clientPartyName" value="${escape(i.clientParty?.name || i.clientName || "")}" readonly></label></div><div class="field"><label class="required" for="clientPartyRole">Polo do cliente</label><select id="clientPartyRole" required>${["Autor", "Réu", "Credor", "Devedor"].map((item) => `<option ${role === item ? "selected" : ""}>${item}</option>`).join("")}</select></div>${field(`Parte contrária — ${opposingRole}`, "opposingPartyName", i.opposingParty?.name || "", "text", "full", true)}<div class="field full">${additionalPartiesHtml()}</div></div></section><section class="form-section"><div class="section-heading"><div><h2>Referência do cálculo</h2><p class="hint">Informe a data que será usada como referência nesta memória.</p></div></div><div class="form-grid">${calculationField}</div></section>`;
  }
  function easyStep() {
    const i = current.input, s = i.settings;
    return `${basicFields(false)}<section class="form-section"><div class="section-heading"><div><h2>Critérios de atualização</h2><p class="hint">Defina índices, juros, multa e honorários antes de lançar as parcelas.</p></div></div><div class="form-grid generalista-criteria"><div class="field"><label class="required" for="correctionType">Índice para corrigir os valores</label><select id="correctionType">${indexOptions(s.correctionType)}</select></div><label class="check field"><input id="correctionProrata" type="checkbox" ${s.correctionProrata ? "checked" : ""}><span>Correção pró-rata</span></label>${field("Taxa de juros (%)", "interestRate", s.interestRate, "number", "", false)}<div class="field"><label for="interestPeriodicity">Periodicidade</label><select id="interestPeriodicity">${periodicityOptions(s.interestPeriodicity)}</select></div><label class="check field"><input id="interestProrata" type="checkbox" ${s.interestProrata ? "checked" : ""}><span>Juros pró-rata</span></label>${field("Multa (%)", "penaltyRate", s.penaltyRate, "number")}<label class="check field"><input id="penaltyOnInterest" type="checkbox" ${s.penaltyOnInterest ? "checked" : ""}><span>Multa incide sobre juros</span></label>${field("Valor dos honorários", s.feeType === "fixed" ? "feeAmount" : "feeRate", s.feeType === "fixed" ? s.feeAmount : s.feeRate, "number")}<div class="field"><label for="feeType">Tipo de aplicação</label><select id="feeType"><option value="percent" ${s.feeType !== "fixed" ? "selected" : ""}>Percentual (%)</option><option value="fixed" ${s.feeType === "fixed" ? "selected" : ""}>Fixo (R$)</option></select></div><div class="field full"><button class="secondary" type="button" data-action="load-indices">${current.indexSnapshot ? "Atualizar índices oficiais" : "Carregar índices oficiais"}</button><span class="hint">Os percentuais consultados são congelados no rascunho para auditoria.</span></div></div></section><section class="items-section form-section"><div class="card-title"><div><h2>Detalhamento dos itens</h2><p class="hint">Inclua débitos e abatimentos na ordem em que ocorreram.</p></div><button class="secondary" type="button" data-action="add-item">＋ Adicionar parcela</button></div>${itemsTable(false)}</section>`;
  }
  function itemCell(label, content, cls = "") {
    return `<label class="item-cell ${cls}"><span>${label}</span>${content}</label>`;
  }
  function itemStatic(label, content, cls = "") {
    return `<div class="item-cell item-static ${cls}"><span>${label}</span><strong>${content}</strong></div>`;
  }
  function itemIndex(index) {
    return `<div class="item-index"><span>${index + 1}</span>${index ? `<button class="danger small" type="button" data-action="remove-item" data-index="${index}" aria-label="Remover item">×</button>` : ""}</div>`;
  }
  function itemFields(item, index, detailed) {
    const interestType = item.interestType || (Number(item.interestRate) ? "fixed" : "none");
    const periodStart = current.input.periodStartDate || current.input.judgmentDate || item.date;
    const periodEnd = current.input.calculationDate || today();
    const mainFields = `${itemIndex(index)}${itemCell("Descrição", `<input data-item-field="description" aria-label="Descrição do item ${index + 1}" value="${escape(item.description)}" placeholder="Descrição do item">`)}${itemCell("Data", `<input data-item-field="date" aria-label="Data do item ${index + 1}" type="date" value="${escape(item.date)}" required>`)}${itemCell("Valor (R$)", `<input data-item-field="amount" aria-label="Valor do item ${index + 1}" type="number" min="0" step="0.01" value="${escape(item.amount)}" placeholder="0,00" required>`)}${itemCell("Tipo", `<select data-item-field="kind" aria-label="Tipo do item ${index + 1}">${typeOptions(item.kind)}</select>`)}`;
    if (!detailed) return `<article class="item-row" data-item-index="${index}"><div class="item-main-grid item-main-grid-simple">${mainFields}</div></article>`;
    const correctionFields = `${itemCell("Início da correção", `<input data-item-field="correctionStart" aria-label="Início da correção do item ${index + 1}" type="date" value="${escape(item.correctionStart || periodStart)}">`)}${itemCell("Fim da correção", `<input data-item-field="correctionEnd" aria-label="Fim da correção do item ${index + 1}" type="date" value="${escape(item.correctionEnd || periodEnd)}">`)}<label class="check compact item-check"><input data-item-field="correctionProrata" type="checkbox" ${item.correctionProrata ? "checked" : ""}><span>Correção pró-rata</span></label>`;
    const interestFields = `${itemCell("Juros", `<select data-item-field="interestType" aria-label="Tipo de juros do item ${index + 1}">${interestTypeOptions(interestType)}</select>`, "item-interest-choice")}${interestType === "fixed" ? itemCell("Taxa de juros (%)", `<input data-item-field="interestRate" aria-label="Juros do item ${index + 1}" type="number" min="0" step="0.0001" value="${escape(item.interestRate)}" placeholder="0,0000">`) : interestType === "legal" ? itemStatic("Taxa aplicada", "Lei 14.905/2024", "item-legal-rate") : itemStatic("Taxa aplicada", "Não aplicada", "item-no-rate")}${interestType === "fixed" ? itemCell("Periodicidade", `<select data-item-field="interestPeriodicity" aria-label="Periodicidade do item ${index + 1}">${periodicityOptions(item.interestPeriodicity)}</select>`) : itemStatic("Periodicidade", interestType === "legal" ? "Mensal" : "—")}${itemCell("Início dos juros", `<input data-item-field="interestStart" aria-label="Início dos juros do item ${index + 1}" type="date" value="${escape(item.interestStart || periodStart)}">`)}${itemCell("Fim dos juros", `<input data-item-field="interestEnd" aria-label="Fim dos juros do item ${index + 1}" type="date" value="${escape(item.interestEnd || periodEnd)}">`)}${interestType === "legal" ? itemStatic("Pró-rata", "Dias corridos", "item-legal-rate") : `<label class="check compact item-check"><input data-item-field="interestProrata" type="checkbox" ${item.interestProrata ? "checked" : ""}><span>Juros pró-rata</span></label>`}`;
    return `<article class="item-row item-detailed" data-item-index="${index}"><div class="item-main-grid">${mainFields}${itemCell("Índice de correção", `<select data-item-field="correctionType" aria-label="Índice do item ${index + 1}">${indexOptions(item.correctionType)}</select>`, "item-index-choice")}</div><section class="item-subsection" aria-labelledby="item-${index}-correction-title"><div class="item-subsection-head"><h3 id="item-${index}-correction-title">Correção monetária</h3><span>Período e pró-rata</span></div><div class="item-subgrid correction-grid">${correctionFields}</div></section><section class="item-subsection" aria-labelledby="item-${index}-interest-title"><div class="item-subsection-head"><h3 id="item-${index}-interest-title">Juros</h3><span>Taxa e período de incidência</span></div><div class="item-subgrid interest-grid">${interestFields}</div></section></article>`;
  }
  function itemsTable(detailed) {
    return `<div class="generalista-items ${detailed ? "detailed" : ""}">${current.input.items.map((item, index) => itemFields(item, index, detailed)).join("")}</div>`;
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
  function ledgerType(item) { return item.sign < 0 ? "Abatimento" : item.kind === "cost" ? "Custas" : "Débito"; }
  function ledgerCard(item) {
    return `<article class="result-ledger-card" role="listitem"><div class="result-ledger-head"><strong>${escape(item.description)}</strong><span class="result-kind">${ledgerType(item)}</span></div><dl class="result-ledger-values"><div><dt>Data</dt><dd>${formatDate(item.date)}</dd></div><div><dt>Original</dt><dd>${formatMoney(item.original)}</dd></div><div><dt>Correção</dt><dd>${formatMoney(item.correction)}</dd></div><div><dt>Juros</dt><dd>${formatMoney(item.interest)}</dd></div><div class="result-total"><dt>Total</dt><dd><strong>${formatMoney(item.total)}</strong></dd></div></dl></article>`;
  }
  function chargeCard(item, type) {
    return `<article class="result-charge-card" role="listitem"><strong>${escape(item.description)}</strong><span>${type}</span><strong>${formatMoney(item.amount)}</strong></article>`;
  }
  function resultStep() {
    const r = current.result;
    if (!r) return '<div class="empty">Calcule os dados para visualizar o resultado.</div>';
    const totals = [["Valor original", r.totals.original], ["Correção", r.totals.correction], ["Juros", r.totals.interest], ["Multa", r.totals.penalty], ["Honorários", r.totals.fees], ["Custas", r.totals.costs], ["Total atualizado", r.totals.total]];
    const charges = [...r.penaltyRows.map((item) => ({ ...item, type: "Multa" })), ...r.feeRows.map((item) => ({ ...item, type: "Honorários" }))];
    return `<p class="hint">Data-base: ${formatDate(r.calculationDate)}</p><div class="summary">${totals.map(([label, value], index) => `<div class="metric ${index === totals.length - 1 ? "total" : ""}"><span>${label}</span><strong>${formatMoney(value)}</strong></div>`).join("")}</div><h2>Memória por lançamento</h2><div class="result-ledger" role="list">${r.ledger.map(ledgerCard).join("")}</div>${charges.length ? `<h2>Encargos adicionais</h2><div class="result-charges" role="list">${charges.map((item) => chargeCard(item, item.type)).join("")}</div>` : ""}<p class="legal-note">${escape(r.methodology.correctionConvention)} ${escape(r.methodology.interestConvention)} Confirme o título judicial, os termos iniciais e o índice aplicável ao caso concreto.</p>`;
  }
  function render() {
    const content = complete ? [completeStepOne, completeStepTwo, completeStepThree, resultStep][step - 1]() : [easyStep, resultStep][step - 1]();
    const last = complete ? 4 : 2;
    app.innerHTML = `<section class="panel wizard-head"><p class="eyebrow">Generalista</p><h1>Atualização monetária ${complete ? "completa" : "simples"}</h1><p class="hint">${escape(current.code)} • versão ${escape(current.calculationVersion)}</p>${steps()}<form id="generalista-form">${content}<div class="wizard-actions"><button class="secondary" type="button" data-action="${step === 1 ? "cancel" : "back"}">${step === 1 ? "Cancelar" : "Voltar"}</button><div>${step < last ? `<button class="secondary" type="button" data-action="save">Salvar rascunho</button><button class="primary" type="submit">${step === last - 1 ? "Calcular" : "Próximo"}</button>` : `<button class="secondary" type="button" data-action="save">Salvar</button><button class="primary" type="button" data-action="pdf">Gerar PDF</button>`}</div></div></form></section>`;
    app.focus({ preventScroll: true });
  }
  function captureAdditionalParties() { const context = caseContextApi?.partyContext(financeData, current.input, finance) || {}; current.input.additionalParties = [...document.querySelectorAll("[data-additional-index]")].map((row) => { const source = row.querySelector('[data-additional-field="source"]')?.value || "manual"; const selected = source.startsWith("case:") ? (context.caseParties || []).find((party) => String(party.id) === source.slice(5)) : null; if (source.startsWith("case:")) return selected ? { ...selected, source: "case", sourceId: selected.sourceId || selected.id } : null; return { id: row.dataset.additionalIndex || uid(), name: row.querySelector('[data-additional-field="name"]')?.value.trim() || "", role: row.querySelector('[data-additional-field="role"]')?.value.trim() || "", source: "manual", sourceId: "" }; }).filter(Boolean); }
  function captureBasic() {
    const name = document.querySelector("#name")?.value.trim();
    const clientId = document.querySelector("#clientId")?.value || "";
    if (name !== undefined) current.name = name;
    current.input.clientId = clientId;
    current.input.clientName = finance.clientLabel(finance.findClient(financeData, clientId));
    current.input.caseId = document.querySelector("#caseId")?.value || "";
    current.input.clientPartyRole = document.querySelector("#clientPartyRole")?.value || current.input.clientPartyRole || "Autor";
    current.input.clientRole = current.input.clientPartyRole;
    current.input.opposingPartyName = document.querySelector("#opposingPartyName")?.value.trim() || "";
    const context = caseContextApi?.partyContext(financeData, current.input, finance) || {};
    caseContextApi?.applyCaseContext(current.input, context);
    current.input.clientParty = context.clientParty;
    current.input.opposingParty = { ...(current.input.opposingParty || {}), name: current.input.opposingPartyName, role: context.opposingRole, source: "manual", sourceId: "" };
    current.input.parties = [current.input.clientParty, current.input.opposingParty].filter((party) => party?.name).concat(current.input.additionalParties || []);
    if (current.input.caseId && !context.caseId) throw new Error("Selecione um caso pertencente ao cliente escolhido.");
    if (document.querySelector("#caseNumber")) current.input.caseNumber = document.querySelector("#caseNumber").value.trim();
    if (document.querySelector("#periodStartDate")) {
      current.input.periodStartDate = document.querySelector("#periodStartDate").value;
      current.input.judgmentDate = current.input.periodStartDate;
    } else if (document.querySelector("#judgmentDate")) {
      current.input.judgmentDate = document.querySelector("#judgmentDate").value;
      current.input.periodStartDate = current.input.judgmentDate;
    }
    if (document.querySelector("#calculationDate")) current.input.calculationDate = document.querySelector("#calculationDate").value;
    captureAdditionalParties();
    current.input.parties = [current.input.clientParty, current.input.opposingParty].filter((party) => party?.name).concat(current.input.additionalParties || []);
    if (!current.name || !clientId || !current.input.opposingParty.name) throw new Error("Preencha o nome do cálculo, cliente, polo do cliente e parte contrária.");
    if (!current.input.calculationDate) throw new Error("Informe a data-base do cálculo.");
    if (current.input.periodStartDate && current.input.periodStartDate > current.input.calculationDate) throw new Error("O início do período não pode ser posterior à data-base.");
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
    current.input.items.forEach((item) => { item.correctionType = s.correctionType; item.correctionProrata = s.correctionProrata; item.interestType = s.interestRate ? "fixed" : "none"; item.interestRate = s.interestRate; item.interestPeriodicity = s.interestPeriodicity; item.interestProrata = s.interestProrata; });
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
  function itemInterestType(item) {
    return item.interestType || (Number(item.interestRate) ? "fixed" : "none");
  }
  function legalInterestSelected() {
    return current.input.items.some((item) => itemInterestType(item) === "legal");
  }
  function indexCriteriaKey() {
    const periodStart = current.input.periodStartDate || current.input.judgmentDate || "";
    return JSON.stringify({
      calculationDate: current.input.calculationDate || "",
      periodStart,
      items: current.input.items.map((item) => ({
        date: item.date || "",
        correctionType: item.correctionType || "none",
        correctionStart: item.correctionStart || "",
        correctionEnd: item.correctionEnd || "",
        interestType: itemInterestType(item),
        interestStart: item.interestStart || "",
        interestEnd: item.interestEnd || "",
      })),
      costs: current.input.costs.map((item) => ({
        date: item.date || "",
        correctionType: item.correctionType || "none",
      })),
    });
  }
  function officialIndicesRequired() {
    return indexTypes().length > 0 || legalInterestSelected();
  }
  function legalRatesRequired() {
    const legalStart = indices?.LEGAL_RATE_START_MONTH || "2024-08";
    return legalInterestSelected() && String(current.input.calculationDate || "").slice(0, 7) >= legalStart;
  }
  function indexSnapshotMatchesCurrent() {
    const snapshot = current.indexSnapshot;
    if (!snapshot || snapshot.criteriaKey !== indexCriteriaKey()) return false;
    if (indexTypes().some((type) => !Object.keys(snapshot.ratesByType?.[type] || {}).length)) return false;
    if (legalRatesRequired() && !Object.keys(snapshot.legalRates || {}).length) return false;
    return true;
  }
  async function loadIndices() {
    captureVisible();
    const types = indexTypes();
    const legalSelected = legalInterestSelected();
    if (!types.length && !legalSelected) { current.indexSnapshot = null; notify("Nenhum índice externo foi selecionado."); return; }
    if (!indices?.snapshot) throw new Error("O módulo de índices oficiais não foi carregado.");
    const periodStart = current.input.periodStartDate || current.input.judgmentDate || "";
    const dates = [
      ...current.input.items.flatMap((item) => [item.date, item.correctionStart || periodStart, item.interestStart || periodStart]),
      ...current.input.costs.map((item) => item.date),
    ].filter(Boolean).sort();
    const start = dates[0] || current.input.calculationDate, end = current.input.calculationDate;
    const criteriaKey = indexCriteriaKey();
    busy = true;
    try {
      const correctionSnapshots = await Promise.all(types.map((type) => indices.snapshot({ correctionType: type, interestType: "none", start, end })));
      const legalSnapshot = legalSelected ? await indices.snapshot({ correctionType: "none", interestType: "legal", start, end }) : null;
      const snapshots = [...correctionSnapshots, ...(legalSnapshot ? [legalSnapshot] : [])];
      current.indexSnapshot = { criteriaKey, fetchedAt: new Date().toISOString(), start, end, ratesByType: Object.fromEntries(types.map((type, index) => [type, correctionSnapshots[index]?.correctionRates || {}])), legalRates: legalSnapshot?.legalRates || {}, sources: snapshots.flatMap((item) => item.sources || []) };
      persist("draft"); notify("Índices oficiais carregados e congelados neste rascunho.");
    } finally { busy = false; syncStatus.refresh?.(); }
    render();
  }
  async function ensureIndices() {
    if (!officialIndicesRequired() || indexSnapshotMatchesCurrent()) return;
    await loadIndices();
    if (!indexSnapshotMatchesCurrent()) throw new Error("Os índices oficiais necessários não foram carregados para o período informado.");
  }
  async function calculate() {
    captureVisible();
    await ensureIndices();
    current.result = core.calculateGeneric({ ...current.input, ratesByType: current.indexSnapshot?.ratesByType || {}, legalRates: current.indexSnapshot?.legalRates || {} });
    persist("final"); step = complete ? 4 : 2; notify("Cálculo concluído.");
  }
  async function makePdf() {
    if (!pdf?.create || !pdf.download) throw new Error("O gerador de PDF generalista não foi carregado.");
    busy = true;
    notify("Gerando PDF…");
    try { const file = await pdf.create(current); pdf.download(file); notify("PDF gerado."); }
    catch (error) { notify(error.message || "Falha ao gerar PDF.", true); }
    finally { busy = false; }
  }
  function addExtra(kind) { captureVisible(); const list = kind === "penalty" ? current.input.penalties : kind === "fee" ? current.input.fees : current.input.costs; list.push(kind === "cost" ? { id: uid(), amount: 0, date: today(), description: "Custas processuais", correctionType: "none" } : { id: uid(), rate: 0, description: kind === "fee" ? "Honorários" : "Multa", type: "percent", onInterest: false }); render(); }
  const sync = syncFactory.create({ storage, gistSettings, gistClient, access, getData: () => data, setData: (value) => { data = value; }, setStatus: (message) => { window.OfficeJurCloudStatus?.fromMessage(syncStatus, message); }, notify });
  function showBlocked() {
    localAccessAllowed = false;
    data = storage.normalize({});
    window.OfficeJurLocalAccessBlocked?.render({
      container: app,
      settingsHref: "../../configuracoes/",
      statusElement: syncStatus,
      footer: document.querySelector("office-site-footer"),
    });
  }
  access?.subscribe((lease) => {
    if (["stale", "unverified", "purging", "purged"].includes(lease.phase)) showBlocked();
  });
  app.addEventListener("change", (event) => {
    if (event.target.id === "clientId") {
      try { captureAdditionalParties(); captureBasic(); } catch (_) { current.name = document.querySelector("#name")?.value || current.name; }
      current.input.clientId = event.target.value;
      current.input.clientName = "";
      current.input.caseId = "";
      current.input.caseName = "";
      current.input.caseNumber = "";
      removeImportedAdditionalParties();
      const context = caseContextApi?.partyContext(financeData, current.input, finance) || {};
      caseContextApi?.applyCaseContext(current.input, context);
      current.input.clientParty = context.clientParty;
      render();
      return;
    }
    if (event.target.id === "caseId") {
      try { captureAdditionalParties(); captureBasic(); } catch (_) { current.name = document.querySelector("#name")?.value || current.name; }
      removeImportedAdditionalParties();
      current.input.caseId = event.target.value;
      const context = caseContextApi?.partyContext(financeData, current.input, finance) || {};
      caseContextApi?.applyCaseContext(current.input, context);
      current.input.clientParty = context.clientParty;
      render();
      return;
    }
    if (event.target.id === "clientPartyRole") {
      try { captureBasic(); } catch (_) { current.input.clientPartyRole = event.target.value; }
      current.input.clientPartyRole = event.target.value;
      current.input.clientRole = event.target.value;
      render();
      return;
    }
    if (event.target.dataset.additionalField === "source") {
      try { captureBasic(); } catch (_) { captureAdditionalParties(); }
      render();
      return;
    }
    if (event.target.dataset.itemField === "interestType") {
      try { captureVisible(); } catch (_) { /* preserva a edição enquanto a linha muda de campos */ }
      render();
      return;
    }
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
      if (action === "pdf") { await makePdf(); return; }
      if (action === "load-indices") { await loadIndices(); return; }
      if (action === "add-item") { captureVisible(); current.input.items.push(blankItem()); render(); return; }
      if (action === "remove-item") { captureVisible(); current.input.items.splice(Number(target.dataset.index), 1); render(); return; }
      if (action === "add-additional") { try { captureBasic(); } catch (_) { captureAdditionalParties(); } current.input.additionalParties.push({ id: uid(), name: "", role: "", source: "manual", sourceId: "" }); render(); return; }
      if (action === "remove-additional") { try { captureBasic(); } catch (_) { captureAdditionalParties(); } current.input.additionalParties.splice(Number(target.dataset.index), 1); render(); return; }
      if (action === "add-extra") { addExtra(target.dataset.kind); return; }
      if (action === "remove-extra") { captureVisible(); const list = target.dataset.kind === "penalty" ? current.input.penalties : target.dataset.kind === "fee" ? current.input.fees : current.input.costs; list.splice(Number(target.dataset.index), 1); render(); }
    } catch (error) { notify(error.message || "Não foi possível atualizar o cálculo.", true); }
  });
  app.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    try {
      const last = complete ? 4 : 2;
      if (step < last - 1) { captureVisible(); step += 1; render(); }
      else if (step === last - 1) await calculate();
      render();
    } catch (error) { notify(error.message || "Não foi possível concluir o cálculo.", true); }
  });
  function loadRequestedRecord() {
    const requested = new URLSearchParams(window.location.search).get("id");
    if (!requested) return;
    const found = data.records.find((item) => item.id === requested && item.type === mode);
    if (!found) { notify("Cálculo não encontrado.", true); return; }
    current = structuredClone(found);
    current.input.periodStartDate ||= current.input.judgmentDate || "";
    current.input.items = (current.input.items || []).map((item) => ({ ...item, interestType: item.interestType || (Number(item.interestRate) ? "fixed" : "none") }));
    if (new URLSearchParams(window.location.search).get("pdf") === "1" && current.result) setTimeout(() => void makePdf(), 300);
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
