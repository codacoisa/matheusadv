(() => {
  "use strict";
  const app = document.querySelector("#app"), toast = document.querySelector("#toast"), syncStatus = document.querySelector("#sync-status");
  const core = window.OfficeJurCalculations, storageApi = window.OfficeJurCalculationStorage;
  const indices = window.OfficeJurLegalIndices, pdf = window.OfficeJurCalculationPdf;
  const gistSettings = window.OfficeJurGistSettings, gistClient = window.OfficeJurGistClient;
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const today = () => {
    const value = new Date();
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  };
  const uid = () => crypto.randomUUID();
  const money = (value) => core.currency(Number(value || 0));
  let data = storageApi.load(), view = "catalog", filter = "Todos", step = 1, current = null, busy = false;

  const calculators = [
    ["Pensão alimentícia", "Familiar", "Apure parcelas vencidas, abatimentos, atualização, juros e encargos.", true, '<path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.5a5.5 5.5 0 0 0 0-7.8Z"/>'],
    ["Divórcio e partilha", "Familiar", "Organize bens, dívidas, meação e quinhões.", false, '<circle cx="8" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><path d="M3 20c.4-4 2-6 5-6 1.7 0 3 .6 4 1.8M21 20c-.4-4-1.7-6-4-6-1.5 0-2.7.5-3.6 1.5M12 3v18"/>'],
    ["Atualização monetária", "Generalista", "Atualize créditos com índices e juros por períodos.", false, '<ellipse cx="7" cy="7" rx="4" ry="2.5"/><path d="M3 7v4c0 1.4 1.8 2.5 4 2.5s4-1.1 4-2.5V7M14 17l2.5 2.5L21 15M14 11h7v8"/>'],
    ["Revisão bancária", "Bancário", "Simule a evolução de contratos e encargos financeiros.", false, '<path d="m3 9 9-5 9 5M5 10v8M10 10v8M14 10v8M19 10v8M3 21h18"/>'],
    ["Superendividamento", "Consumidor", "Estruture renda, mínimo existencial e plano de pagamento.", false, '<path d="M4 7h16v12H4zM4 10h16M8 15h3"/><path d="M17 3v4M15 5h4"/>'],
    ["Aluguéis vencidos", "Imobiliário", "Atualize aluguéis, multas e encargos locatícios.", false, '<path d="m3 11 9-7 9 7v9H3zM9 20v-6h6v6"/><circle cx="18" cy="7" r="3"/><path d="M18 5.5V7l1 1"/>'],
    ["Verbas trabalhistas", "Trabalhista", "Calcule verbas rescisórias e reflexos.", false, '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M3 12h18M10 12v2h4v-2"/>'],
    ["Correção do FGTS", "Trabalhista", "Compare depósitos e critérios de atualização.", false, '<path d="M5 11a7 7 0 0 1 13-3h3v7h-3a7 7 0 0 1-5 4.8V22H9v-2H6v-3H4a2 2 0 0 1-2-2v-4h3Z"/><circle cx="13" cy="11" r="1"/>'],
    ["Dosimetria da pena", "Penal", "Documente as três fases da dosimetria.", false, '<path d="m14 4 6 6M12 6l6 6M4 20l8-8M3 21h8M15 3l6 6"/>'],
    ["Progressão de regime", "Penal", "Apure marcos e frações para progressão.", false, '<path d="M3 20h5v-5h5v-5h5V5h3"/><path d="m17 3 4 2-2 4"/>'],
    ["Contribuições previdenciárias", "Previdenciário", "Apure contribuições e limites previdenciários.", false, '<path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6l-8-3Z"/><path d="M12 8v8M8 12h8"/>'],
    ["Revisão do PASEP", "Bancário", "Organize lançamentos e critérios revisionais.", false, '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h6M9 16h4"/><circle cx="17" cy="17" r="3"/><path d="m19 19 2 2"/>'],
  ];
  const categories = ["Todos", ...new Set(calculators.map((item) => item[1]))];

  function notify(message, error = false) {
    toast.textContent = message; toast.className = `toast${error ? " error" : ""}`; toast.hidden = false;
    clearTimeout(notify.timer); notify.timer = setTimeout(() => { toast.hidden = true; }, 6_000);
  }
  function setBusy(value, label = "Processando…") {
    busy = value;
    document.querySelectorAll("button").forEach((button) => { button.disabled = value; });
    if (value) syncStatus.textContent = label;
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
        creditor: "", debtor: "", caseNumber: "", notes: "", startDate: now, endDate: now, calculationDate: now,
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

  function catalogView() {
    const cards = calculators.filter((item) => filter === "Todos" || item[1] === filter).map(([name, category, description, active, icon]) => `
      <article class="calculator-card">
        ${active ? "" : '<span class="badge soon">Em breve</span>'}
        <div class="card-meta">
          <span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icon}</svg></span>
          <span class="badge">${escape(category)}</span>
        </div>
        <h3>${escape(name)}</h3><p>${escape(description)}</p>
        <button class="${active ? "primary" : "secondary"}" data-action="${active ? "new" : "soon"}" ${active ? "" : "disabled"}>${active ? "Iniciar cálculo" : "Disponível em breve"}</button>
      </article>`).join("");
    app.innerHTML = `
      <section class="hero"><div><p class="eyebrow">Documentos técnicos e auditáveis</p><h1>Cálculos Jurídicos</h1>
      <p>Prepare memórias de cálculo reproduzíveis, salve versões e gere demonstrativos detalhados em PDF.</p></div>
      <button class="secondary" data-action="saved">Meus cálculos <span class="badge">${data.records.length}</span></button></section>
      <section><div class="catalog-head"><div><h2>Novo cálculo</h2><p class="hint">Escolha a matéria. Nesta primeira versão, a pensão alimentícia está disponível.</p></div></div>
      <div class="filters" role="group" aria-label="Filtrar calculadoras">${categories.map((item) => `<button class="filter ${filter === item ? "active" : ""}" data-filter="${escape(item)}">${escape(item)}</button>`).join("")}</div>
      <div class="catalog">${cards}</div></section>`;
  }

  function savedView() {
    app.innerHTML = `<section class="panel"><div class="saved-head"><div><p class="eyebrow">Histórico e versões</p><h1>Meus cálculos</h1>
    <p class="hint">Os cálculos podem ser reabertos, ajustados e exportados novamente.</p></div><button class="secondary" data-action="catalog">Novo cálculo</button></div>
    <div class="saved-list">${data.records.length ? data.records.map((record) => `
      <article class="saved-item"><div><span class="status ${record.status === "final" ? "final" : "draft"}">${record.status === "final" ? "Calculado" : "Rascunho"}</span>
      <h3>${escape(record.name)}</h3><p>${escape(record.code)} • atualizado ${new Date(record.updatedAt).toLocaleString("pt-BR")}${record.result ? ` • ${money(record.result.totals.total)}` : ""}</p></div>
      <div class="saved-actions"><button class="secondary small" data-action="edit" data-id="${record.id}">Editar</button>
      ${record.result ? `<button class="primary small" data-action="pdf" data-id="${record.id}">PDF</button>` : ""}
      <button class="danger small" data-action="delete" data-id="${record.id}">Excluir</button></div></article>`).join("") : '<div class="empty">Nenhum cálculo salvo ainda.</div>'}</div></section>`;
  }

  function steps() {
    const labels = [["Dados básicos", "partes e período"], ["Parcelas", "valores e abatimentos"], ["Critérios", "índices e encargos"], ["Resultado", "memória e PDF"]];
    return `<div class="steps">${labels.map((item, index) => `<button class="step ${step === index + 1 ? "active" : ""}" data-step="${index + 1}" ${index + 1 > step ? "disabled" : ""}><span>${index + 1}</span><div><strong>${item[0]}</strong><small>${item[1]}</small></div></button>`).join("")}</div>`;
  }
  const field = (label, name, value, type = "text", cls = "") => `<div class="field ${cls}"><label class="required" for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${escape(value)}" required></div>`;

  function stepOne() {
    const i = current.input;
    return `<div class="form-grid">
      ${field("Nome do cálculo", "name", current.name, "text", "full")}
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
      </tbody></table></div><p class="audit"><strong>Hash dos dados:</strong> ${escape(current.dataHash)}<br><strong>Código:</strong> ${escape(current.code)} • <strong>Versão:</strong> ${escape(current.calculationVersion)}</p>`;
  }

  function wizardView() {
    app.innerHTML = `<section class="panel wizard-head"><p class="eyebrow">Família</p><h1>Pensão alimentícia</h1><p class="hint">${escape(current.code)} • versão ${escape(current.calculationVersion)}</p>
      ${steps()}<form id="wizard-form">${step === 1 ? stepOne() : step === 2 ? stepTwo() : step === 3 ? stepThree() : stepFour()}
      <div class="wizard-actions"><button class="secondary" type="button" data-action="${step === 1 ? "catalog" : "back"}">${step === 1 ? "Cancelar" : "Voltar"}</button>
      <div>${step < 4 ? '<button class="secondary" type="button" data-action="save-draft">Salvar rascunho</button> ' : ""}
      ${step < 3 ? '<button class="primary" type="submit">Próximo</button>' : step === 3 ? '<button class="primary" type="submit">Calcular</button>' : '<button class="primary" type="button" data-action="pdf-current">Gerar PDF detalhado</button>'}</div></div></form></section>`;
  }

  function render() {
    if (view === "catalog") catalogView();
    if (view === "saved") savedView();
    if (view === "wizard") wizardView();
    app.focus({ preventScroll: true });
  }

  function captureStepOne(form) {
    const formData = new FormData(form), i = current.input;
    const previousSignature = installmentSignature(i);
    current.name = String(formData.get("name") || "").trim();
    ["creditor", "debtor", "caseNumber", "startDate", "endDate", "calculationDate", "basisType", "notes"].forEach((key) => { i[key] = String(formData.get(key) || ""); });
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
    if (touch) record.updatedAt = new Date().toISOString();
    record.status = status;
    const records = data.records.filter((item) => item.id !== record.id);
    data = storageApi.save({ ...data, records: [structuredClone(record), ...records] });
    void syncToGist();
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
    const settings = gistSettings.load();
    if (!settings.gistId || !settings.token) { syncStatus.textContent = "Dados locais"; return; }
    syncStatus.textContent = "Sincronizando…";
    try {
      const snapshot = await gistClient.gistSnapshot(settings.gistId, settings.token);
      const file = snapshot.gist.files?.[storageApi.FILE];
      if (file) data = storageApi.save(storageApi.merge(data, JSON.parse(await gistClient.text(file))));
      syncStatus.textContent = settings.autoSync ? "Gist sincronizado" : "Gist conectado";
    } catch (error) { syncStatus.textContent = "Falha na sincronização"; notify(error.message, true); }
  }
  async function syncToGist() {
    const settings = gistSettings.load();
    if (!settings.autoSync || !settings.gistId || !settings.token) return;
    syncStatus.textContent = "Salvando no Gist…";
    try {
      const snapshot = await gistClient.gistSnapshot(settings.gistId, settings.token);
      const remoteFile = snapshot.gist.files?.[storageApi.FILE];
      let merged = data;
      if (remoteFile) merged = storageApi.merge(data, JSON.parse(await gistClient.text(remoteFile)));
      data = storageApi.save(merged);
      await gistClient.patch(settings.gistId, settings.token, { [storageApi.FILE]: { content: JSON.stringify(data, null, 2) } }, { etag: snapshot.etag });
      syncStatus.textContent = "Gist sincronizado";
    } catch (error) { syncStatus.textContent = "Pendente de sincronização"; notify(error.message, true); }
  }

  app.addEventListener("change", (event) => {
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
    const target = event.target.closest("button,[data-filter]"); if (!target || busy) return;
    if (target.dataset.filter) { filter = target.dataset.filter; render(); return; }
    const action = target.dataset.action;
    if (action === "new") { current = blank(); step = 1; view = "wizard"; render(); }
    if (action === "catalog") { view = "catalog"; render(); }
    if (action === "saved") { view = "saved"; render(); }
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
    if (action === "edit") { current = structuredClone(data.records.find((item) => item.id === target.dataset.id)); step = 1; view = "wizard"; render(); }
    if (action === "pdf") await makePdf(data.records.find((item) => item.id === target.dataset.id));
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
    if (action === "delete") {
      const record = data.records.find((item) => item.id === target.dataset.id);
      if (record && confirm(`Excluir “${record.name}”?`)) {
        data = storageApi.save({ ...data, records: data.records.filter((item) => item.id !== record.id), deleted: [...data.deleted, { id: record.id, deletedAt: new Date().toISOString() }] });
        void syncToGist(); render();
      }
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

  void syncFromGist().finally(render);
})();
