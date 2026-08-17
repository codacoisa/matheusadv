(() => {
  "use strict";

  const app = document.querySelector("#app");
  const dialog = document.querySelector("#appointment-dialog");
  const form = document.querySelector("#appointment-form");
  const storage = window.OfficeJurAgendaStorage;
  const financeStorage = window.FinanceStorage;
  const financeDataStore = window.FinanceDataStore;
  const gistSettings = window.OfficeJurGistSettings;
  const access = window.OfficeJurGistAccessLease?.create();
  const gistClient = access?.gatedClient(window.OfficeJurGistClient) || window.OfficeJurGistClient;
  const syncStatus = document.querySelector("#sync-status");
  const toast = document.querySelector("#toast");
  const SYNC_STATE_KEY = "officejur-agendamentos-sync-state";
  const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const KIND_LABELS = {
    atendimento: "Atendimento",
    consulta: "Consulta",
    retorno: "Retorno",
    reuniao: "Reunião",
    audiencia: "Audiência",
    outro: "Outro",
  };
  const STATUS_LABELS = {
    scheduled: "Agendado",
    confirmed: "Confirmado",
    done: "Realizado",
    cancelled: "Cancelado",
  };
  const CHANNEL_LABELS = {
    presencial: "Presencial",
    video: "Videochamada",
    telefone: "Telefone",
    mensagem: "Mensagem",
    outro: "Outro",
  };
  let data = storage.normalize({});
  let financeData = { people: [], clients: [], team: [] };
  let selectedDate = todayISO();
  let selectedMonth = selectedDate.slice(0, 7);
  let editingId = "";
  let localAccessAllowed = true;

  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
  const uid = () => globalThis.crypto?.randomUUID?.() || `atendimento-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const now = () => new Date().toISOString();
  function pad(value) { return String(value).padStart(2, "0"); }
  const dateToParts = (value) => {
    const [year, month, day] = String(value).split("-").map(Number);
    return { year, month, day };
  };

  function todayISO() {
    const current = new Date();
    return `${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(current.getDate())}`;
  }

  function monthDate(month) {
    const { year, month: monthNumber } = dateToParts(`${month}-01`);
    return new Date(Date.UTC(year, monthNumber - 1, 1, 12));
  }

  function localDate(value) {
    const { year, month, day } = dateToParts(value);
    return new Date(year, month - 1, day, 12);
  }

  function formatDate(value, options = {}) {
    return localDate(value).toLocaleDateString("pt-BR", options);
  }

  function formatMonth(value) {
    return monthDate(value).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }

  function dateLabel(value) {
    return formatDate(value, { weekday: "long", day: "numeric", month: "long" });
  }

  function monthShift(value, amount) {
    const date = monthDate(value);
    date.setUTCMonth(date.getUTCMonth() + amount);
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
  }

  function clientList() {
    return financeStorage.resolvedClients(financeData)
      .filter((item) => item?.id && item.name)
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  }

  function clientById(id) {
    return clientList().find((item) => String(item.id) === String(id)) || null;
  }

  function peopleWithoutClient() {
    const clientPersonIds = new Set(
      (financeData.clients || [])
        .filter((item) => item.type === "pf" && item.personId)
        .map((item) => String(item.personId)),
    );
    return (financeData.people || [])
      .filter((item) => item.id && item.name && !clientPersonIds.has(String(item.id)))
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  }

  function teamList() {
    return (financeData.team || [])
      .filter((item) => item.id && item.name && item.status !== "inactive")
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  }

  function teamById(id) {
    return (financeData.team || []).find((item) => String(item.id) === String(id)) || null;
  }

  function subjectLabel(record) {
    if (record.subjectType === "person")
      return financeData.people.find((item) => String(item.id) === String(record.personId))?.name || "Pessoa não encontrada";
    return clientById(record.clientId)?.name || "Cliente não encontrado";
  }

  function subjectCaption(record) {
    return record.subjectType === "person" ? "Pessoa sem cadastro de cliente" : "Cliente do Financeiro";
  }

  function teamLabel(record) {
    const names = record.teamIds.map((id) => teamById(id)?.name || "Integrante removido");
    return names.join(", ");
  }

  function appointmentsForDate(date) {
    return data.records
      .filter((item) => item.date === date)
      .sort((left, right) => `${left.startTime}${left.endTime}`.localeCompare(`${right.startTime}${right.endTime}`));
  }

  function appointmentsForMonth(month) {
    return data.records.filter((item) => item.date.startsWith(`${month}-`));
  }

  function pendingRemindersForDate(date) {
    return data.reminders
      .filter((reminder) => reminder.status === "pending" && reminder.dueDate <= date)
      .map((reminder) => ({
        reminder,
        record: data.records.find((item) => item.id === reminder.appointmentId),
      }))
      .filter(({ record }) => record && !["done", "cancelled"].includes(record.status))
      .sort((left, right) => `${left.reminder.dueDate}${left.record.startTime}`.localeCompare(`${right.reminder.dueDate}${right.record.startTime}`));
  }

  function countsForMonth(month) {
    return appointmentsForMonth(month).reduce((counts, item) => {
      counts[item.date] = (counts[item.date] || 0) + 1;
      return counts;
    }, {});
  }

  function calendarDates(month) {
    const first = monthDate(month);
    const leading = (first.getUTCDay() + 6) % 7;
    const totalDays = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12)).getUTCDate();
    const dates = [];
    for (let index = 0; index < leading; index += 1) dates.push(null);
    for (let day = 1; day <= totalDays; day += 1)
      dates.push(`${month}-${pad(day)}`);
    while (dates.length % 7) dates.push(null);
    return dates;
  }

  function notify(message, error = false) {
    toast.textContent = message;
    toast.className = `toast${error ? " error" : ""}`;
    toast.hidden = false;
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => { toast.hidden = true; }, 5_500);
  }

  function setSyncStatus(message) {
    window.OfficeJurCloudStatus?.fromMessage(syncStatus, message);
  }

  function financeNotice() {
    const clients = clientList().length;
    const people = peopleWithoutClient().length;
    const team = teamList().length;
    if (clients + people && team) return "";
    const missing = [];
    if (!clients && !people) missing.push("um cliente ou uma pessoa");
    if (!team) missing.push("um integrante ativo da equipe");
    return `<div class="notice warning"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><span>Cadastre ${escape(missing.join(" e "))} em <a href="../financeiro/">Financeiro</a> antes de lançar um atendimento.</span></div>`;
  }

  function renderCalendar() {
    const counts = countsForMonth(selectedMonth);
    const dates = calendarDates(selectedMonth);
    return `<div class="calendar-head"><button class="icon-button" type="button" data-month-shift="-1" aria-label="Mês anterior"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button><strong>${escape(formatMonth(selectedMonth))}</strong><button class="icon-button" type="button" data-month-shift="1" aria-label="Próximo mês"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button></div><div class="weekday-row">${DAYS.map((day) => `<span>${day}</span>`).join("")}</div><div class="calendar-grid">${dates.map((date) => {
      if (!date) return '<span class="calendar-blank" aria-hidden="true"></span>';
      const dayNumber = Number(date.slice(-2));
      const count = counts[date] || 0;
      const classes = ["calendar-day", date === selectedDate ? "selected" : "", date === todayISO() ? "today" : ""].filter(Boolean).join(" ");
      return `<button class="${classes}" type="button" data-select-date="${date}" aria-label="${escape(formatDate(date, { day: "numeric", month: "long", year: "numeric" }))}${count ? `, ${count} atendimento${count === 1 ? "" : "s"}` : ""}"><span>${dayNumber}</span>${count ? `<small>${count}</small>` : ""}</button>`;
    }).join("")}</div>`;
  }

  function renderDayList() {
    const records = appointmentsForDate(selectedDate);
    if (!records.length)
      return '<div class="empty"><i class="fa-regular fa-calendar-check" aria-hidden="true"></i><strong>Nenhum atendimento neste dia</strong><span>Use “Novo atendimento” para preencher a agenda.</span></div>';
    return `<div class="day-list">${records.map((record) => `<article class="appointment-card status-${escape(record.status)}"><div class="appointment-time"><strong>${escape(record.startTime || "Sem horário")}</strong>${record.endTime ? `<span>até ${escape(record.endTime)}</span>` : ""}</div><div class="appointment-main"><div class="appointment-title"><span class="kind">${escape(KIND_LABELS[record.kind] || record.kind)}</span><span class="status-badge">${escape(STATUS_LABELS[record.status])}</span></div><h3>${escape(subjectLabel(record))}</h3><p>${escape(subjectCaption(record))} · ${escape(CHANNEL_LABELS[record.channel] || record.channel)}</p><p class="team-line"><i class="fa-solid fa-user-group" aria-hidden="true"></i>${escape(teamLabel(record))}</p>${record.notes ? `<p class="notes">${escape(record.notes)}</p>` : ""}</div><div class="appointment-actions"><button class="icon-button" type="button" data-edit-appointment="${escape(record.id)}" aria-label="Editar atendimento de ${escape(subjectLabel(record))}" title="Editar atendimento"><i class="fa-solid fa-pen" aria-hidden="true"></i></button><button class="icon-button danger-icon" type="button" data-delete-appointment="${escape(record.id)}" aria-label="Excluir atendimento de ${escape(subjectLabel(record))}" title="Excluir atendimento"><i class="fa-solid fa-trash" aria-hidden="true"></i></button></div></article>`).join("")}</div>`;
  }

  function renderReminderPanel() {
    const reminders = pendingRemindersForDate(selectedDate);
    if (!reminders.length) return "";
    return `<section class="reminders-panel" aria-labelledby="reminders-heading"><div class="panel-heading"><div><p class="eyebrow">LEMBRETES PERSISTENTES</p><h2 id="reminders-heading">Finalizações pendentes</h2></div><span class="day-count">${reminders.length} ${reminders.length === 1 ? "pendência" : "pendências"}</span></div><div class="reminder-list">${reminders.map(({ reminder, record }) => `<article class="reminder-card"><div class="reminder-icon"><i class="fa-solid fa-bell" aria-hidden="true"></i></div><div class="reminder-main"><strong>Finalizar ${escape(subjectLabel(record))}</strong><p>${escape(KIND_LABELS[record.kind] || record.kind)} de ${escape(formatDate(record.date))}${record.startTime ? ` às ${escape(record.startTime)}` : ""} · criada para ${escape(formatDate(reminder.dueDate))}</p><p class="team-line"><i class="fa-solid fa-user-group" aria-hidden="true"></i>${escape(teamLabel(record))}</p></div><div class="reminder-actions"><button class="primary compact" type="button" data-complete-appointment="${escape(record.id)}">Finalizar atendimento</button><button class="secondary compact" type="button" data-dismiss-reminder="${escape(reminder.id)}">Dispensar</button></div></article>`).join("")}</div></section>`;
  }

  function render() {
    const monthRecords = appointmentsForMonth(selectedMonth);
    const dayRecords = appointmentsForDate(selectedDate);
    const canCreate = clientList().length + peopleWithoutClient().length > 0 && teamList().length > 0;
    app.innerHTML = `<section class="hero"><div><p class="eyebrow">OPERAÇÃO DO ESCRITÓRIO</p><h1>Agenda de atendimentos</h1><p>Organize os atendimentos do dia, com horário, pessoa atendida e equipe responsável.</p></div><div class="hero-actions"><button class="secondary" type="button" data-go-today><i class="fa-regular fa-calendar" aria-hidden="true"></i> Hoje</button><button class="primary" type="button" data-new-appointment ${canCreate ? "" : "disabled"}><i class="fa-solid fa-plus" aria-hidden="true"></i> Novo atendimento</button></div></section>${financeNotice()}<section class="summary"><div class="metric"><span>Atendimentos no mês</span><strong>${monthRecords.length}</strong></div><div class="metric"><span>No dia selecionado</span><strong>${dayRecords.length}</strong></div><div class="metric"><span>Integrantes disponíveis</span><strong>${teamList().length}</strong></div></section><section class="agenda-layout"><article class="panel calendar-panel"><div class="panel-heading"><div><p class="eyebrow">CALENDÁRIO</p><h2>Visão mensal</h2></div><input id="selected-date" type="date" value="${escape(selectedDate)}" aria-label="Escolher dia da agenda"></div>${renderCalendar()}</article><article class="panel day-panel"><div class="panel-heading"><div><p class="eyebrow">AGENDA DO DIA</p><h2>${escape(dateLabel(selectedDate))}</h2></div><span class="day-count">${dayRecords.length} ${dayRecords.length === 1 ? "atendimento" : "atendimentos"}</span></div>${renderDayList()}${renderReminderPanel()}</article></section>`;
  }

  function persistData(nextData) {
    data = storage.save(storage.ensureReminders(nextData));
    return data;
  }

  function reconcileReminders() {
    const next = storage.ensureReminders(data);
    if (storage.signature(next) === storage.signature(data)) return false;
    data = storage.save(next);
    return true;
  }

  function setSubjectValue(record) {
    form.elements.subject.value = record.subjectType === "person"
      ? `person:${record.personId}`
      : `client:${record.clientId}`;
  }

  function renderFormOptions(record = null) {
    const subject = form.elements.subject;
    const clients = clientList();
    const people = peopleWithoutClient();
    subject.innerHTML = `<option value="">Selecione cliente ou pessoa</option><optgroup label="Clientes do Financeiro">${clients.map((item) => `<option value="client:${escape(item.id)}">${escape(item.name)}${item.document ? ` · ${escape(item.document)}` : ""}</option>`).join("")}</optgroup><optgroup label="Pessoas sem cadastro de cliente">${people.map((item) => `<option value="person:${escape(item.id)}">${escape(item.name)}${item.cpf ? ` · ${escape(item.cpf)}` : ""}</option>`).join("")}</optgroup>`;
    const selectedTeamIds = new Set(record?.teamIds || []);
    document.querySelector("#team-options").innerHTML = teamList().length
      ? teamList().map((member) => `<label class="team-option"><input type="checkbox" name="teamIds" value="${escape(member.id)}" ${selectedTeamIds.has(String(member.id)) ? "checked" : ""}><span><strong>${escape(member.name)}</strong><small>${escape(member.roleLabel || member.role || "Equipe")}</small></span></label>`).join("")
      : '<p class="field-help">Nenhum integrante ativo cadastrado na equipe.</p>';
    if (record) setSubjectValue(record);
  }

  function openDialog(id = "") {
    const record = data.records.find((item) => item.id === id) || null;
    editingId = record?.id || "";
    form.reset();
    form.elements.id.value = editingId;
    form.elements.date.value = record?.date || selectedDate;
    form.elements.startTime.value = record?.startTime || "";
    form.elements.endTime.value = record?.endTime || "";
    form.elements.kind.value = record?.kind || "atendimento";
    form.elements.channel.value = record?.channel || "presencial";
    form.elements.status.value = record?.status || "scheduled";
    form.elements.notes.value = record?.notes || "";
    renderFormOptions(record);
    document.querySelector("#appointment-dialog-title").textContent = record ? "Editar atendimento" : "Novo atendimento";
    document.querySelector("#appointment-dialog-description").textContent = record ? "Atualize os dados do compromisso." : "Informe quem será atendido e a equipe responsável.";
    dialog.showModal();
    form.elements.date.focus();
  }

  function saveForm() {
    const value = form.elements.subject.value;
    const [subjectType, subjectId] = value.split(":");
    const teamIds = [...form.querySelectorAll('input[name="teamIds"]:checked')].map((input) => input.value);
    const current = data.records.find((item) => item.id === editingId);
    const record = storage.normalizeRecord({
      id: editingId || uid(),
      date: form.elements.date.value,
      startTime: form.elements.startTime.value,
      endTime: form.elements.endTime.value,
      kind: form.elements.kind.value,
      subjectType,
      clientId: subjectType === "client" ? subjectId : "",
      personId: subjectType === "person" ? subjectId : "",
      teamIds,
      channel: form.elements.channel.value,
      status: form.elements.status.value,
      notes: form.elements.notes.value.trim(),
      createdAt: current?.createdAt || now(),
      updatedAt: now(),
    });
    const issues = storage.validateRecord(record, financeData);
    if (issues.length) {
      notify(issues[0], true);
      return;
    }
    persistData({
      ...data,
      records: [...data.records.filter((item) => item.id !== record.id), record],
      deleted: data.deleted.filter((item) => item.id !== record.id),
    });
    selectedDate = record.date;
    selectedMonth = record.date.slice(0, 7);
    dialog.close();
    render();
    void sync.toGist().catch((error) => notify(error.message, true));
    notify(editingId ? "Atendimento atualizado." : "Atendimento agendado.");
  }

  function deleteAppointment(id) {
    const record = data.records.find((item) => item.id === id);
    if (!record || !window.confirm(`Excluir o atendimento de ${subjectLabel(record)}?`)) return;
    const deletedAt = now();
    data = storage.save({
      ...data,
      records: data.records.filter((item) => item.id !== id),
      deleted: [...data.deleted.filter((item) => item.id !== id), { id, deletedAt }],
    });
    render();
    void sync.toGist().catch((error) => notify(error.message, true));
    notify("Atendimento excluído.");
  }

  function completeAppointment(id) {
    const record = data.records.find((item) => item.id === id);
    if (!record) return;
    const updatedAt = now();
    persistData({
      ...data,
      records: data.records.map((item) => item.id === id
        ? storage.normalizeRecord({ ...item, status: "done", updatedAt })
        : item),
    });
    render();
    void sync.toGist().catch((error) => notify(error.message, true));
    notify(`Atendimento de ${subjectLabel(record)} finalizado.`);
  }

  function dismissReminder(id) {
    const reminder = data.reminders.find((item) => item.id === id);
    if (!reminder) return;
    data = storage.save({
      ...data,
      reminders: data.reminders.map((item) => item.id === id
        ? { ...item, status: "dismissed", updatedAt: now() }
        : item),
    });
    render();
    void sync.toGist().catch((error) => notify(error.message, true));
    notify("Lembrete dispensado.");
  }

  function showBlocked() {
    localAccessAllowed = false;
    data = storage.normalize({});
    financeData = { people: [], clients: [], team: [] };
    window.OfficeJurLocalAccessBlocked?.render({
      container: app,
      settingsHref: "../configuracoes/",
      statusElement: syncStatus,
      footer: document.querySelector("office-site-footer"),
    });
  }

  async function loadFinance() {
    const domains = await financeDataStore.load({ financeStorage });
    return financeStorage.assemble(domains);
  }

  const sync = window.OfficeJurAgendaSync.create({
    storage,
    financeStorage,
    financeDataStore,
    gistSettings,
    gistClient,
    access,
    getData: () => data,
    setData: (value) => { data = storage.normalize(value); storage.save(data, globalThis.localStorage, { touch: false }); },
    getFinanceData: () => financeData,
    setFinanceData: (value) => { financeData = value; },
    setStatus: setSyncStatus,
    notify,
  });

  app.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    if (target.dataset.monthShift) {
      selectedMonth = monthShift(selectedMonth, Number(target.dataset.monthShift));
      if (!selectedDate.startsWith(`${selectedMonth}-`)) selectedDate = `${selectedMonth}-01`;
      render();
    } else if (target.dataset.selectDate) {
      selectedDate = target.dataset.selectDate;
      selectedMonth = selectedDate.slice(0, 7);
      render();
    } else if (target.dataset.newAppointment !== undefined) {
      openDialog();
    } else if (target.dataset.goToday !== undefined) {
      selectedDate = todayISO();
      selectedMonth = selectedDate.slice(0, 7);
      render();
    } else if (target.dataset.editAppointment) {
      openDialog(target.dataset.editAppointment);
    } else if (target.dataset.deleteAppointment) {
      deleteAppointment(target.dataset.deleteAppointment);
    } else if (target.dataset.completeAppointment) {
      completeAppointment(target.dataset.completeAppointment);
    } else if (target.dataset.dismissReminder) {
      dismissReminder(target.dataset.dismissReminder);
    }
  });

  app.addEventListener("change", (event) => {
    if (event.target.id === "selected-date" && event.target.value) {
      selectedDate = event.target.value;
      selectedMonth = selectedDate.slice(0, 7);
      render();
    }
  });
  form.addEventListener("submit", (event) => { event.preventDefault(); saveForm(); });
  document.querySelector("#close-appointment-dialog").addEventListener("click", () => dialog.close());
  document.querySelector("#cancel-appointment").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { editingId = ""; });
  access?.subscribe((lease) => {
    if (["stale", "unverified", "purging", "purged"].includes(lease.phase)) showBlocked();
  });

  async function initialize() {
    localAccessAllowed = await access?.guard("agenda", () => {
      storage.clear();
      localStorage.removeItem(SYNC_STATE_KEY);
    }) ?? true;
    if (!localAccessAllowed) { showBlocked(); return; }
    try {
      data = storage.load();
      financeData = await loadFinance();
    } catch (error) {
      notify(error.message || "Não foi possível carregar os dados locais.", true);
      data = storage.normalize({});
      financeData = { people: [], clients: [], team: [] };
    }
    await sync.fromGist();
    if (!localAccessAllowed) { showBlocked(); return; }
    const remindersChanged = reconcileReminders();
    if (remindersChanged) void sync.toGist();
    try { access?.canSync(gistSettings.load().gistId); } catch (_) { showBlocked(); return; }
    render();
  }

  void initialize();
})();
