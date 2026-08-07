(() => {
  "use strict";
  const app = document.querySelector("#app"), toast = document.querySelector("#toast"), syncStatus = document.querySelector("#sync-status");
  const core = window.OfficeJurCalculations, storageApi = window.OfficeJurCalculationStorage;
  const financeApi = window.OfficeJurCalculationFinance;
  const indices = window.OfficeJurLegalIndices, pdf = window.OfficeJurCalculationPdf;
  const gistSettings = window.OfficeJurGistSettings, gistClient = window.OfficeJurGistClient;
  const access = window.OfficeJurGistAccessLease?.create();
  const syncFactory = window.OfficeJurCalculationSync;
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const today = () => {
    const value = new Date();
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  };
  const uid = () => crypto.randomUUID();
  const money = (value) => core.currency(Number(value || 0));
  const pensionVersion = (value) => {
    const version = String(value || core.CALCULATION_VERSION);
    return /^\d/.test(version) ? `pension-${version}` : version;
  };
  let data = storageApi.normalize({}), financeData = financeApi?.empty() || { clients: [], cases: [], loaded: false },
    localAccessAllowed = true, step = 1, current = blank(), busy = false;
  const sync = syncFactory.create({
    storage: storageApi,
    gistSettings,
    gistClient,
    access,
    getData: () => data,
    setData: (value) => { data = value; },
    setStatus: (message) => { syncStatus.textContent = message; },
    notify,
  });

  function notify(message, error = false) {
    toast.textContent = message; toast.className = `toast${error ? " error" : ""}`; toast.hidden = false;
    clearTimeout(notify.timer); notify.timer = setTimeout(() => { toast.hidden = true; }, 6_000);
  }
  function setBusy(value, label = "Processando…") {
    busy = value;
    document.querySelectorAll("button").forEach((button) => { button.disabled = value; });
    if (value) syncStatus.textContent = label;
  }
  function clientName(clientId) {
    return financeApi?.clientLabel(financeApi.findClient(financeData, clientId)) || "Cliente não vinculado";
  }
  function caseName(caseId) {
    return financeApi?.caseLabel(financeApi.findCase(financeData, caseId)) || "Caso não vinculado";
  }
  function clientOptions(selected) {
    return `<option value="">Selecione um cliente</option>${(financeData.clients || []).map((client) =>
      `<option value="${escape(client.id)}" ${String(selected || "") === String(client.id) ? "selected" : ""}>${escape(financeApi.clientLabel(client))}</option>`).join("")}`;
  }
  function caseOptions(clientId, selected) {
    const cases = financeApi?.casesForClient(financeData, clientId) || [];
    return `<option value="">Nenhum caso vinculado</option>${cases.map((item) =>
      `<option value="${escape(item.id)}" ${String(selected || "") === String(item.id) ? "selected" : ""}>${escape(financeApi.caseLabel(item))}</option>`).join("")}`;
  }
  function financeNotice() {
    if (!financeData.loaded) return '<div class="finance-notice error"><strong>Não foi possível ler o Financeiro.</strong><span>Atualize a página para tentar novamente.</span></div>';
    if (!financeData.clients.length) return '<div class="finance-notice"><strong>Cadastre um cliente no Financeiro antes de criar o cálculo.</strong><a href="../../financeiro/" target="_blank" rel="noopener">Abrir Financeiro</a></div>';
    return "";
  }
  function basisLabel(input) {
    if (input.basisType === "minimum_wage") return `${input.percentage}% do salário mínimo nacional vigente em cada vencimento`;
    if (input.basisType === "income") return `${input.percentage}% da base mensal informada (${money(input.referenceIncome)})`;
    return `valor fixo de ${money(input.fixedAmount)}`;
  }
  const installmentSignature = (input) => JSON.stringify([
    input.startDate, input.endDate, input.basisType, Number(input.percentage || 0),
    Number(input.fixedAmount || 0), Number(input.referenceIncome || 0), !!input.includeThirteenth,
  ]);
  function blank() {
    const now = today();
    return {
      id: uid(), code: `OJ-CAL-${now.slice(0, 4)}-${uid().slice(0, 6).toUpperCase()}`,
      type: "pension", name: `Pensão — ${now.split("-").reverse().join("/")}`,
      status: "draft", calculationVersion: core.CALCULATION_VERSION, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      input: {
        clientId: "", clientName: "", caseId: "", caseName: "", creditor: "", debtor: "", caseNumber: "", notes: "", startDate: now, endDate: now, calculationDate: now,
        basisType: "minimum_wage", percentage: 30, fixedAmount: 0, referenceIncome: 0, includeThirteenth: false,
        installments: [], basisLabel: "",
        settings: {
          correctionType: "INPC", correctionRates: {}, interestType: "legal", legalRates: {},
          fixedMonthlyRate: 1, preLegalMonthlyRate: 1, penaltyRate: 0, feeRate: 0, feeBase: "total",
        },
      },
      indexSnapshot: null, result: null, dataHash: "",
    };
  }

  function steps() {
    const labels = [["Dados básicos", "partes e período"], ["Parcelas", "valores e abatimentos"], ["Critérios", "índices e encargos"], ["Resultado", "memória e PDF"]];
    return `<div class="wizard-steps steps-4">${labels.map((item, index) => `<button class="wizard-step ${step === index + 1 ? "active" : ""} ${step > index + 1 ? "done" : ""}" data-step="${index + 1}" ${index + 1 > step ? "disabled" : ""}><span>${index + 1}</span><div><strong>${item[0]}</strong><small>${item[1]}</small></div></button>`).join("")}</div>`;
  }
  const field = (label, name, value, type = "text", cls = "") => `<div class="field ${cls}"><label class="required" for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${escape(value)}" required></div>`;

  function stepOne() {
    const i = current.input;
    return `<div class="form-grid">
      ${field("Nome do cálculo", "name", current.name, "text", "full")}
      <div class="field"><label class="required" for="clientId">Cliente</label><select id="clientId" name="clientId" required>${clientOptions(i.clientId)}</select></div>
      <div class="field"><label for="caseId">Caso / processo (opcional)</label><select id="caseId" name="caseId">${caseOptions(i.clientId, i.caseId)}</select></div>
      ${field("Exequente / credor", "creditor", i.creditor)}
      ${field("Executado / devedor", "debtor", i.debtor)}
      ${field("Número do processo", "caseNumber", i.caseNumber, "text", "full")}
      ${field("Início das parcelas", "startDate", i.startDate, "date", "third")}
      ${field("Fim das parcelas", "endDate", i.endDate, "date", "third")}
      ${field("Data-base do cálculo", "calculationDate", i.calculationDate, "date", "third")}
      <div class="field"><label class="required" for="basisType">Forma estipulada</label><select id="basisType" name="basisType">
        <option value="minimum_wage" ${i.basisType === "minimum_wage" ? "selected" : ""}>Percentual do salário mínimo</option>
        <option value="fixed" ${i.basisType === "fixed" ? "selected" : ""}>Valor fixo mensal</option>
        <option value="income" ${i.basisType === "income" ? "selected" : ""}>Percentual de base informada</option>
      </select></div>
      <div class="field">${i.basisType === "fixed" ? '<label for="fixedAmount" class="required">Valor mensal (R$)</label><input id="fixedAmount" name="fixedAmount" type="number" min="0" step="0.01" value="' + escape(i.fixedAmount) + '">' :
        '<label for="percentage" class="required">Percentual (%)</label><input id="percentage" name="percentage" type="number" min="0" step="0.0001" value="' + escape(i.percentage) + '">'}</div>
      ${i.basisType === "income" ? field("Base mensal informada (R$)", "referenceIncome", i.referenceIncome, "number", "full") : ""}
      <label class="check field full"><input name="includeThirteenth" type="checkbox" ${i.includeThirteenth ? "checked" : ""}><span>Incluir parcela anual de 13º em dezembro, quando prevista no título.</span></label>
      <div class="field full"><label for="notes">Observações do título ou decisão</label><textarea id="notes" name="notes">${escape(i.notes)}</textarea></div>
      ${financeNotice()}
    </div>`;
  }

  function paymentHtml(item, payment, index) {
    return `<div class="payment-row"><input aria-label="Data do abatimento" type="date" data-payment-date="${item.id}:${index}" value="${escape(payment.date)}">
      <input aria-label="Valor do abatimento" type="number" min="0" step="0.01" data-payment-amount="${item.id}:${index}" value="${escape(payment.amount)}">
      <button class="danger" type="button" data-remove-payment="${item.id}:${index}" aria-label="Remover abatimento">×</button></div>`;
  }
  function stepTwo() {
    return `<p class="legal-note">Confira cada obrigação com o título judicial. Valores podem ser ajustados individualmente. Abatimentos são atualizados da data do pagamento até a data-base pela mesma regra aplicada à dívida.</p>
      <div class="table-wrap"><table><thead><tr><th>Vencimento</th><th>Descrição</th><th>Valor devido</th><th>Abatimentos</th></tr></thead><tbody>
      ${current.input.installments.map((item) => `<tr><td><input type="date" data-due="${item.id}" value="${item.dueDate}"></td>
        <td><input type="text" data-description="${item.id}" value="${escape(item.description)}"></td>
        <td><input type="number" min="0" step="0.01" data-amount="${item.id}" value="${item.originalAmount}"></td>
        <td><div class="payments">${(item.payments || []).map((payment, index) => paymentHtml(item, payment, index)).join("")}
        <button class="secondary small" type="button" data-add-payment="${item.id}">+ Adicionar abatimento</button></div></td></tr>`).join("")}
      </tbody></table></div>`;
  }

  function stepThree() {
    const s = current.input.settings, snapshot = current.indexSnapshot;
    return `<div class="form-grid">
      <div class="field"><label class="required" for="correctionType">Correção monetária</label><select id="correctionType">
        <option value="INPC" ${s.correctionType === "INPC" ? "selected" : ""}>INPC (IBGE)</option>
        <option value="IPCA" ${s.correctionType === "IPCA" ? "selected" : ""}>IPCA (IBGE)</option>
        <option value="none" ${s.correctionType === "none" ? "selected" : ""}>Sem correção</option></select></div>
      <div class="field"><label class="required" for="interestType">Juros</label><select id="interestType">
        <option value="legal" ${s.interestType === "legal" ? "selected" : ""}>Taxa Legal — Lei 14.905/2024</option>
        <option value="fixed" ${s.interestType === "fixed" ? "selected" : ""}>Taxa mensal fixa</option>
        <option value="none" ${s.interestType === "none" ? "selected" : ""}>Sem juros</option></select></div>
      ${s.interestType === "fixed" ? field("Juros simples mensais (%)", "fixedMonthlyRate", s.fixedMonthlyRate, "number") : ""}
      ${s.interestType === "legal" && current.input.startDate < "2024-08-30" ? field("Taxa simples anterior a 30/08/2024 (% a.m.)", "preLegalMonthlyRate", s.preLegalMonthlyRate, "number") : ""}
      ${field("Multa sobre o débito atualizado (%)", "penaltyRate", s.penaltyRate, "number")}
      ${field("Honorários (%)", "feeRate", s.feeRate, "number")}
      <div class="field"><label for="feeBase">Base dos honorários</label><select id="feeBase"><option value="total" ${s.feeBase === "total" ? "selected" : ""}>Débito + multa</option><option value="corrected" ${s.feeBase === "corrected" ? "selected" : ""}>Principal corrigido</option></select></div>
      <div class="field full legal-note"><strong>Taxa Legal.</strong> Desde 30/08/2024, é a Selic descontado o IPCA, com piso zero. O OfficeJur reproduz a fórmula da Resolução CMN 5.171/2024 e aplica juros simples com pró-rata por dias corridos. Para período anterior, a taxa acima é uma premissa explícita e deve ser conferida conforme o título e o entendimento aplicável.</div>
      <div class="field full"><button class="secondary" type="button" data-action="indices">${snapshot ? "Atualizar séries oficiais" : "Carregar séries oficiais"}</button>
      <span class="hint">${snapshot ? `Séries congeladas em ${new Date(snapshot.fetchedAt).toLocaleString("pt-BR")} • ${Object.keys(snapshot.correctionRates || {}).length} índices • ${Object.keys(snapshot.legalRates || {}).length} Taxas Legais` : "Obrigatório antes de calcular quando houver correção ou Taxa Legal."}</span></div>
    </div>`;
  }

  function stepFour() {
    const r = current.result;
    return `<div class="legal-note">Resultado na data-base ${current.input.calculationDate.split("-").reverse().join("/")}. Revise os critérios antes de usar o demonstrativo em procedimento judicial.</div>
      <div class="summary">${[
        ["Principal líquido", r.totals.original], ["Correção monetária", r.totals.correction], ["Juros simples", r.totals.interest],
        ["Multa", r.totals.penalty], ["Honorários", r.totals.fees], ["Total atualizado", r.totals.total],
      ].map(([label, value], index) => `<div class="metric ${index === 5 ? "total" : ""}"><span>${label}</span><strong>${money(value)}</strong></div>`).join("")}</div>
      <div class="table-wrap"><table><thead><tr><th>Data</th><th>Lançamento</th><th>Original</th><th>Fator</th><th>Corrigido</th><th>Juros</th><th>Total</th></tr></thead><tbody>
      ${r.ledger.map((item) => `<tr><td>${item.date.split("-").reverse().join("/")}</td><td>${escape(item.description)}</td><td>${money(item.original)}</td><td>${item.correctionFactor.toFixed(8)}</td><td>${money(item.corrected)}</td><td>${item.interestRate.toFixed(6)}%<br>${money(item.interest)}</td><td><strong>${money(item.total)}</strong></td></tr>`).join("")}
      </tbody></table></div><p class="audit"><strong>Hash dos dados:</strong> ${escape(current.dataHash)}<br><strong>Código:</strong> ${escape(current.code)} • <strong>Versão:</strong> ${escape(pensionVersion(current.calculationVersion))}</p>`;
  }

  function wizardView() {
    app.innerHTML = `<section class="panel wizard-head"><p class="eyebrow">Família</p><h1>Pensão alimentícia</h1><p class="hint">${escape(current.code)} • versão ${escape(pensionVersion(current.calculationVersion))}</p>
      ${steps()}<form id="wizard-form">${step === 1 ? stepOne() : step === 2 ? stepTwo() : step === 3 ? stepThree() : stepFour()}
      <div class="wizard-actions"><button class="secondary" type="button" data-action="${step === 1 ? "catalog" : "back"}">${step === 1 ? "Cancelar" : "Voltar"}</button>
      <div>${step < 4 ? '<button class="secondary" type="button" data-action="save-draft">Salvar rascunho</button> ' : ""}
      ${step < 3 ? '<button class="primary" type="submit">Próximo</button>' : step === 3 ? '<button class="primary" type="submit">Calcular</button>' : '<button class="primary" type="button" data-action="pdf-current">Gerar PDF detalhado</button>'}</div></div></form></section>`;
  }

  function render() {
    wizardView();
    app.focus({ preventScroll: true });
  }

  function captureStepOne(form) {
    const formData = new FormData(form), i = current.input;
    const previousSignature = installmentSignature(i);
    current.name = String(formData.get("name") || "").trim();
    ["clientId", "caseId", "creditor", "debtor", "caseNumber", "startDate", "endDate", "calculationDate", "basisType", "notes"].forEach((key) => { i[key] = String(formData.get(key) || ""); });
    const selectedCase = financeApi?.findCase(financeData, i.caseId);
    if (i.caseId && (!selectedCase || String(selectedCase.clientId) !== String(i.clientId))) throw new Error("Selecione um caso pertencente ao cliente escolhido.");
    if (!i.clientId || !financeApi?.findClient(financeData, i.clientId)) throw new Error("Vincule o cálculo a um cliente do Financeiro.");
    i.clientName = financeApi.clientLabel(financeApi.findClient(financeData, i.clientId));
    i.caseName = selectedCase ? financeApi.caseLabel(selectedCase) : "";
    if (selectedCase?.number) i.caseNumber = String(selectedCase.number);
    i.percentage = Number(formData.get("percentage") || i.percentage || 0);
    i.fixedAmount = Number(formData.get("fixedAmount") || 0);
    i.referenceIncome = Number(formData.get("referenceIncome") || 0);
    i.includeThirteenth = formData.has("includeThirteenth");
    if (!current.name || !i.startDate || !i.endDate || !i.calculationDate) throw new Error("Preencha os campos obrigatórios.");
    if (i.calculationDate < i.endDate) throw new Error("A data-base não pode anteceder o fim das parcelas.");
    i.basisLabel = basisLabel(i);
    const nextSignature = installmentSignature(i);
    if (!i.installments.length || previousSignature !== nextSignature) i.installments = core.generateInstallments(i);
    current.indexSnapshot = null; current.result = null; current.dataHash = "";
  }
  function captureStepTwo() {
    current.input.installments.forEach((item) => {
      item.dueDate = document.querySelector(`[data-due="${item.id}"]`).value;
      item.description = document.querySelector(`[data-description="${item.id}"]`).value;
      item.originalAmount = Number(document.querySelector(`[data-amount="${item.id}"]`).value);
      (item.payments || []).forEach((payment, index) => {
        payment.date = document.querySelector(`[data-payment-date="${item.id}:${index}"]`).value;
        payment.amount = Number(document.querySelector(`[data-payment-amount="${item.id}:${index}"]`).value);
      });
    });
  }
  function captureStepThree() {
    const s = current.input.settings;
    ["correctionType", "interestType", "feeBase"].forEach((key) => { s[key] = document.querySelector(`#${key}`).value; });
    ["fixedMonthlyRate", "preLegalMonthlyRate", "penaltyRate", "feeRate"].forEach((key) => {
      const element = document.querySelector(`#${key}`); if (element) s[key] = Number(element.value || 0);
    });
  }
  function persist(record, status = record.status, touch = true) {
    if (!localAccessAllowed) return;
    try { access?.canSync(gistSettings.load().gistId); } catch (_) { showBlocked(); return; }
    if (touch) record.updatedAt = new Date().toISOString();
    record.status = status;
    const records = data.records.filter((item) => item.id !== record.id);
    data = storageApi.save({ ...data, records: [structuredClone(record), ...records] });
    void sync.toGist();
  }
  async function calculate() {
    captureStepThree();
    const s = current.input.settings;
    if ((s.correctionType !== "none" || s.interestType === "legal") && !current.indexSnapshot)
      throw new Error("Carregue as séries oficiais antes de calcular.");
    s.correctionRates = current.indexSnapshot?.correctionRates || {};
    s.legalRates = current.indexSnapshot?.legalRates || {};
    current.result = core.calculatePension(current.input);
    current.status = "final"; current.updatedAt = new Date().toISOString();
    current.dataHash = await core.hash({ ...current, dataHash: "", result: current.result });
    persist(current, "final", false);
  }

  async function loadIndices() {
    captureStepThree(); setBusy(true, "Consultando IBGE e Banco Central…");
    try {
      current.indexSnapshot = await indices.snapshot({
        correctionType: current.input.settings.correctionType, interestType: current.input.settings.interestType,
        start: current.input.startDate, end: current.input.calculationDate,
      });
      notify("Séries oficiais carregadas e congeladas no cálculo."); render();
    } catch (error) { notify(error.message, true); }
    finally { setBusy(false); }
  }
  async function makePdf(record) {
    setBusy(true, "Gerando PDF…");
    try {
      const file = await pdf.create(record); pdf.download(file);
      notify("PDF gerado com sucesso.");
    } catch (error) { notify(`Não foi possível gerar o PDF: ${error.message}`, true); }
    finally { setBusy(false); render(); }
  }

  async function syncFromGist() {
    await sync.fromGist();
  }
  app.addEventListener("change", (event) => {
    if (event.target.id === "clientId") {
      try { captureStepOne(document.querySelector("#wizard-form")); } catch (_) { /* A later submit will validate the complete form. */ }
      current.input.clientId = event.target.value;
      current.input.caseId = "";
      render();
    }
    if (event.target.id === "caseId") {
      try { captureStepOne(document.querySelector("#wizard-form")); } catch (_) { /* A later submit will validate the complete form. */ }
      current.input.caseId = event.target.value;
      const selectedCase = financeApi?.findCase(financeData, event.target.value);
      if (selectedCase?.number) current.input.caseNumber = String(selectedCase.number);
      render();
    }
    if (event.target.id === "basisType") {
      try { captureStepOne(document.querySelector("#wizard-form")); } catch (_) { current.input.basisType = event.target.value; }
      render();
    }
    if (event.target.id === "interestType" || event.target.id === "correctionType") {
      captureStepThree();
      current.indexSnapshot = null;
      render();
    }
  });
  app.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      if (step === 1) captureStepOne(event.target);
      if (step === 2) captureStepTwo();
      if (step === 3) { await calculate(); step = 4; }
      else step += 1;
      render();
    } catch (error) { notify(error.message, true); }
  });
  app.addEventListener("click", async (event) => {
    const target = event.target.closest("button"); if (!target || busy) return;
    const action = target.dataset.action;
    if (action === "catalog") { window.location.href = "../"; return; }
    if (action === "back") {
      if (step === 2) captureStepTwo();
      if (step === 3) captureStepThree();
      step -= 1; render();
    }
    if (target.dataset.step) {
      const targetStep = Number(target.dataset.step);
      if (targetStep < step) {
        if (step === 2) captureStepTwo();
        if (step === 3) captureStepThree();
        step = targetStep; render();
      }
    }
    if (action === "pdf-current") await makePdf(current);
    if (action === "indices") await loadIndices();
    if (action === "save-draft") {
      try {
        if (step === 1) captureStepOne(document.querySelector("#wizard-form"));
        if (step === 2) captureStepTwo();
        if (step === 3) captureStepThree();
        persist(current, current.result ? "final" : "draft"); notify("Cálculo salvo."); render();
      } catch (error) { notify(error.message, true); }
    }
    if (target.dataset.addPayment) {
      const item = current.input.installments.find((row) => row.id === target.dataset.addPayment);
      item.payments.push({ id: uid(), date: item.dueDate, amount: 0, description: "Abatimento" }); render();
    }
    if (target.dataset.removePayment) {
      const [id, index] = target.dataset.removePayment.split(":");
      const item = current.input.installments.find((row) => row.id === id); item.payments.splice(Number(index), 1); render();
    }
  });

  async function initialize() {
    localAccessAllowed = await access?.guard("calculos", () => { storageApi.clear(); data = storageApi.normalize({}); }) ?? true;
    if (!localAccessAllowed) { showBlocked(); return; }
    data = storageApi.load();
    try {
      financeData = await financeApi?.load?.() || { clients: [], cases: [], loaded: false };
    } catch (error) {
      financeData = { clients: [], cases: [], loaded: false };
      notify(`Não foi possível carregar os clientes do Financeiro: ${error.message}`, true);
    }
    await syncFromGist();
    if (!localAccessAllowed) { showBlocked(); return; }
    try { access?.canSync(gistSettings.load().gistId); } catch (_) { showBlocked(); return; }
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("id");
    if (requested) {
      const found = data.records.find((item) => item.id === requested && item.type === "pension");
      if (found) { current = structuredClone(found); step = current.result ? 4 : 1; }
      else notify("Cálculo de pensão não encontrado.", true);
    }
    render();
  }
  function showBlocked() {
    localAccessAllowed = false;
    data = storageApi.normalize({});
    app.innerHTML = '<section class="panel" role="alert"><h1>Acesso local bloqueado</h1><p>Os dados sincronizados deste navegador foram removidos. Atualize a credencial e sincronize novamente.</p><a class="primary button" href="../../configuracoes/">Abrir Configurações</a></section>';
    syncStatus.textContent = "Acesso local bloqueado";
  }
  access?.subscribe((lease) => {
    if (lease.phase === "purging" || lease.phase === "purged") showBlocked();
  });
  void initialize();
})();
