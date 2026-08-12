(() => {
  'use strict';
  const app = document.querySelector('#labor-app');
  const toast = document.querySelector('#labor-toast');
  const syncStatus = document.querySelector('#sync-status');
  const labor = window.OfficeJurLaborCalculations;
  const storage = window.OfficeJurCalculationStorage;
  const financeApi = window.OfficeJurCalculationFinance;
  const caseContextApi = window.OfficeJurCalculationCaseContext;
  const indices = window.OfficeJurLegalIndices;
  const gistSettings = window.OfficeJurGistSettings;
  const gistClient = window.OfficeJurGistClient;
  const access = window.OfficeJurGistAccessLease?.create();
  const syncFactory = window.OfficeJurCalculationSync;
  if (!app || !labor || !storage || !indices || !gistSettings || !gistClient || !syncFactory) return;

  const today = new Date().toISOString().slice(0, 10);
  const fmt = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const uuid = () => `labor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const code = () => `OJ-LAB-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const types = Object.keys(labor.TYPES);
  const label = type => labor.TYPES[type] || type;
  const numericKeys = new Set(['baseSalary', 'divisor', 'paidAmount', 'days', 'months', 'multiplier', 'hours', 'percentage', 'baseAmount', 'value', 'quantity', 'unitValue', 'installments', 'installmentValue', 'dueAmount']);
  let data = storage.normalize({});
  let localAccessAllowed = true;
  let financeData = financeApi?.empty() || { clients: [], cases: [], loaded: false };
  let step = 1;
  let pendingPdf = false;
  const newRecord = () => ({
    id: uuid(), code: code(), type: 'labor', calculationVersion: labor.VERSION, status: 'draft', name: 'Cálculo trabalhista sem título', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    input: { clientId: '', client: '', clientName: '', caseId: '', caseName: '', caseNumber: '', clientParty: null, opposingParty: null, additionalParties: [], clientRole: 'Reclamada', partyType: 'Reclamada', partySource: 'manual', admissionDate: today, terminationDate: '', prescriptionStart: '', startDate: today, endDate: today, calculationDate: today, baseSalary: 0, divisor: 220, salaryRows: [], claims: [], settings: { correctionType: 'none', interestType: 'none', fixedMonthlyRate: 0, preLegalMonthlyRate: 0, penaltyRate: 0, feeRate: 0 } },
  });
  let record = newRecord();
  const sync = syncFactory.create({
    storage,
    gistSettings,
    gistClient,
    access,
    getData: () => data,
    setData: value => { data = value; },
    setStatus: message => { window.OfficeJurCloudStatus?.fromMessage(syncStatus, message); },
    notify,
  });

  function notify(message, error = false) { toast.textContent = message; toast.classList.toggle('error', error); toast.hidden = false; clearTimeout(notify.timer); notify.timer = setTimeout(() => { toast.hidden = true; }, 5000); }
  function clientOptions(selected) { return `<option value="">Selecione um cliente</option>${(financeData.clients || []).map(client => `<option value="${esc(client.id)}" ${String(selected || '') === String(client.id) ? 'selected' : ''}>${esc(financeApi.clientLabel(client))}</option>`).join('')}`; }
  function caseOptions(clientId, selected) { const cases = financeApi?.casesForClient(financeData, clientId) || []; return `<option value="">Nenhum caso vinculado</option>${cases.map(item => `<option value="${esc(item.id)}" ${String(selected || '') === String(item.id) ? 'selected' : ''}>${esc(financeApi.caseLabel(item))}</option>`).join('')}`; }
  function financeNotice() { if (!financeData.loaded) return '<div class="finance-notice error"><strong>Não foi possível ler o Financeiro.</strong><span>Atualize a página para tentar novamente.</span></div>'; if (!financeData.clients.length) return '<div class="finance-notice"><strong>Cadastre um cliente no Financeiro antes de criar o cálculo.</strong><a href="../financeiro/" target="_blank" rel="noopener">Abrir Financeiro</a></div>'; return ''; }
  function persist(status = record.status, quiet = false) { if (!localAccessAllowed) return; try { access?.canSync(gistSettings.load().gistId); } catch (_) { showBlocked(); return; } record.type = 'labor'; record.calculationVersion = labor.VERSION; record.status = status; record.updatedAt = new Date().toISOString(); data = storage.save({ ...data, records: [structuredClone(record), ...data.records.filter(item => item.id !== record.id)] }); void sync.toGist(); if (!quiet) notify(status === 'final' ? 'Cálculo salvo.' : 'Rascunho salvo.'); }
  function claimMap() { return new Map(record.input.claims.map(item => [item.type, item])); }
  function employmentEnd() { return record.input.active ? record.input.calculationDate : record.input.terminationDate; }
  function blankClaim(type) { return { id: `${type}-${uuid()}`, type, description: label(type), dueDate: employmentEnd() || record.input.calculationDate, status: 'unpaid', paidAmount: 0, base: type === 'insalubrity' ? 'minimum_wage' : 'salary', days: type === 'vacation' || type === 'notice' ? 30 : 0, hours: 0, percentage: type === 'periculosidade' ? 30 : type === 'night_shift' || type === 'insalubrity' ? 20 : type === 'on_call' ? 33.3333 : 50, quantity: 0, unitValue: 0, installments: 3, installmentValue: 0, dueAmount: 0, baseTypes: ['overtime', 'night_shift'] }; }
  function stepList() { return ['Dados básicos', 'Salários', 'Verbas', 'Atualização e encargos', 'Resultado'].map((name, index) => `<li class="wizard-step ${step === index + 1 ? 'active' : step > index + 1 ? 'done' : ''}"><span>${index + 1}</span><strong>Passo ${index + 1}</strong><small>${name}</small></li>`).join(''); }
  function input(name, value, type = 'text', extra = '') { return `<input id="${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}>`; }
  function additionalPartyOptions(selected) { const context = caseContextApi?.partyContext(financeData, record.input, financeApi) || {}; const clientName = context.clientParty?.name || ''; return `<option value="manual" ${selected === 'manual' ? 'selected' : ''}>Preencher manualmente</option>${(context.caseParties || []).filter(party => party.name !== clientName).map(party => `<option value="case:${esc(party.id)}" ${selected === `case:${party.id}` ? 'selected' : ''}>Importar: ${esc(party.name)} — ${esc(party.role)}</option>`).join('')}`; }
  function removeImportedAdditionalParties() { record.input.additionalParties = (record.input.additionalParties || []).filter(party => party.source !== 'case'); }
  function additionalPartiesHtml() { const i = record.input; return `<section class="party-manager" aria-labelledby="additional-parties-title"><div class="party-manager-head"><div><h3 id="additional-parties-title">Partes adicionais</h3><p class="hint">Importe do processo ou inclua manualmente quando necessário.</p></div><button class="link-button" type="button" data-action="add-additional">＋ Adicionar parte adicional</button></div><div class="party-list">${(i.additionalParties || []).map((party, index) => { const source = party.source === 'case' ? `case:${party.sourceId}` : 'manual'; const imported = party.source === 'case'; return `<div class="party-row" data-additional-index="${index}"><select data-additional-field="source" aria-label="Origem da parte adicional">${additionalPartyOptions(source)}</select><input data-additional-field="name" aria-label="Nome da parte adicional ${index + 1}" value="${esc(party.name)}" placeholder="Nome da parte" ${imported ? 'readonly' : ''}><input data-additional-field="role" aria-label="Polo da parte adicional ${index + 1}" value="${esc(party.role)}" placeholder="Polo" ${imported ? 'readonly' : ''}><button class="danger small" type="button" data-action="remove-additional" data-index="${index}" aria-label="Remover parte adicional">×</button></div>`; }).join('')}</div></section>`; }
  function basic() { const i = record.input, role = i.clientRole || i.partyType || 'Reclamada', opposingRole = caseContextApi?.oppositeRole(role) || 'Reclamante', clientName = i.clientParty?.name || i.clientName || ''; return `${financeNotice()}<section class="form-section"><div class="section-heading"><div><h2>Identificação</h2><p class="hint">Nomeie o cálculo e vincule o cliente e o processo, se houver.</p></div></div><div class="form-grid"><div class="field full"><label class="required" for="name">Nome do cálculo</label>${input('name', record.name, 'text', 'required')}</div><div class="field"><label class="required" for="clientId">Cliente</label><select id="clientId" name="clientId" required>${clientOptions(i.clientId)}</select></div><div class="field"><label for="caseId">Caso / processo (opcional)</label><select id="caseId" name="caseId">${caseOptions(i.clientId, i.caseId)}</select></div><div class="field full"><label>Processo${input('caseNumber', i.caseNumber)}</label></div></div></section><section class="form-section"><div class="section-heading"><div><h2>Partes</h2><p class="hint">Defina o polo do cliente, a parte contrária e eventuais terceiros.</p></div></div><div class="form-grid"><div class="field"><label>Parte principal — cliente${input('clientPartyName', clientName, 'text', 'readonly')}</label></div><div class="field"><label>Polo do cliente<select id="partyType" name="partyType"><option ${role === 'Reclamante' ? 'selected' : ''}>Reclamante</option><option ${role === 'Reclamada' ? 'selected' : ''}>Reclamada</option></select></label></div><div class="field full"><label>Parte contrária — ${opposingRole}${input('opposingPartyName', i.opposingParty?.name || i.party || '', 'text')}</label></div><div class="field full">${additionalPartiesHtml()}</div></div></section><section class="form-section"><div class="section-heading"><div><h2>Vínculo e parâmetros</h2><p class="hint">Informe o período contratual e as premissas usadas nas verbas.</p></div></div><div class="form-grid"><div class="field"><label>Data-base do cálculo${input('calculationDate', i.calculationDate, 'date', 'required')}</label></div><div class="field"><label>Cargo${input('role', i.role)}</label></div><div class="field"><label class="required">Data da admissão${input('admissionDate', i.admissionDate, 'date', 'required')}</label></div><div class="field"><label>Data da demissão${input('terminationDate', i.terminationDate, 'date')}</label></div><label class="check field full"><input name="active" type="checkbox" ${i.active ? 'checked' : ''}><span>Empregado ainda ativo (usa a data-base como fim do vínculo)</span></label><label class="check field full"><input name="prescription" type="checkbox" ${i.prescription ? 'checked' : ''}><span>Limitar cálculo pela prescrição</span></label><div class="field"><label>Início da prescrição${input('prescriptionStart', i.prescriptionStart, 'date')}</label></div><div class="field"><label>Salário-base inicial (R$)${input('baseSalary', i.baseSalary, 'number', 'min="0" step="0.01"')}</label></div><div class="field"><label>Divisor mensal${input('divisor', i.divisor || 220, 'number', 'min="1" step="1"')}</label></div><div class="field full legal-note"><strong>Premissas jurídicas editáveis.</strong> O cliente ocupa o polo escolhido; preencha somente a parte contrária. Partes adicionais podem ser importadas ou digitadas.</div></div></section>`; }
  function salaries() { return `<p class="legal-note">O divisor forma o salário-hora. Em <strong>Parcial</strong>, o valor pago é abatido como pagamento declarado.</p><div class="table-wrap"><table><thead><tr><th>Competência</th><th>Base</th><th>Descrição</th><th>Divisor</th><th>Status</th><th>Valor pago</th></tr></thead><tbody>${record.input.salaryRows.map(row => `<tr><td>${row.competence}</td><td><input data-salary="${row.competence}" data-key="baseSalary" type="number" min="0" step=".01" value="${row.baseSalary}"></td><td><input data-salary="${row.competence}" data-key="description" value="${esc(row.description)}"></td><td><input data-salary="${row.competence}" data-key="divisor" type="number" min="1" value="${row.divisor}"></td><td><select data-salary="${row.competence}" data-key="status"><option value="paid" ${row.status === 'paid' ? 'selected' : ''}>Pago</option><option value="unpaid" ${row.status === 'unpaid' ? 'selected' : ''}>Não pago</option><option value="partial" ${row.status === 'partial' ? 'selected' : ''}>Parcial</option></select></td><td><input data-salary="${row.competence}" data-key="paidAmount" type="number" min="0" step=".01" value="${row.paidAmount || ''}"></td></tr>`).join('')}</tbody></table></div>`; }
  function field(claim, key, title, type = 'number', extra = '') { return `<label>${title}<input data-claim="${claim.type}" data-key="${key}" type="${type}" value="${esc(claim[key] ?? '')}" ${extra}></label>`; }
  function claimFields(claim) { const type = claim.type; if (['family_salary', 'meal_voucher', 'transport_voucher'].includes(type)) return `${field(claim, 'quantity', type === 'family_salary' ? 'Quantidade de filhos' : 'Quantidade')} ${field(claim, 'unitValue', 'Valor unitário (R$)', 'number', 'min="0" step=".01"')}`; if (type === 'unemployment_insurance') return `${field(claim, 'installments', 'Quantidade de parcelas', 'number', 'min="0" step="1"')} ${field(claim, 'installmentValue', 'Valor por parcela (R$)', 'number', 'min="0" step=".01"')}`; if (type === 'commissions') return field(claim, 'dueAmount', 'Valor devido (R$)', 'number', 'min="0" step=".01"'); if (type === 'dsr') return `${field(claim, 'days', 'Dias não gozados', 'number', 'min="0" step="1"')}<label class="check"><input data-claim="${type}" data-key="double" type="checkbox" ${claim.double ? 'checked' : ''}><span>Em dobro</span></label>`; if (type === 'insalubrity') return `<label>Base<select data-claim="${type}" data-key="base"><option value="minimum_wage" ${claim.base === 'minimum_wage' ? 'selected' : ''}>Salário mínimo</option><option value="salary" ${claim.base === 'salary' ? 'selected' : ''}>Salário do reclamante</option></select></label>${field(claim, 'percentage', 'Percentual (%)', 'number', 'min="0" step=".01"')}`; if (type === 'salary_balance' || type === 'vacation' || type === 'notice') return `${field(claim, 'days', type === 'vacation' ? 'Dias de férias' : 'Dias', 'number', 'min="0" step="1"')}${type === 'vacation' ? `<label class="check"><input data-claim="${type}" data-key="double" type="checkbox" ${claim.double ? 'checked' : ''}><span>Férias em dobro</span></label>` : ''}`; if (type === 'thirteenth') return field(claim, 'months', 'Avos de 13º', 'number', 'min="0" max="12" step="1"'); if (type === 'fgts_40' || type === 'art_467') return field(claim, 'baseAmount', 'Base declarada (R$)', 'number', 'min="0" step=".01"'); if (type === 'art_477') return field(claim, 'multiplier', 'Multiplicador do salário', 'number', 'min="0" step=".01"'); if (['overtime', 'intrajornada', 'interjornada', 'on_call', 'night_shift'].includes(type)) return `${field(claim, 'hours', 'Horas no período', 'number', 'min="0" step=".01"')}${field(claim, 'percentage', 'Adicional (%)', 'number', 'min="0" step=".0001"')}`; if (type === 'reflexes') return field(claim, 'percentage', 'Percentual dos reflexos', 'number', 'min="0" step=".01"'); if (['miscellaneous'].includes(type)) return field(claim, 'value', 'Valor da época (R$)', 'number', 'min="0" step=".01"'); return field(claim, 'percentage', 'Percentual (%)', 'number', 'min="0" step=".01"'); }
  function claimCard(claim) { return `<article class="labor-claim"><h3>${esc(label(claim.type))}</h3><p class="hint">Parâmetros e pagamentos ficam registrados como premissas deste cálculo.</p><div class="labor-claim-grid"><label>Vencimento<input data-claim="${claim.type}" data-key="dueDate" type="date" value="${claim.dueDate}"></label><label>Status<select data-claim="${claim.type}" data-key="status"><option value="unpaid" ${claim.status === 'unpaid' ? 'selected' : ''}>Não pago</option><option value="paid" ${claim.status === 'paid' ? 'selected' : ''}>Pago</option><option value="partial" ${claim.status === 'partial' ? 'selected' : ''}>Parcial</option></select></label>${field(claim, 'paidAmount', 'Valor efetivamente pago (R$)', 'number', 'min="0" step=".01"')}${claimFields(claim)}</div></article>`; }
  function claims() { const selected = claimMap(); return `<div class="labor-verba-picker"><fieldset><legend>Verbas trabalhistas</legend>${types.map(type => `<label><input data-toggle-claim="${type}" type="checkbox" ${selected.has(type) ? 'checked' : ''}> ${esc(label(type))}</label>`).join('')}</fieldset></div><div class="labor-claim-list">${[...selected.values()].map(claimCard).join('') || '<p class="empty">Selecione as verbas que constam do pedido ou título.</p>'}</div>`; }
  function settings() {
    const s = record.input.settings;
    const snapshot = record.indexSnapshot;
    return `<div class="form-grid">
      <div class="field"><label for="correctionType">Correção monetária</label><select id="correctionType"><option value="none" ${s.correctionType === 'none' ? 'selected' : ''}>Sem correção</option><option value="IPCA-E" ${s.correctionType === 'IPCA-E' ? 'selected' : ''}>IPCA-E</option><option value="IPCA" ${s.correctionType === 'IPCA' ? 'selected' : ''}>IPCA</option><option value="INPC" ${s.correctionType === 'INPC' ? 'selected' : ''}>INPC</option></select></div>
      <div class="field"><label for="interestType">Juros</label><select id="interestType"><option value="none" ${s.interestType === 'none' ? 'selected' : ''}>Sem juros</option><option value="fixed" ${s.interestType === 'fixed' ? 'selected' : ''}>Taxa fixa</option><option value="legal" ${s.interestType === 'legal' ? 'selected' : ''}>Taxa legal</option></select></div>
      <div class="field">${field({ type: 'settings', fixedMonthlyRate: s.fixedMonthlyRate }, 'fixedMonthlyRate', 'Juros simples mensais (%)', 'number', 'id="fixedMonthlyRate" min="0" step=".0001"').replace('data-claim="settings" data-key="fixedMonthlyRate"', '')}</div>
      <div class="field">${field({ type: 'settings', penaltyRate: s.penaltyRate }, 'penaltyRate', 'Multa (%)', 'number', 'id="penaltyRate" min="0" step=".01"').replace('data-claim="settings" data-key="penaltyRate"', '')}</div>
      <div class="field">${field({ type: 'settings', feeRate: s.feeRate }, 'feeRate', 'Honorários (%)', 'number', 'id="feeRate" min="0" step=".01"').replace('data-claim="settings" data-key="feeRate"', '')}</div>
      <div class="field full"><button class="secondary" type="button" data-action="indices">${snapshot ? 'Atualizar índices oficiais' : 'Carregar índices oficiais'}</button><span class="hint">${snapshot ? `Séries congeladas em ${new Date(snapshot.fetchedAt).toLocaleString('pt-BR')}.` : 'Obrigatório quando houver correção ou Taxa Legal.'}</span></div>
      <div class="field full legal-note"><strong>Alerta jurídico.</strong> Índices, taxa legal, multas e honorários devem ser confirmados no título e na legislação aplicável.</div>
    </div>`;
  }
  function result() { const r = record.result; const cards = [['Principal líquido', r.totals.original], ['Correção', r.totals.correction], ['Juros', r.totals.interest], ['Multa', r.totals.penalty], ['Honorários', r.totals.fees], ['Total atualizado', r.totals.total]]; return `<div class="summary">${cards.map(([name, value], index) => `<div class="metric ${index === 5 ? 'total' : ''}"><span>${name}</span><strong>${fmt(value)}</strong></div>`).join('')}</div><h2>Totais por verba</h2><div class="table-wrap"><table><thead><tr><th>Verba</th><th>Devido</th><th>Pago</th><th>Saldo</th><th>Atualizado</th></tr></thead><tbody>${r.claimTotals.map(item => `<tr><td>${esc(item.label)}</td><td>${fmt(item.original)}</td><td>${fmt(item.paid)}</td><td>${fmt(item.outstanding)}</td><td>${fmt(item.updated)}</td></tr>`).join('')}</tbody></table></div><h2>Ledger de cálculo</h2><div class="table-wrap"><table><thead><tr><th>Data</th><th>Lançamento</th><th>Original</th><th>Corrigido</th><th>Juros</th><th>Total</th></tr></thead><tbody>${r.ledger.map(item => `<tr><td>${item.date.split('-').reverse().join('/')}</td><td>${esc(item.description)}</td><td>${fmt(item.original)}</td><td>${fmt(item.corrected)}</td><td>${fmt(item.interest)}</td><td>${fmt(item.total)}</td></tr>`).join('')}</tbody></table></div><p class="legal-note">${esc(r.methodology.legalReview)}</p>`; }
  function render() { const content = [basic, salaries, claims, settings, result][step - 1](); app.innerHTML = `<section class="panel labor-wizard"><p class="eyebrow">Cálculos jurídicos</p><h1>Cálculo trabalhista</h1><p class="hint">${esc(record.code)} • versão ${esc(record.calculationVersion)}</p><ol class="wizard-steps steps-5">${stepList()}</ol><form id="labor-form">${content}<div class="wizard-actions"><button class="secondary" data-action="${step === 1 ? 'cancel' : 'back'}" type="button">${step === 1 ? 'Cancelar' : 'Voltar'}</button><div><button class="secondary" data-action="save" type="button">Salvar rascunho</button><button class="primary" type="submit">${step < 4 ? 'Próximo' : step === 4 ? 'Calcular' : 'Gerar PDF'}</button></div></div></form></section>`; }
  function captureAdditionalParties() { const context = caseContextApi?.partyContext(financeData, record.input, financeApi) || {}; record.input.additionalParties = [...document.querySelectorAll('[data-additional-index]')].map(row => { const source = row.querySelector('[data-additional-field="source"]')?.value || 'manual'; const selected = source.startsWith('case:') ? (context.caseParties || []).find(party => String(party.id) === source.slice(5)) : null; if (source.startsWith('case:')) return selected ? { ...selected, source: 'case', sourceId: selected.sourceId || selected.id } : null; return { id: row.dataset.additionalIndex || uuid(), name: row.querySelector('[data-additional-field="name"]')?.value.trim() || '', role: row.querySelector('[data-additional-field="role"]')?.value.trim() || '', source: 'manual', sourceId: '' }; }).filter(Boolean); }
  function captureBasic() { const values = new FormData(document.querySelector('#labor-form')); const i = record.input; ['clientId', 'caseId', 'role', 'caseNumber', 'opposingPartyName', 'partyType', 'admissionDate', 'terminationDate', 'calculationDate', 'prescriptionStart'].forEach(key => { i[key] = String(values.get(key) || ''); }); i.clientRole = i.partyType; const selectedClient = financeApi?.findClient(financeData, i.clientId); const selectedCase = financeApi?.findCase(financeData, i.caseId); if (!selectedClient) throw new Error('Vincule o cálculo a um cliente do Financeiro.'); if (i.caseId && (!selectedCase || String(selectedCase.clientId) !== String(i.clientId))) throw new Error('Selecione um caso pertencente ao cliente escolhido.'); const context = caseContextApi?.partyContext(financeData, i, financeApi) || {}; caseContextApi?.applyCaseContext(i, context); i.client = i.clientName; i.clientParty = context.clientParty; i.opposingParty = { ...(i.opposingParty || {}), name: i.opposingPartyName, role: context.opposingRole, source: 'manual', sourceId: '' }; i.party = i.opposingParty.name; i.partySource = 'manual'; captureAdditionalParties(); i.active = values.has('active'); i.prescription = values.has('prescription'); i.baseSalary = Number(values.get('baseSalary') || 0); i.divisor = Number(values.get('divisor') || 220); record.name = String(values.get('name') || '').trim(); if (!record.name || !i.admissionDate || !i.calculationDate || !i.opposingParty.name) throw new Error('Preencha nome, cliente, polo do cliente, parte contrária, admissão e data-base.'); if (!i.active && !i.terminationDate) throw new Error('Informe a demissão ou marque que o empregado permanece ativo.'); const end = employmentEnd(); if (end < i.admissionDate) throw new Error('O fim do vínculo não pode anteceder a admissão.'); if (i.prescription && !i.prescriptionStart) throw new Error('Informe o início da prescrição.'); i.startDate = i.prescription && i.prescriptionStart > i.admissionDate ? i.prescriptionStart : i.admissionDate; if (i.startDate > end) throw new Error('O início da prescrição não pode ser posterior ao fim do período calculado.'); i.endDate = end; const old = new Map(i.salaryRows.map(row => [row.competence, row])); i.salaryRows = labor.createSalaryRows({ ...i, salaryRows: [...old.values()] }); if (record.indexSnapshot && (record.indexSnapshot.start !== i.startDate.slice(0, 7) || record.indexSnapshot.end !== i.calculationDate.slice(0, 7))) record.indexSnapshot = null; }
  function captureSalaries() { document.querySelectorAll('[data-salary]').forEach(element => { const row = record.input.salaryRows.find(item => item.competence === element.dataset.salary); const key = element.dataset.key; row[key] = numericKeys.has(key) ? Number(element.value || 0) : element.value; }); }
  function captureClaims() { document.querySelectorAll('[data-claim]').forEach(element => { const claim = claimMap().get(element.dataset.claim); if (!claim) return; const key = element.dataset.key; claim[key] = element.type === 'checkbox' ? element.checked : numericKeys.has(key) ? Number(element.value || 0) : element.value; }); record.input.claims.forEach(claim => { if (['family_salary', 'meal_voucher', 'transport_voucher'].includes(claim.type)) claim.value = Number(claim.quantity || 0) * Number(claim.unitValue || 0); if (claim.type === 'unemployment_insurance') claim.value = Number(claim.installments || 0) * Number(claim.installmentValue || 0); if (claim.type === 'commissions') claim.value = Number(claim.dueAmount || 0); if (claim.type === 'dsr') { const month = new Date(`${claim.dueDate}T00:00:00Z`); const ratio = Number(claim.days || 0) / new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate(); claim.percentage = ratio * (claim.double ? 200 : 100); } }); }
  function captureSettings() { const s = record.input.settings; ['correctionType', 'interestType'].forEach(key => { s[key] = document.querySelector(`#${key}`).value; }); ['fixedMonthlyRate', 'penaltyRate', 'feeRate'].forEach(key => { s[key] = Number(document.querySelector(`#${key}`).value || 0); }); }
  async function loadIndices() { captureSettings(); const s = record.input.settings; notify('Carregando séries oficiais…'); record.indexSnapshot = await indices.snapshot({ correctionType: s.correctionType, interestType: s.interestType, start: record.input.startDate, end: record.input.calculationDate }); s.correctionRates = record.indexSnapshot.correctionRates; s.legalRates = record.indexSnapshot.legalRates; persist('draft', true); notify('Índices oficiais carregados e congelados neste rascunho.'); render(); }
  function calculate() { captureSettings(); const s = record.input.settings; const snapshot = record.indexSnapshot; const needsSnapshot = s.correctionType !== 'none' || s.interestType === 'legal'; const snapshotMatches = snapshot && snapshot.correctionType === s.correctionType && (s.interestType !== 'legal' || Object.keys(snapshot.legalRates || {}).length > 0); if (needsSnapshot && !snapshotMatches) throw new Error('Carregue novamente os índices oficiais para os critérios selecionados.'); s.correctionRates = snapshot?.correctionRates || {}; s.legalRates = snapshot?.legalRates || {}; if (!record.input.claims.length) throw new Error('Selecione ao menos uma verba.'); record.result = labor.calculateLabor(record.input); persist('final', true); step = 5; }
  function makePdf() { const pdf = window.OfficeJurLaborPdf; if (!pdf?.create || !pdf.download) throw new Error('O gerador de PDF trabalhista não foi carregado.'); Promise.resolve(pdf.create(record)).then(file => { pdf.download(file); notify('PDF gerado.'); }).catch(error => notify(error.message || 'Falha ao gerar PDF.', true)); }
  function captureVisible() { if (step === 1) captureBasic(); if (step === 2) captureSalaries(); if (step === 3) captureClaims(); if (step === 4) captureSettings(); }
  app.addEventListener('input', event => { if (event.target.name === 'opposingPartyName') { record.input.partySource = 'manual'; record.input.opposingParty = { ...(record.input.opposingParty || {}), name: event.target.value, role: caseContextApi?.oppositeRole(record.input.partyType) || '' , source: 'manual' }; } if (event.target.dataset.additionalField) record.input.partySource = 'manual'; });
  app.addEventListener('change', event => {
    if (event.target.id === 'clientId') {
      try { captureAdditionalParties(); captureBasic(); } catch (_) { record.name = String(new FormData(document.querySelector('#labor-form')).get('name') || record.name); }
      record.input.clientId = event.target.value;
      record.input.clientName = '';
      record.input.caseId = '';
      record.input.caseName = '';
      record.input.caseNumber = '';
      removeImportedAdditionalParties();
      const context = caseContextApi?.partyContext(financeData, record.input, financeApi) || {};
      caseContextApi?.applyCaseContext(record.input, context);
      record.input.clientParty = context.clientParty;
      render();
      return;
    }
    if (event.target.id === 'caseId') {
      try { captureAdditionalParties(); captureBasic(); } catch (_) { record.name = String(new FormData(document.querySelector('#labor-form')).get('name') || record.name); }
      removeImportedAdditionalParties();
      record.input.caseId = event.target.value;
      const context = caseContextApi?.partyContext(financeData, record.input, financeApi) || {};
      caseContextApi?.applyCaseContext(record.input, context);
      record.input.clientParty = context.clientParty;
      render();
      return;
    }
    if (event.target.id === 'partyType') {
      try { captureBasic(); } catch (_) { record.input.partyType = event.target.value; }
      record.input.partyType = event.target.value;
      record.input.clientRole = event.target.value;
      record.input.clientParty = null;
      render();
      return;
    }
    if (event.target.dataset.additionalField === 'source') {
      try { captureBasic(); } catch (_) {}
      render();
      return;
    }
    const actionType = event.target.dataset.toggleClaim;
    if (!actionType) return;
    captureClaims();
    if (event.target.checked && !claimMap().has(actionType)) record.input.claims.push(blankClaim(actionType));
    if (!event.target.checked) record.input.claims = record.input.claims.filter(claim => claim.type !== actionType);
    render();
  });
  app.addEventListener('click', async event => { const action = event.target.closest('[data-action]')?.dataset.action; if (!action) return; try { if (action === 'cancel') { window.location.href = '../'; return; } if (action === 'back') { captureVisible(); step = Math.max(1, step - 1); render(); } if (action === 'save') { captureVisible(); persist(); } if (action === 'indices') await loadIndices(); if (action === 'add-additional') { try { captureBasic(); } catch (_) { captureAdditionalParties(); } record.input.additionalParties.push({ id: uuid(), name: '', role: '', source: 'manual', sourceId: '' }); render(); } if (action === 'remove-additional') { try { captureBasic(); } catch (_) { captureAdditionalParties(); } record.input.additionalParties.splice(Number(event.target.closest('[data-action]').dataset.index), 1); render(); } } catch (error) { notify(error.message || 'Não foi possível salvar esta etapa.', true); } });
  app.addEventListener('submit', event => { event.preventDefault(); try { if (step < 4) { captureVisible(); step += 1; } else if (step === 4) calculate(); else makePdf(); render(); } catch (error) { notify(error.message || 'Não foi possível concluir esta etapa.', true); } });
  function loadRequestedRecord() {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('id');
    if (!requested) return;
    const found = data.records.find(item => item.id === requested && item.type === 'labor');
    if (!found) { notify('Cálculo trabalhista não encontrado.', true); return; }
    record = structuredClone(found);
    step = record.result ? 5 : 1;
    pendingPdf = params.get('pdf') === '1' && !!record.result;
  }
  async function initialize() {
    localAccessAllowed = await access?.guard('calculos', () => { storage.clear(); data = storage.normalize({}); }) ?? true;
    if (!localAccessAllowed) { showBlocked(); return; }
    data = storage.load();
    try { financeData = await financeApi?.load?.() || { clients: [], cases: [], loaded: false }; } catch (error) { financeData = { clients: [], cases: [], loaded: false }; notify(`Não foi possível carregar os clientes do Financeiro: ${error.message}`, true); }
    await sync.fromGist();
    if (!localAccessAllowed) { showBlocked(); return; }
    try { access?.canSync(gistSettings.load().gistId); } catch (_) { showBlocked(); return; }
    loadRequestedRecord();
    render();
    if (pendingPdf) setTimeout(() => makePdf(), 0);
  }
  function showBlocked() {
    localAccessAllowed = false;
    data = storage.normalize({});
    window.OfficeJurLocalAccessBlocked?.render({
      container: app,
      settingsHref: '../../configuracoes/',
      statusElement: syncStatus,
      footer: document.querySelector('office-site-footer'),
    });
  }
  access?.subscribe(lease => {
    if (['stale', 'unverified', 'purging', 'purged'].includes(lease.phase)) showBlocked();
  });
  void initialize();
})();
