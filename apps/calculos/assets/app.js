(() => {
  "use strict";

  const app = document.querySelector("#app");
  const toast = document.querySelector("#toast");
  const syncStatus = document.querySelector("#sync-status");
  const storage = window.OfficeJurCalculationStorage;
  const finance = window.OfficeJurCalculationFinance;
  const syncFactory = window.OfficeJurCalculationSync;
  const gistSettings = window.OfficeJurGistSettings;
  const gistClient = window.OfficeJurGistClient;
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);

  const calculators = [
    ["Atualização monetária simples", "Generalista", "Fluxo ágil para atualização, juros, multas e honorários.", "facil", '<circle cx="12" cy="12" r="8"/><path d="m9 15 6-6M9.5 9.5h.01M14.5 14.5h.01"/>'],
    ["Atualização monetária completa", "Generalista", "Fluxo detalhado com parcelas, índices variados, multas, honorários e custas.", "completo", '<path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h4M8 18h8"/><path d="M17 2v4M15 4h4"/>'],
    ["Pensão alimentícia", "Familiar", "Apure parcelas vencidas, abatimentos, atualização, juros e encargos.", "pensao", '<path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.5a5.5 5.5 0 0 0 0-7.8Z"/>'],
    ["Divórcio e partilha", "Familiar", "Organize bens, dívidas, meação e quinhões.", null, '<circle cx="8" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><path d="M3 20c.4-4 2-6 5-6 1.7 0 3 .6 4 1.8M21 20c-.4-4-1.7-6-4-6-1.5 0-2.7.5-3.6 1.5M12 3v18"/>'],
    ["Revisão bancária", "Bancário", "Simule a evolução de contratos e encargos financeiros.", null, '<path d="m3 9 9-5 9 5M5 10v8M10 10v8M14 10v8M19 10v8M3 21h18"/>'],
    ["Superendividamento", "Consumidor", "Estruture renda, mínimo existencial e plano de pagamento.", null, '<path d="M4 7h16v12H4zM4 10h16M8 15h3"/><path d="M17 3v4M15 5h4"/>'],
    ["Aluguéis vencidos", "Imobiliário", "Atualize aluguéis, multas e encargos locatícios.", null, '<path d="m3 11 9-7 9 7v9H3zM9 20v-6h6v6"/><circle cx="18" cy="7" r="3"/><path d="M18 5.5V7l1 1"/>'],
    ["Verbas trabalhistas", "Trabalhista", "Calcule verbas rescisórias, adicionais, abatimentos e reflexos.", "trabalhista", '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M3 12h18M10 12v2h4v-2"/>'],
    ["Correção do FGTS", "Trabalhista", "Compare depósitos e critérios de atualização.", null, '<path d="M5 11a7 7 0 0 1 13-3h3v7h-3a7 7 0 0 1-5 4.8V22H9v-2H6v-3H4a2 2 0 0 1-2-2v-4h3Z"/><circle cx="13" cy="11" r="1"/>'],
    ["Dosimetria da pena", "Penal", "Documente as três fases da dosimetria.", null, '<path d="m14 4 6 6M12 6l6 6M4 20l8-8M3 21h8M15 3l6 6"/>'],
    ["Progressão de regime", "Penal", "Apure marcos e frações para progressão.", null, '<path d="M3 20h5v-5h5v-5h5V5h3"/><path d="m17 3 4 2-2 4"/>'],
    ["Contribuições previdenciárias", "Previdenciário", "Apure contribuições e limites previdenciários.", null, '<path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6l-8-3Z"/><path d="M12 8v8M8 12h8"/>'],
    ["Revisão do PASEP", "Bancário", "Organize lançamentos e critérios revisionais.", null, '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h6M9 16h4"/><circle cx="17" cy="17" r="3"/><path d="m19 19 2 2"/>'],
  ];
  const categories = ["Todos", ...new Set(calculators.map((item) => item[1]))];
  let data = storage.load();
  let financeData = finance?.empty?.() || { clients: [], cases: [], loaded: false };
  let filter = "Todos";
  let view = "catalog";
  let savedSearch = "";
  let savedType = "Todos";

  function notify(message, error = false) {
    toast.textContent = message;
    toast.className = `toast${error ? " error" : ""}`;
    toast.hidden = false;
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => { toast.hidden = true; }, 6_000);
  }
  function clientName(id) { return finance?.clientLabel(finance.findClient(financeData, id)) || "Cliente não vinculado"; }
  function caseName(id) { return finance?.caseLabel(finance.findCase(financeData, id)) || "Caso não vinculado"; }
  function typeOf(record) { return ["easy", "complete"].includes(record.type) ? "Generalista" : record.type === "labor" ? "Trabalhista" : "Familiar"; }
  function routeOf(record) { return ({ easy: "facil", complete: "completo", labor: "trabalhista", pension: "pensao" })[record.type] || "pensao"; }
  function filteredRecords() {
    const term = savedSearch.trim().toLocaleLowerCase("pt-BR");
    return data.records.filter((record) => {
      const matchesType = savedType === "Todos" || typeOf(record) === savedType;
      const text = [record.name, clientName(record.input?.clientId), caseName(record.input?.caseId)].join(" ").toLocaleLowerCase("pt-BR");
      return matchesType && (!term || text.includes(term));
    });
  }
  function catalogView() {
    const cards = calculators.filter((item) => filter === "Todos" || item[1] === filter).map(([name, category, description, route, icon]) => `
      <article class="calculator-card">
        ${route ? "" : '<span class="badge soon">Em breve</span>'}
        <div class="card-meta"><span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icon}</svg></span><span class="badge">${escape(category)}</span></div>
        <h3>${escape(name)}</h3><p>${escape(description)}</p>
        ${route ? `<a class="primary button" href="./${route}/">Iniciar cálculo</a>` : '<button class="secondary" disabled>Disponível em breve</button>'}
      </article>`).join("");
    app.innerHTML = `<section class="hero"><div><p class="eyebrow">Documentos técnicos e auditáveis</p><h1>Cálculos Jurídicos</h1><p>Prepare memórias de cálculo reproduzíveis, salve versões e gere demonstrativos detalhados em PDF.</p></div><button class="secondary" data-action="saved">Meus cálculos <span class="badge">${data.records.length}</span></button></section><section><div class="catalog-head"><div><h2>Novo cálculo</h2><p class="hint">Escolha o nível de detalhe ou a matéria do cálculo.</p></div></div><div class="filters" role="group" aria-label="Filtrar calculadoras">${categories.map((item) => `<button class="filter ${filter === item ? "active" : ""}" data-filter="${escape(item)}">${escape(item)}</button>`).join("")}</div><div class="catalog">${cards}</div></section>`;
  }
  function savedView() {
    app.innerHTML = `<section class="panel"><div class="saved-head"><div><p class="eyebrow">Histórico e versões</p><h1>Meus cálculos</h1><p class="hint">Os cálculos podem ser reabertos, ajustados e exportados novamente.</p></div><button class="secondary" data-action="catalog">Novo cálculo</button></div><div class="saved-toolbar"><label class="search-field" for="saved-search">Pesquisar por cliente ou nome do cálculo<input id="saved-search" type="search" value="${escape(savedSearch)}" placeholder="Pesquisar por cliente ou nome do cálculo"></label><select id="saved-type" aria-label="Filtrar por calculadora"><option value="Todos">Todas as calculadoras</option>${categories.filter((item) => item !== "Todos").map((item) => `<option ${savedType === item ? "selected" : ""}>${escape(item)}</option>`).join("")}</select></div><div class="saved-list">${filteredRecords().length ? filteredRecords().map((record) => `<article class="saved-item"><div><span class="status ${record.status === "final" ? "final" : "draft"}">${record.status === "final" ? "Calculado" : "Rascunho"}</span><h3>${escape(clientName(record.input?.clientId))}</h3><p>${escape(record.name)}${record.input?.caseId ? ` • ${escape(caseName(record.input.caseId))}` : ""}<br>${escape(record.code || "Sem código")} • atualizado ${new Date(record.updatedAt).toLocaleString("pt-BR")}${record.result ? ` • ${escape(String(record.result.totals.total))}` : ""}</p></div><div class="saved-actions"><a class="secondary button small" href="./${routeOf(record)}/?id=${encodeURIComponent(record.id)}">Editar</a>${record.result ? `<a class="primary button small" href="./${routeOf(record)}/?id=${encodeURIComponent(record.id)}&pdf=1">PDF</a>` : ""}<button class="danger small" data-action="delete" data-id="${escape(record.id)}">Excluir</button></div></article>`).join("") : '<div class="empty">Nenhum cálculo salvo ainda.</div>'}</div></section>`;
  }
  function render() { if (view === "catalog") catalogView(); else savedView(); app.focus({ preventScroll: true }); }
  function persist(value) { data = storage.save(value); void sync.toGist(); }

  app.addEventListener("change", (event) => {
    if (event.target.id === "saved-type") { savedType = event.target.value; render(); }
    if (event.target.id === "saved-search") { savedSearch = event.target.value; render(); }
  });
  app.addEventListener("click", (event) => {
    const target = event.target.closest("button,[data-filter]");
    if (target?.dataset.filter) { filter = target.dataset.filter; render(); return; }
    const action = target?.dataset.action;
    if (action === "saved") { view = "saved"; render(); }
    if (action === "catalog") { view = "catalog"; render(); }
    if (action === "delete") {
      const record = data.records.find((item) => item.id === target.dataset.id);
      if (record && confirm(`Excluir “${record.name}”?`)) {
        persist({ ...data, records: data.records.filter((item) => item.id !== record.id), deleted: [...data.deleted, { id: record.id, deletedAt: new Date().toISOString() }] });
        render();
      }
    }
  });
  async function initialize() {
    try { financeData = await finance?.load?.() || { clients: [], cases: [], loaded: false }; } catch (_) { financeData = { clients: [], cases: [], loaded: false }; }
    await sync.fromGist();
    render();
  }
  const sync = syncFactory.create({ storage, gistSettings, gistClient, getData: () => data, setData: (value) => { data = value; }, setStatus: (message) => { syncStatus.textContent = message; }, notify });
  void initialize();
})();
